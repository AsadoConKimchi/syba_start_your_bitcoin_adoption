import { Card } from '../types/card';
import { LedgerRecord, isExpense } from '../types/ledger';
import { Installment } from '../types/debt';
import { getBillingPeriodByCompany } from '../constants/billingPeriods';
import { krwToSats } from './calculations';

interface CardPaymentSummary {
  cardId: string;
  cardName: string;
  cardColor: string;
  paymentDay: number | null;
  // 산정기간 내 지출
  periodExpenses: number;
  periodExpensesSats: number; // 각 기록의 당시 환산된 sats 합계
  // 할부 납부액
  installmentPayments: number;
  installmentPaymentsSats: number; // 할부 금액의 현재 시세 sats 환산
  installmentCount: number;
  // 총 결제 예정액
  totalPayment: number;
  totalPaymentSats: number; // 일시불(기록 당시) + 할부(현재 시세) sats 합계
  // 산정기간
  billingPeriodStart: string | null;
  billingPeriodEnd: string | null;
  // 결제일까지 남은 일수
  daysUntilPayment: number | null;
}

/**
 * 특정 카드의 결제 예정 금액 계산
 * @param card 카드 정보
 * @param expenses 지출 기록 목록
 * @param installments 할부 목록
 * @param targetDate 기준 날짜 (기본: 오늘)
 * @param btcKrw 현재 BTC/KRW 시세 (할부 sats 환산용)
 */
export function calculateCardPayment(
  card: Card,
  expenses: LedgerRecord[],
  installments: Installment[],
  targetDate: Date = new Date(),
  btcKrw?: number
): CardPaymentSummary {
  const result: CardPaymentSummary = {
    cardId: card.id,
    cardName: card.name,
    cardColor: card.color,
    paymentDay: card.paymentDay || null,
    periodExpenses: 0,
    periodExpensesSats: 0,
    installmentPayments: 0,
    installmentPaymentsSats: 0,
    installmentCount: 0,
    totalPayment: 0,
    totalPaymentSats: 0,
    billingPeriodStart: null,
    billingPeriodEnd: null,
    daysUntilPayment: getDaysUntilPayment(card, targetDate),
  };

  // 결제일 정보가 없으면 계산 불가
  if (!card.paymentDay || !card.billingStartDay || !card.billingEndDay) {
    return result;
  }

  // 산정기간 계산 (카드사별 규칙 우선 적용)
  const billingPeriod = getBillingPeriodByCompanyOrFallback(
    card.company,
    card.paymentDay,
    card.billingStartDay,
    card.billingEndDay,
    targetDate
  );

  if (!billingPeriod) {
    return result;
  }

  const { startDate, endDate } = billingPeriod;

  result.billingPeriodStart = startDate.toISOString().split('T')[0];
  result.billingPeriodEnd = endDate.toISOString().split('T')[0];

  // 1. 산정기간 내 해당 카드 지출 합계 (일시불만)
  const cardExpenses = expenses.filter((e) => {
    if (!isExpense(e)) return false;
    if (e.paymentMethod !== 'card') return false;
    if (e.cardId !== card.id) return false;
    if (e.installmentMonths && e.installmentMonths > 1) return false; // 할부는 별도 계산

    const expenseDate = new Date(e.date);
    return expenseDate >= startDate && expenseDate <= endDate;
  });

  result.periodExpenses = cardExpenses.reduce((sum, e) => sum + e.amount, 0);
  // 각 기록의 당시 환산된 sats 합계
  result.periodExpensesSats = cardExpenses.reduce(
    (sum, e) => sum + (isExpense(e) ? e.satsEquivalent || 0 : 0),
    0
  );

  // 2. 해당 카드의 활성 할부 월 납부액 합계
  const cardInstallments = installments.filter(
    (i) => i.cardId === card.id && i.status === 'active'
  );

  result.installmentPayments = cardInstallments.reduce(
    (sum, i) => sum + i.monthlyPayment,
    0
  );
  result.installmentCount = cardInstallments.length;

  // 할부 월납입금의 현재 시세 sats 환산
  if (btcKrw && result.installmentPayments > 0) {
    result.installmentPaymentsSats = krwToSats(result.installmentPayments, btcKrw);
  }

  // 3. 총 결제 예정액
  result.totalPayment = result.periodExpenses + result.installmentPayments;
  // sats 합산: 일시불(기록 당시) + 할부(현재 시세)
  result.totalPaymentSats = result.periodExpensesSats + result.installmentPaymentsSats;

  return result;
}

/**
 * 모든 카드의 결제 예정 금액 계산
 * @param btcKrw 현재 BTC/KRW 시세 (할부 sats 환산용)
 */
export function calculateAllCardsPayment(
  cards: Card[],
  expenses: LedgerRecord[],
  installments: Installment[],
  targetDate: Date = new Date(),
  btcKrw?: number
): CardPaymentSummary[] {
  return cards
    .filter((c) => c.type === 'credit' && c.paymentDay)
    .map((card) => calculateCardPayment(card, expenses, installments, targetDate, btcKrw));
}

/**
 * 카드사별 규칙을 우선 적용하고, 없으면 저장된 값으로 폴백
 */
function getBillingPeriodByCompanyOrFallback(
  companyId: string,
  paymentDay: number,
  billingStartDay: number | undefined,
  billingEndDay: number | undefined,
  targetDate: Date
): { startDate: Date; endDate: Date } | null {
  const currentDay = targetDate.getDate();
  const isBeforePaymentDay = currentDay < paymentDay;

  // 결제일 이전이면 이번 달 결제, 이후면 다음 달 결제 기준
  const paymentMonth = isBeforePaymentDay
    ? targetDate
    : new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 1);

  // 카드사별 규칙 시도
  const companyBilling = getBillingPeriodByCompany(companyId, paymentDay, paymentMonth);
  if (companyBilling) {
    return {
      startDate: companyBilling.startDate,
      endDate: companyBilling.endDate,
    };
  }

  // 저장된 값으로 폴백
  if (billingStartDay && billingEndDay) {
    return getBillingPeriodFallback(paymentDay, billingStartDay, billingEndDay, targetDate);
  }

  return null;
}

/**
 * 산정기간 계산 (레거시 폴백)
 * @param paymentDay 결제일
 * @param billingStartDay 산정 시작일
 * @param billingEndDay 산정 종료일
 * @param targetDate 기준 날짜
 */
function getBillingPeriodFallback(
  paymentDay: number,
  billingStartDay: number,
  billingEndDay: number,
  targetDate: Date
): { startDate: Date; endDate: Date } {
  const year = targetDate.getFullYear();
  const month = targetDate.getMonth();

  // 현재 날짜가 결제일 이전인지 확인
  const currentDay = targetDate.getDate();
  const isBeforePaymentDay = currentDay < paymentDay;

  // 결제일 이전이면 현재 월의 결제를 위한 산정기간
  // 결제일 이후면 다음 월의 결제를 위한 산정기간
  if (isBeforePaymentDay) {
    // 이번 달 결제: 전전월 billingStartDay ~ 전월 billingEndDay
    const startDate = new Date(year, month - 2, billingStartDay);
    const endDate = new Date(year, month - 1, billingEndDay);
    return { startDate, endDate };
  } else {
    // 다음 달 결제: 전월 billingStartDay ~ 금월 billingEndDay
    const startDate = new Date(year, month - 1, billingStartDay);
    const endDate = new Date(year, month, billingEndDay);
    return { startDate, endDate };
  }
}

/**
 * 특정 날짜가 결제일인 카드 찾기
 */
export function getCardsWithPaymentDay(cards: Card[], day: number): Card[] {
  return cards.filter((c) => c.paymentDay === day);
}

/**
 * 다음 결제일까지 남은 일수
 */
export function getDaysUntilPayment(card: Card, targetDate: Date = new Date()): number | null {
  if (!card.paymentDay) return null;

  const year = targetDate.getFullYear();
  const month = targetDate.getMonth();
  const currentDay = targetDate.getDate();

  let paymentDate: Date;
  if (currentDay <= card.paymentDay) {
    // 이번 달 결제일
    paymentDate = new Date(year, month, card.paymentDay);
  } else {
    // 다음 달 결제일
    paymentDate = new Date(year, month + 1, card.paymentDay);
  }

  const diffTime = paymentDate.getTime() - targetDate.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}
