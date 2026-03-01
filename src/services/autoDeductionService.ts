/**
 * 자동 자산 차감 서비스
 * - 카드 결제일에 연결 계좌에서 자동 차감
 * - 대출 상환일에 연결 계좌에서 자동 차감 + 기록탭에 지출 기록
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
import { Loan } from '../types/debt';
import i18n from '../i18n';

const STORAGE_KEYS = {
  LAST_CARD_DEDUCTION: 'lastCardDeduction', // { cardId: 'YYYY-MM' }
  LAST_LOAN_DEDUCTION: 'lastLoanDeduction', // { loanId: 'YYYY-MM' }
  LAST_INSTALLMENT_DEDUCTION: 'lastInstallmentDeduction', // { installmentId: 'YYYY-MM' }
};

/**
 * 오늘 날짜 정보 가져오기
 */
function getTodayInfo() {
  const today = new Date();
  return {
    year: today.getFullYear(),
    month: today.getMonth() + 1,
    day: today.getDate(),
    yearMonth: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`,
  };
}

/**
 * 처리해야 할 월(들)을 반환.
 * paymentDay가 오늘 이전(또는 오늘)이고 아직 처리하지 않은 달을 반환한다.
 * 이전 달도 누락됐으면 이전 달도 포함.
 * 각 항목: { yearMonth: 'YYYY-MM', dateStr: 'YYYY-MM-DD' }
 */
function getMonthsToProcess(
  paymentDay: number,
  lastProcessedYearMonth: string | undefined
): { yearMonth: string; dateStr: string }[] {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth() + 1; // 1-based
  const day = today.getDate();

  const results: { yearMonth: string; dateStr: string }[] = [];

  // 이전 달 체크
  const prevDate = new Date(year, month - 2, 1); // month-2 because Date month is 0-based
  const prevYear = prevDate.getFullYear();
  const prevMonth = prevDate.getMonth() + 1;
  const prevYearMonth = `${prevYear}-${String(prevMonth).padStart(2, '0')}`;
  // 이전 달의 paymentDay가 유효한 날짜인지 확인 (예: 31일이 없는 달)
  const prevLastDay = new Date(prevYear, prevMonth, 0).getDate();
  const prevPayDay = Math.min(paymentDay, prevLastDay);
  const prevDateStr = `${prevYear}-${String(prevMonth).padStart(2, '0')}-${String(prevPayDay).padStart(2, '0')}`;

  if (lastProcessedYearMonth !== prevYearMonth) {
    // 이전 달의 결제일은 이미 지났으므로 (현재 달이 왔으니) 무조건 처리 대상
    results.push({ yearMonth: prevYearMonth, dateStr: prevDateStr });
  }

  // 이번 달 체크
  const currentYearMonth = `${year}-${String(month).padStart(2, '0')}`;
  const currentLastDay = new Date(year, month, 0).getDate();
  const currentPayDay = Math.min(paymentDay, currentLastDay);

  if (day >= currentPayDay && lastProcessedYearMonth !== currentYearMonth) {
    const currentDateStr = `${year}-${String(month).padStart(2, '0')}-${String(currentPayDay).padStart(2, '0')}`;
    results.push({ yearMonth: currentYearMonth, dateStr: currentDateStr });
  }

  return results;
}

/**
 * 카드 결제일 자동 차감 처리
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

  // 결제 계좌가 연결된 카드만 필터링
  const linkedCards = cards.filter(
    (card): card is Card & { linkedAssetId: string; paymentDay: number } =>
      !!card.linkedAssetId && !!card.paymentDay
  );

  // 각 카드의 결제 예정액 계산
  const cardPayments = calculateAllCardsPayment(cards, records, installments);

  for (const card of linkedCards) {
    try {
      const monthsToProcess = getMonthsToProcess(card.paymentDay, lastDeduction[card.id]);

      if (monthsToProcess.length === 0) {
        continue;
      }

      for (const { yearMonth } of monthsToProcess) {
        // 이미 처리 확인 (이전 반복에서 갱신됐을 수 있음)
        if (lastDeduction[card.id] === yearMonth) {
          result.skipped++;
          console.log(`[AutoDeduction] 카드 ${card.name}: ${yearMonth} 이미 처리됨`);
          continue;
        }

        // 결제 예정액 찾기
        const paymentEntry = cardPayments.find((p) => p.current.cardId === card.id);
        const payment = paymentEntry?.current;
        if (!payment || payment.totalPayment <= 0) {
          console.log(`[AutoDeduction] 카드 ${card.name}: 결제 예정액 없음`);
          lastDeduction[card.id] = yearMonth;
          continue;
        }

        // 자산에서 차감
        const balanceResult = await adjustAssetBalance(
          card.linkedAssetId,
          -payment.totalPayment,
          encryptionKey
        );
        if (balanceResult.clamped) {
          result.warnings.push({ assetName: balanceResult.assetName, requested: balanceResult.requested, actual: balanceResult.actual });
        }

        // 처리 기록 저장
        lastDeduction[card.id] = yearMonth;
        result.processed++;

        console.log(
          `[AutoDeduction] 카드 ${card.name}: ${payment.totalPayment.toLocaleString()}원 차감 완료 (${yearMonth})`
        );
      }
    } catch (error) {
      const errorMsg = `카드 ${card.name} 차감 실패: ${error}`;
      result.errors.push(errorMsg);
      console.error('[AutoDeduction]', errorMsg);
    }
  }

  // 마지막 차감 기록 저장
  await AsyncStorage.setItem(
    STORAGE_KEYS.LAST_CARD_DEDUCTION,
    JSON.stringify(lastDeduction)
  );

  return result;
}

/**
 * 대출 상환일 자동 차감 처리
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

  // 마지막 차감 기록 로드
  const lastDeductionStr = await AsyncStorage.getItem(STORAGE_KEYS.LAST_LOAN_DEDUCTION);
  const lastDeduction: Record<string, string> = lastDeductionStr
    ? JSON.parse(lastDeductionStr)
    : {};

  // 연결 계좌가 있고 활성 상태인 대출만 필터링
  const linkedLoans = loans.filter(
    (loan): loan is Loan & { linkedAssetId: string } =>
      !!loan.linkedAssetId && loan.status === 'active'
  );

  for (const loan of linkedLoans) {
    let currentPaidMonths = loan.paidMonths;
    let currentRemainingPrincipal = loan.remainingPrincipal;

    try {
      // 상환일 계산 (repaymentDay가 없으면 시작일 기준)
      const repaymentDay = loan.repaymentDay ?? parseInt(loan.startDate.split('-')[2]);

      const monthsToProcess = getMonthsToProcess(repaymentDay, lastDeduction[loan.id]);

      if (monthsToProcess.length === 0) {
        continue;
      }

      for (const { yearMonth } of monthsToProcess) {
        // 이미 처리 확인
        if (lastDeduction[loan.id] === yearMonth) {
          result.skipped++;
          console.log(`[AutoDeduction] 대출 ${loan.name}: ${yearMonth} 이미 처리됨`);
          continue;
        }

        // 이미 완납했는지 확인
        if (currentPaidMonths >= loan.termMonths) {
          console.log(`[AutoDeduction] 대출 ${loan.name}: 이미 완납됨`);
          lastDeduction[loan.id] = yearMonth;
          continue;
        }

        // 자산에서 차감
        const balanceResult = await adjustAssetBalance(
          loan.linkedAssetId,
          -loan.monthlyPayment,
          encryptionKey
        );
        if (balanceResult.clamped) {
          result.warnings.push({ assetName: balanceResult.assetName, requested: balanceResult.requested, actual: balanceResult.actual });
        }

        // 기록탭에 지출 자동 기록 (원화 기준)
        const recordData = createLoanRepaymentRecordData({
          ...loan,
          paidMonths: currentPaidMonths,
          remainingPrincipal: currentRemainingPrincipal,
        });
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
            linkedAssetId: null, // 이미 위에서 차감했으므로 연동 안 함
          });
          console.log(`[AutoDeduction] 대출 ${loan.name}: 기록탭에 지출 기록 추가됨`);
        }

        // 대출 상환 상태 업데이트
        const newPaidMonths = currentPaidMonths + 1;
        const isCompleted = newPaidMonths >= loan.termMonths;

        // 잔여 원금 계산 (상환 방식에 따라 다름)
        let newRemainingPrincipal = currentRemainingPrincipal;
        if (loan.repaymentType === 'equalPrincipal') {
          const monthlyPrincipal = loan.principal / loan.termMonths;
          newRemainingPrincipal = Math.max(0, currentRemainingPrincipal - monthlyPrincipal);
        } else if (loan.repaymentType === 'equalPrincipalAndInterest') {
          const monthlyInterest = (currentRemainingPrincipal * loan.interestRate) / 100 / 12;
          const monthlyPrincipal = loan.monthlyPayment - monthlyInterest;
          newRemainingPrincipal = Math.max(0, currentRemainingPrincipal - monthlyPrincipal);
        }
        if (isCompleted && loan.repaymentType === 'bullet') {
          newRemainingPrincipal = 0;
        }

        await updateLoan(
          loan.id,
          {
            paidMonths: newPaidMonths,
            remainingPrincipal: Math.round(newRemainingPrincipal),
            status: isCompleted ? 'completed' : 'active',
          },
          encryptionKey
        );

        // 로컬 추적 변수 갱신 (다음 반복에서 올바른 값 사용)
        currentPaidMonths = newPaidMonths;
        currentRemainingPrincipal = Math.round(newRemainingPrincipal);

        // 처리 기록 저장
        lastDeduction[loan.id] = yearMonth;
        result.processed++;

        console.log(
          `[AutoDeduction] 대출 ${loan.name}: ${loan.monthlyPayment.toLocaleString()}원 차감 완료 (${newPaidMonths}/${loan.termMonths}회차, ${yearMonth})`
        );
      }
    } catch (error) {
      const errorMsg = `대출 ${loan.name} 차감 실패: ${error}`;
      result.errors.push(errorMsg);
      console.error('[AutoDeduction]', errorMsg);
    }
  }

  // 마지막 차감 기록 저장
  await AsyncStorage.setItem(
    STORAGE_KEYS.LAST_LOAN_DEDUCTION,
    JSON.stringify(lastDeduction)
  );

  return result;
}

/**
 * 할부 결제일 상태 업데이트
 * - 카드 결제일에 해당 카드의 활성 할부 paidMonths/remainingAmount 업데이트
 * - 은행 차감은 processCardPayments()에서 처리 (installmentPayments 포함)
 * - 지출 기록은 구매 시점에 이미 전액 기록됨 (이중 계상 방지)
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

  // 마지막 처리 기록 로드
  const lastDeductionStr = await AsyncStorage.getItem(STORAGE_KEYS.LAST_INSTALLMENT_DEDUCTION);
  const lastDeduction: Record<string, string> = lastDeductionStr
    ? JSON.parse(lastDeductionStr)
    : {};

  // 활성 할부만 필터링
  const activeInstallments = installments.filter((i) => i.status === 'active');

  for (const installment of activeInstallments) {
    let currentPaidMonths = installment.paidMonths;
    let currentRemainingAmount = installment.remainingAmount;

    try {
      // 해당 카드 찾기
      const card = cards.find((c) => c.id === installment.cardId);
      if (!card || !card.paymentDay) {
        continue;
      }

      const monthsToProcess = getMonthsToProcess(card.paymentDay, lastDeduction[installment.id]);

      if (monthsToProcess.length === 0) {
        continue;
      }

      for (const { yearMonth, dateStr } of monthsToProcess) {
        // 이미 처리 확인
        if (lastDeduction[installment.id] === yearMonth) {
          result.skipped++;
          console.log(`[AutoDeduction] 할부 ${installment.storeName}: ${yearMonth} 이미 처리됨`);
          continue;
        }

        // 이미 완납했는지 확인
        if (currentPaidMonths >= installment.months) {
          console.log(`[AutoDeduction] 할부 ${installment.storeName}: 이미 완납됨`);
          lastDeduction[installment.id] = yearMonth;
          continue;
        }

        // NOTE: 지출 기록은 생성하지 않음!
        // 소비 기록은 구매 시점에 이미 전액 기록됨 (addExpense in add-expense.tsx)
        // 은행 계좌 차감은 processCardPayments()에서 카드 결제일에 일괄 처리됨
        // 여기서는 할부 상태(paidMonths, remainingAmount)만 업데이트

        // 할부 상태 업데이트
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

        // 로컬 추적 변수 갱신 (다음 반복에서 올바른 값 사용)
        currentPaidMonths = newPaidMonths;
        currentRemainingAmount = Math.round(newRemainingAmount);

        // 처리 기록 저장
        lastDeduction[installment.id] = yearMonth;
        result.processed++;

        console.log(
          `[AutoDeduction] 할부 ${installment.storeName}: ${installment.monthlyPayment.toLocaleString()}원 지출 기록 생성 (${newPaidMonths}/${installment.months}회차, ${yearMonth})`
        );
      }
    } catch (error) {
      const errorMsg = `할부 ${installment.storeName} 처리 실패: ${error}`;
      result.errors.push(errorMsg);
      console.error('[AutoDeduction]', errorMsg);
    }
  }

  // 마지막 처리 기록 저장
  await AsyncStorage.setItem(
    STORAGE_KEYS.LAST_INSTALLMENT_DEDUCTION,
    JSON.stringify(lastDeduction)
  );

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
