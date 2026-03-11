/**
 * 자동 자산 차감 서비스
 * - 카드 결제일에 연결 계좌에서 자동 차감
 * - 대출 상환일에 연결 계좌에서 자동 차감 + 기록탭에 지출 기록
 *
 * 핵심 원칙:
 * - 대출/할부: paidMonths + startDate 기반으로 다음 납부일 판단 (AsyncStorage 의존 제거)
 * - 카드 결제: 이번 달만 처리 (이전 달 소급 처리 금지)
 * - AsyncStorage는 이중 실행 방지용 보조 안전장치로만 사용
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAssetStore } from '../stores/assetStore';
import { useCardStore } from '../stores/cardStore';
import { useDebtStore } from '../stores/debtStore';
import { useLedgerStore } from '../stores/ledgerStore';
import { useAuthStore } from '../stores/authStore';
import { calculateAllCardsPayment } from '../utils/cardPaymentCalculator';
import { createLoanRepaymentRecordData } from './debtAutoRecord';
import { Card } from '../types/card';
import { Loan, Installment } from '../types/debt';
import { Expense } from '../types/ledger';
import { generateRepaymentSchedule } from '../utils/debtCalculator';
import { formatLocalCurrency } from './currencyService';
import i18n from '../i18n';

const STORAGE_KEYS = {
  LAST_CARD_DEDUCTION: 'lastCardDeduction', // { cardId: 'YYYY-MM' }
  LAST_LOAN_DEDUCTION: 'lastLoanDeduction', // { loanId: 'YYYY-MM' }
  LAST_INSTALLMENT_DEDUCTION: 'lastInstallmentDeduction', // { installmentId: 'YYYY-MM' }
  PENDING_LOAN_TX: 'pendingLoanTransaction', // { loanId, yearMonth, step, paidMonths, remainingPrincipal }
  PENDING_CARD_TX: 'pendingCardTransaction', // { cardId, yearMonth, step, amount }
};

// ─── 유틸리티 함수 ────────────────────────────────────────────

/**
 * 오늘 날짜 (시간 제거, 날짜 비교용)
 */
function getToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/**
 * Date → 'YYYY-MM' 형식
 */
function toYearMonth(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * paidMonths 기반으로 다음 납부일 계산
 *
 * 스케줄 규칙 (generateRepaymentSchedule과 동일):
 *   1회차 = startDate + 1개월
 *   N회차 = startDate + N개월
 * 따라서 다음 납부 = startDate + (paidMonths + 1)개월의 paymentDay일
 *
 * @param startDate 시작일 (YYYY-MM-DD)
 * @param paidMonths 이미 납부한 회차 수
 * @param paymentDay 납부일 (1~31, 해당 월의 마지막 날 초과 시 자동 조정)
 */
function getNextPaymentDate(startDate: string, paidMonths: number, paymentDay: number): Date {
  const start = new Date(startDate);
  const nextPaymentNumber = paidMonths + 1; // 다음 회차 (1-based)

  // startDate + nextPaymentNumber 개월 후의 월
  const targetYear = start.getFullYear();
  const targetMonth = start.getMonth() + nextPaymentNumber; // JS Date가 자동으로 연도 넘김 처리
  const firstOfMonth = new Date(targetYear, targetMonth, 1);

  // 해당 월의 마지막 날 확인 (예: 2월은 28/29일)
  const lastDayOfMonth = new Date(firstOfMonth.getFullYear(), firstOfMonth.getMonth() + 1, 0).getDate();
  const day = Math.min(paymentDay, lastDayOfMonth);

  return new Date(firstOfMonth.getFullYear(), firstOfMonth.getMonth(), day);
}

// ─── 카드 결제일 자동 차감 ──────────────────────────────────────

/**
 * 카드 결제일 자동 차감 처리
 *
 * 카드는 paidMonths 개념이 없으므로 AsyncStorage 기반 유지.
 * 단, 이전 달 소급 처리는 제거 — 이번 달만 처리.
 */
export async function processCardPayments(): Promise<{
  processed: number;
  skipped: number;
  errors: string[];
  warnings: Array<{ assetName: string; requested: number; actual: number }>;
}> {
  const result = { processed: 0, skipped: 0, errors: [] as string[], warnings: [] as Array<{ assetName: string; requested: number; actual: number }> };

  const encryptionKey = useAuthStore.getState().getEncryptionKey();
  if (!encryptionKey) {
    result.errors.push(i18n.t('errors.authRequired'));
    return result;
  }

  const { cards } = useCardStore.getState();
  const { records } = useLedgerStore.getState();
  const { installments } = useDebtStore.getState();
  const { adjustAssetBalance } = useAssetStore.getState();

  // 마지막 차감 기록 로드
  const lastDeductionStr = await AsyncStorage.getItem(STORAGE_KEYS.LAST_CARD_DEDUCTION);
  const lastDeduction: Record<string, string> = lastDeductionStr
    ? JSON.parse(lastDeductionStr)
    : {};

  // 미완료 카드 트랜잭션 복구 (보수적: pre_deduction → pending 삭제)
  try {
    const pendingCardStr = await AsyncStorage.getItem(STORAGE_KEYS.PENDING_CARD_TX);
    if (pendingCardStr) {
      const pending = JSON.parse(pendingCardStr);
      console.warn(`[AutoDeduction] 카드 pending TX 복구: ${pending.cardId} (${pending.yearMonth}, step: ${pending.step}) — 보수적 삭제 (미차감 허용)`);
      await AsyncStorage.removeItem(STORAGE_KEYS.PENDING_CARD_TX);
    }
  } catch {
    await AsyncStorage.removeItem(STORAGE_KEYS.PENDING_CARD_TX).catch(() => {});
  }

  // 결제 계좌가 연결된 카드만 필터링
  const linkedCards = cards.filter(
    (card): card is Card & { linkedAssetId: string; paymentDay: number } =>
      !!card.linkedAssetId && !!card.paymentDay
  );

  const today = getToday();
  const todayDay = today.getDate();
  const currentYearMonth = toYearMonth(today);

  // 각 카드의 결제 예정액 계산 (오늘 기준)
  const cardPayments = calculateAllCardsPayment(cards, records, installments);

  for (const card of linkedCards) {
    try {
      // ① 이번 달 결제일이 아직 안 왔으면 스킵
      const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
      const effectivePayDay = Math.min(card.paymentDay, lastDay);
      if (todayDay < effectivePayDay) {
        continue;
      }

      // ② 이미 이번 달 처리했으면 스킵
      if (lastDeduction[card.id] === currentYearMonth) {
        result.skipped++;
        continue;
      }

      // ③ 카드 생성일이 이번 달 이후면 스킵 (미래 카드 방지)
      const cardCreated = new Date(card.createdAt);
      if (toYearMonth(cardCreated) > currentYearMonth) {
        continue;
      }

      // ④ 결제 예정액 찾기
      const paymentEntry = cardPayments.find((p) => p.current.cardId === card.id);
      const payment = paymentEntry?.current;
      if (!payment || payment.totalPayment <= 0) {
        console.log(`[AutoDeduction] 카드 ${card.name}: 결제 예정액 없음`);
        lastDeduction[card.id] = currentYearMonth;
        await AsyncStorage.setItem(STORAGE_KEYS.LAST_CARD_DEDUCTION, JSON.stringify(lastDeduction));
        continue;
      }

      // ⑤ pending TX 저장 (자산 차감 전 — 크래시 시 보수적으로 삭제)
      await AsyncStorage.setItem(
        STORAGE_KEYS.PENDING_CARD_TX,
        JSON.stringify({ cardId: card.id, yearMonth: currentYearMonth, step: 'pre_deduction', amount: payment.totalPayment })
      );

      // ⑥ 자산에서 차감
      const balanceResult = await adjustAssetBalance(
        card.linkedAssetId,
        -payment.totalPayment,
        encryptionKey
      );
      if (balanceResult.clamped) {
        result.warnings.push({ assetName: balanceResult.assetName, requested: balanceResult.requested, actual: balanceResult.actual });
      }

      // ⑦ pending 제거 (차감 완료)
      await AsyncStorage.removeItem(STORAGE_KEYS.PENDING_CARD_TX);

      // ⑧ 처리 기록 저장
      lastDeduction[card.id] = currentYearMonth;
      await AsyncStorage.setItem(STORAGE_KEYS.LAST_CARD_DEDUCTION, JSON.stringify(lastDeduction));
      result.processed++;

      console.log(
        `[AutoDeduction] 카드 ${card.name}: ${payment.totalPayment.toLocaleString()}원 차감 완료 (${currentYearMonth})`
      );
    } catch (error) {
      const errorMsg = `카드 ${card.name} 차감 실패: ${error}`;
      result.errors.push(errorMsg);
      console.error('[AutoDeduction]', errorMsg);
    }
  }

  return result;
}

// ─── 대출 상환일 자동 차감 ──────────────────────────────────────

/**
 * 대출 상환일 자동 차감 처리
 *
 * paidMonths + startDate 기반으로 다음 상환일 판단.
 * 밀린 회차가 있으면 순차적으로 처리 (paidMonths가 진실의 원천).
 */
export async function processLoanRepayments(): Promise<{
  processed: number;
  skipped: number;
  errors: string[];
  warnings: Array<{ assetName: string; requested: number; actual: number }>;
}> {
  const result = { processed: 0, skipped: 0, errors: [] as string[], warnings: [] as Array<{ assetName: string; requested: number; actual: number }> };

  const encryptionKey = useAuthStore.getState().getEncryptionKey();
  if (!encryptionKey) {
    result.errors.push(i18n.t('errors.authRequired'));
    return result;
  }

  const { loans, updateLoan } = useDebtStore.getState();
  const { adjustAssetBalance } = useAssetStore.getState();

  // AsyncStorage: 이중 실행 방지 보조 안전장치
  const lastDeductionStr = await AsyncStorage.getItem(STORAGE_KEYS.LAST_LOAN_DEDUCTION);
  const lastDeduction: Record<string, string> = lastDeductionStr
    ? JSON.parse(lastDeductionStr)
    : {};

  // 미완료 트랜잭션 복구 (앱 크래시 복구용)
  await recoverPendingLoanTransaction(encryptionKey, lastDeduction, result);

  // 활성 상태인 대출 필터링 (linkedAssetId 유무 불문)
  const activeLoans = loans.filter((loan) => loan.status === 'active');

  const today = getToday();

  for (const loan of activeLoans) {
    let currentPaidMonths = loan.paidMonths;
    let currentRemainingPrincipal = loan.remainingPrincipal;

    try {
      // 상환일 (repaymentDay가 없으면 시작일의 일(day) 사용)
      const repaymentDay = loan.repaymentDay ?? parseInt(loan.startDate.split('-')[2]);

      // ═══ Phase 1: 과거 회차 소급 생성 (backfill) ═══
      // months 1 ~ paidMonths 중 기록이 없는 회차만 생성
      // 자산 차감 없음 (이미 처리된 과거), paidMonths 변경 없음
      if (loan.paidMonths > 0) {
        const schedule = generateRepaymentSchedule(
          loan.principal,
          loan.interestRate,
          loan.termMonths,
          loan.repaymentType,
          loan.startDate
        );

        for (let month = 1; month <= loan.paidMonths; month++) {
          const payment = schedule.find((s) => s.month === month);
          if (!payment) continue;

          // 매 회차마다 최신 records 조회 (stale 방지)
          const currentRecords = useLedgerStore.getState().records;
          const exists = currentRecords.some(
            (r) =>
              r.type === 'expense' &&
              (r as Expense).linkedLoanId === loan.id &&
              r.date === payment.date
          );
          if (exists) continue;

          // 지출 기록 생성 (자산 차감 없음)
          const memo = i18n.t('notifications.loanRepaymentMemo', {
            name: loan.name,
            current: month,
            total: loan.termMonths,
            principal: formatLocalCurrency(payment.principal),
            interest: formatLocalCurrency(payment.interest),
          });

          const { addExpense } = useLedgerStore.getState();
          await addExpense({
            date: payment.date,
            amount: payment.total,
            currency: 'KRW',
            category: 'finance',
            paymentMethod: 'bank',
            cardId: null,
            installmentMonths: null,
            isInterestFree: null,
            installmentId: null,
            memo,
            linkedAssetId: null,
            linkedLoanId: loan.id,
            isAutoGenerated: true,
          });
          console.log(`[AutoDeduction] 대출 ${loan.name}: ${month}/${loan.termMonths}회차 소급 기록 생성`);
        }
      }

      // ═══ Phase 2: 미래 미납 회차 처리 ═══
      // paidMonths 기반으로 밀린 회차를 순차 처리
      while (currentPaidMonths < loan.termMonths) {
        let iterationFailed = false;
        try {
          // 다음 상환일 계산: startDate + (paidMonths + 1)개월의 repaymentDay일
          const nextPaymentDate = getNextPaymentDate(loan.startDate, currentPaidMonths, repaymentDay);

          // 아직 상환일이 안 왔으면 중단
          if (today < nextPaymentDate) {
            break;
          }

          // AsyncStorage 이중 실행 방지
          const yearMonth = toYearMonth(nextPaymentDate);
          if (lastDeduction[loan.id] === yearMonth) {
            result.skipped++;
            break;
          }

          // 기록 데이터 미리 생성 (중복 체크 + 실제 기록 생성에 사용)
          const recordData = createLoanRepaymentRecordData({
            ...loan,
            paidMonths: currentPaidMonths,
            remainingPrincipal: currentRemainingPrincipal,
          });

          // 기록 기반 중복 체크 (자산 차감 전에 수행 — sentinel 유실 시 안전장치)
          let isDuplicate = false;
          if (recordData) {
            const currentRecords = useLedgerStore.getState().records;
            isDuplicate = currentRecords.some(
              (r) =>
                r.type === 'expense' &&
                (r as Expense).linkedLoanId === loan.id &&
                r.date === recordData.date
            );
            if (isDuplicate) {
              console.log(
                `[AutoDeduction] 대출 ${loan.name}: 동일 기록 존재, 차감/기록 스킵 (${yearMonth})`
              );
            }
          }

          // 잔여 원금 계산 (상환 방식에 따라 다름) — 상태 변경 전에 먼저 계산
          const newPaidMonths = currentPaidMonths + 1;
          const isCompleted = newPaidMonths >= loan.termMonths;
          let newRemainingPrincipal = currentRemainingPrincipal;
          if (isCompleted) {
            // 마지막 회차: 잔여금 0으로 확정 (부동소수점 오차 누적 방지)
            newRemainingPrincipal = 0;
          } else if (loan.repaymentType === 'equalPrincipal') {
            const monthlyPrincipal = loan.principal / loan.termMonths;
            newRemainingPrincipal = Math.max(0, Math.round(currentRemainingPrincipal - monthlyPrincipal));
          } else if (loan.repaymentType === 'equalPrincipalAndInterest') {
            const monthlyInterest = (currentRemainingPrincipal * loan.interestRate) / 100 / 12;
            const monthlyPrincipal = loan.monthlyPayment - monthlyInterest;
            newRemainingPrincipal = Math.max(0, Math.round(currentRemainingPrincipal - monthlyPrincipal));
          }

          // 중복이 아닌 경우에만 자산 차감 + 기록 생성
          if (!isDuplicate) {
            // Step 1~3: 연결 계좌가 있는 경우에만 자산 차감 (pending TX 포함)
            if (loan.linkedAssetId) {
              // Step 1: pending transaction 저장 (차감 전 — 크래시 시 무시됨)
              const pendingData = {
                loanId: loan.id,
                yearMonth,
                step: 'pre_deduction',
                newPaidMonths,
                newRemainingPrincipal: Math.round(newRemainingPrincipal),
                isCompleted,
                monthlyPayment: loan.monthlyPayment,
                loanName: loan.name,
              };
              await AsyncStorage.setItem(STORAGE_KEYS.PENDING_LOAN_TX, JSON.stringify(pendingData));

              // Step 2: 자산에서 차감
              const balanceResult = await adjustAssetBalance(
                loan.linkedAssetId,
                -loan.monthlyPayment,
                encryptionKey
              );
              if (balanceResult.clamped) {
                result.warnings.push({ assetName: balanceResult.assetName, requested: balanceResult.requested, actual: balanceResult.actual });
              }

              // Step 3: pending을 'asset_deducted'로 업데이트 (차감 완료 확인)
              pendingData.step = 'asset_deducted';
              await AsyncStorage.setItem(STORAGE_KEYS.PENDING_LOAN_TX, JSON.stringify(pendingData));
            }

            // Step 4: 기록탭에 지출 자동 기록
            if (recordData) {
              const { addExpense } = useLedgerStore.getState();
              await addExpense({
                date: recordData.date,
                amount: recordData.amount,
                currency: 'KRW',
                category: recordData.category,
                paymentMethod: recordData.paymentMethod,
                cardId: null,
                installmentMonths: null,
                isInterestFree: null,
                installmentId: null,
                memo: recordData.memo,
                linkedAssetId: null, // 자산 차감은 위에서 별도 처리
                linkedLoanId: recordData.linkedLoanId,
                isAutoGenerated: recordData.isAutoGenerated,
              });
              console.log(`[AutoDeduction] 대출 ${loan.name}: 기록탭에 지출 기록 추가됨`);
            }
          }

          // Step 5: 대출 상환 상태 업데이트 (항상 실행 — 중복이든 아니든 paidMonths 갱신)
          await updateLoan(
            loan.id,
            {
              paidMonths: newPaidMonths,
              remainingPrincipal: Math.round(newRemainingPrincipal),
              status: isCompleted ? 'completed' : 'active',
            },
            encryptionKey
          );

          // Step 5-1: 상환 기록 납부 완료 마킹 (항상 실행, fallback으로 안정성 보장)
          const { getRecordsForLoan, markRecordAsPaid } = useDebtStore.getState();
          const record = getRecordsForLoan(loan.id).find((r) => r.month === newPaidMonths);
          await markRecordAsPaid(
            record?.id ?? '',
            encryptionKey,
            { loanId: loan.id, month: newPaidMonths }
          );

          // Step 6: pending 제거 (연결 계좌가 있는 경우에만)
          if (!isDuplicate && loan.linkedAssetId) {
            await AsyncStorage.removeItem(STORAGE_KEYS.PENDING_LOAN_TX);
          }

          // 로컬 추적 변수 갱신
          currentPaidMonths = newPaidMonths;
          currentRemainingPrincipal = Math.round(newRemainingPrincipal);

          // AsyncStorage 보조 기록 저장
          lastDeduction[loan.id] = yearMonth;
          await AsyncStorage.setItem(
            STORAGE_KEYS.LAST_LOAN_DEDUCTION,
            JSON.stringify(lastDeduction)
          );
          result.processed++;

          console.log(
            `[AutoDeduction] 대출 ${loan.name}: ${isDuplicate ? '(중복 스킵) ' : ''}${loan.monthlyPayment.toLocaleString()}원 처리 완료 (${newPaidMonths}/${loan.termMonths}회차, ${yearMonth})`
          );
        } catch (iterError) {
          console.error(
            `[AutoDeduction] 대출 ${loan.name}: ${currentPaidMonths + 1}회차 처리 중 오류, 루프 중단:`,
            iterError
          );
          result.errors.push(
            `대출 ${loan.name} ${currentPaidMonths + 1}회차 실패: ${iterError}`
          );
          iterationFailed = true;
        }
        if (iterationFailed) break;
      }
    } catch (error) {
      const errorMsg = `대출 ${loan.name} 차감 실패: ${error}`;
      result.errors.push(errorMsg);
      console.error('[AutoDeduction]', errorMsg);
    }
  }

  return result;
}

// ─── 할부 결제일 상태 업데이트 ──────────────────────────────────

/**
 * 할부 결제일 상태 업데이트
 *
 * paidMonths + startDate 기반으로 다음 결제일 판단.
 * 은행 차감은 processCardPayments()에서 처리 (installmentPayments 포함).
 * 지출 기록은 구매 시점에 이미 전액 기록됨 (이중 계상 방지).
 */
export async function processInstallmentPayments(): Promise<{
  processed: number;
  skipped: number;
  errors: string[];
}> {
  const result = { processed: 0, skipped: 0, errors: [] as string[] };

  const encryptionKey = useAuthStore.getState().getEncryptionKey();
  if (!encryptionKey) {
    result.errors.push(i18n.t('errors.authRequired'));
    return result;
  }

  const { cards } = useCardStore.getState();
  const { installments, updateInstallment } = useDebtStore.getState();

  // AsyncStorage: 이중 실행 방지 보조 안전장치
  const lastDeductionStr = await AsyncStorage.getItem(STORAGE_KEYS.LAST_INSTALLMENT_DEDUCTION);
  const lastDeduction: Record<string, string> = lastDeductionStr
    ? JSON.parse(lastDeductionStr)
    : {};

  // 활성 할부만 필터링
  const activeInstallments = installments.filter((i) => i.status === 'active');
  const today = getToday();

  for (const installment of activeInstallments) {
    let currentPaidMonths = installment.paidMonths;
    let currentRemainingAmount = installment.remainingAmount;

    try {
      // 해당 카드 찾기
      const card = cards.find((c) => c.id === installment.cardId);
      if (!card || !card.paymentDay) {
        continue;
      }

      // paidMonths 기반으로 밀린 회차를 순차 처리
      while (currentPaidMonths < installment.months) {
        // 다음 결제일 계산: startDate + (paidMonths + 1)개월의 카드 paymentDay일
        const nextPaymentDate = getNextPaymentDate(installment.startDate, currentPaidMonths, card.paymentDay);

        // 아직 결제일이 안 왔으면 중단
        if (today < nextPaymentDate) {
          break;
        }

        // AsyncStorage 이중 실행 방지
        const yearMonth = toYearMonth(nextPaymentDate);
        if (lastDeduction[installment.id] === yearMonth) {
          result.skipped++;
          break;
        }

        // 할부 상태 업데이트 (은행 차감은 processCardPayments에서 처리)
        const newPaidMonths = currentPaidMonths + 1;
        const isCompleted = newPaidMonths >= installment.months;
        const newRemainingAmount = Math.max(0, currentRemainingAmount - installment.monthlyPayment);

        await updateInstallment(
          installment.id,
          {
            paidMonths: newPaidMonths,
            remainingAmount: Math.round(newRemainingAmount),
            status: isCompleted ? 'completed' : 'active',
          },
          encryptionKey
        );

        // 로컬 추적 변수 갱신
        currentPaidMonths = newPaidMonths;
        currentRemainingAmount = Math.round(newRemainingAmount);

        // AsyncStorage 보조 기록 저장
        lastDeduction[installment.id] = yearMonth;
        await AsyncStorage.setItem(
          STORAGE_KEYS.LAST_INSTALLMENT_DEDUCTION,
          JSON.stringify(lastDeduction)
        );
        result.processed++;

        console.log(
          `[AutoDeduction] 할부 ${installment.storeName}: 상태 업데이트 (${newPaidMonths}/${installment.months}회차, ${yearMonth})`
        );
      }
    } catch (error) {
      const errorMsg = `할부 ${installment.storeName} 처리 실패: ${error}`;
      result.errors.push(errorMsg);
      console.error('[AutoDeduction]', errorMsg);
    }
  }

  return result;
}


/**
 * 모든 자동 차감 처리 (앱 시작 시 호출)
 */
export async function processAllAutoDeductions(): Promise<{
  cards: { processed: number; skipped: number; errors: string[]; warnings: Array<{ assetName: string; requested: number; actual: number }> };
  loans: { processed: number; skipped: number; errors: string[]; warnings: Array<{ assetName: string; requested: number; actual: number }> };
  installments: { processed: number; skipped: number; errors: string[] };
}> {
  console.log('[AutoDeduction] 자동 차감 처리 시작...');

  // 순차 실행: 같은 자산(계좌)을 동시에 수정하면 race condition 발생 가능
  const cardResult = await processCardPayments();
  const loanResult = await processLoanRepayments();
  const installmentResult = await processInstallmentPayments();

  console.log('[AutoDeduction] 카드 결과:', cardResult);
  console.log('[AutoDeduction] 대출 결과:', loanResult);
  console.log('[AutoDeduction] 할부 결과:', installmentResult);

  return { cards: cardResult, loans: loanResult, installments: installmentResult };
}

/**
 * 미완료 대출 트랜잭션 복구
 * 앱 크래시로 인해 자산 차감은 됐지만 대출 상태가 미업데이트된 경우 복구
 */
async function recoverPendingLoanTransaction(
  encryptionKey: string,
  lastDeduction: Record<string, string>,
  result: { processed: number; skipped: number; errors: string[]; warnings: Array<{ assetName: string; requested: number; actual: number }> }
): Promise<void> {
  try {
    const pendingStr = await AsyncStorage.getItem(STORAGE_KEYS.PENDING_LOAN_TX);
    if (!pendingStr) return;

    const pending = JSON.parse(pendingStr) as {
      loanId: string;
      yearMonth: string;
      step: string;
      newPaidMonths: number;
      newRemainingPrincipal: number;
      isCompleted: boolean;
      monthlyPayment?: number;
      loanName?: string;
    };

    console.log(`[AutoDeduction] 미완료 대출 트랜잭션 복구: ${pending.loanId} (${pending.yearMonth}, step: ${pending.step})`);

    // pre_deduction: 자산 차감 전 또는 차감 직후(asset_deducted 기록 전) 크래시
    // 보수적 접근: pending 삭제 (이중차감보다 한 달 미차감이 안전)
    if (pending.step === 'pre_deduction') {
      console.warn('[AutoDeduction] pre_deduction 상태 — 보수적 삭제 (차감 여부 불확실, 미차감 허용)');
      await AsyncStorage.removeItem(STORAGE_KEYS.PENDING_LOAN_TX);
      return;
    }

    // asset_deducted: 자산은 차감됐지만 기록/상태 미업데이트 → 나머지 완료
    if (pending.step === 'asset_deducted' && pending.monthlyPayment) {
      try {
        const { addExpense } = useLedgerStore.getState();
        await addExpense({
          date: `${pending.yearMonth}-01`,
          amount: pending.monthlyPayment,
          currency: 'KRW',
          category: i18n.t('categories.loanRepayment'),
          paymentMethod: 'bank',
          cardId: null,
          installmentMonths: null,
          isInterestFree: null,
          installmentId: null,
          memo: `[${i18n.t('recurring.auto')}] ${pending.loanName || pending.loanId}`,
          linkedAssetId: null, // 이미 차감됨
        });
      } catch {
        console.error('[AutoDeduction] 복구 중 기록 생성 실패 (무시하고 계속)');
      }
    }

    // 대출 상태 업데이트
    const { updateLoan, getRecordsForLoan, markRecordAsPaid } = useDebtStore.getState();
    await updateLoan(
      pending.loanId,
      {
        paidMonths: pending.newPaidMonths,
        remainingPrincipal: pending.newRemainingPrincipal,
        status: pending.isCompleted ? 'completed' : 'active',
      },
      encryptionKey
    );

    // 상환 기록 납부 완료 마킹 (fallback으로 안정성 보장)
    const record = getRecordsForLoan(pending.loanId).find((r) => r.month === pending.newPaidMonths);
    await markRecordAsPaid(
      record?.id ?? '',
      encryptionKey,
      { loanId: pending.loanId, month: pending.newPaidMonths }
    );

    // 차감 기록 + pending 제거
    lastDeduction[pending.loanId] = pending.yearMonth;
    await AsyncStorage.setItem(STORAGE_KEYS.LAST_LOAN_DEDUCTION, JSON.stringify(lastDeduction));
    await AsyncStorage.removeItem(STORAGE_KEYS.PENDING_LOAN_TX);

    result.processed++;
    console.log(`[AutoDeduction] 대출 트랜잭션 복구 완료: ${pending.loanId}`);
  } catch (error) {
    console.error('[AutoDeduction] 트랜잭션 복구 실패:', error);
    // 복구 실패해도 pending은 제거하여 무한 재시도 방지
    await AsyncStorage.removeItem(STORAGE_KEYS.PENDING_LOAN_TX);
  }
}

/**
 * 특정 카드/대출의 차감 기록 초기화 (테스트용)
 */
export async function resetDeductionRecord(
  type: 'card' | 'loan',
  id: string
): Promise<void> {
  const key =
    type === 'card'
      ? STORAGE_KEYS.LAST_CARD_DEDUCTION
      : STORAGE_KEYS.LAST_LOAN_DEDUCTION;

  const recordStr = await AsyncStorage.getItem(key);
  if (recordStr) {
    const record = JSON.parse(recordStr);
    delete record[id];
    await AsyncStorage.setItem(key, JSON.stringify(record));
  }
}
