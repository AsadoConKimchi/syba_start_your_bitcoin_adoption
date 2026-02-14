import { RepaymentType } from '../types/debt';

// 경과 개월 수 계산
export function calculateElapsedMonths(startDate: string): number {
  const start = new Date(startDate);
  const now = new Date();

  const yearDiff = now.getFullYear() - start.getFullYear();
  const monthDiff = now.getMonth() - start.getMonth();
  const dayAdjust = now.getDate() < start.getDate() ? -1 : 0;

  return Math.max(0, yearDiff * 12 + monthDiff + dayAdjust);
}

// 총 개월 수 계산
export function getTotalMonths(startDate: string, endDate: string): number {
  const start = new Date(startDate);
  const end = new Date(endDate);
  return (
    (end.getFullYear() - start.getFullYear()) * 12 +
    (end.getMonth() - start.getMonth())
  );
}

// 월 상환금 계산
export function calculateMonthlyPayment(
  principal: number,
  annualRate: number,
  totalMonths: number,
  type: RepaymentType
): number {
  const monthlyRate = annualRate / 12;

  switch (type) {
    case 'bullet':
      // 만기일시상환: 매월 이자만
      return Math.round(principal * monthlyRate);

    case 'equalPrincipalAndInterest':
      // 원리금균등상환
      if (monthlyRate === 0) return Math.round(principal / totalMonths);
      const factor = Math.pow(1 + monthlyRate, totalMonths);
      return Math.round((principal * (monthlyRate * factor)) / (factor - 1));

    case 'equalPrincipal':
      // 원금균등상환: 첫 달 기준
      const principalPayment = principal / totalMonths;
      const firstInterest = principal * monthlyRate;
      return Math.round(principalPayment + firstInterest);

    default:
      return 0;
  }
}

// 잔여 원금 계산
export function calculateRemainingBalance(
  principal: number,
  annualRate: number,
  totalMonths: number,
  repaymentType: RepaymentType,
  monthlyPayment: number,
  paidMonths: number
): number {
  const monthlyRate = annualRate / 12;

  switch (repaymentType) {
    case 'bullet':
      return principal;

    case 'equalPrincipalAndInterest':
      let balance = principal;
      for (let i = 0; i < paidMonths; i++) {
        const interest = balance * monthlyRate;
        const principalPaid = monthlyPayment - interest;
        balance -= principalPaid;
      }
      return Math.max(0, Math.round(balance));

    case 'equalPrincipal':
      const monthlyPrincipal = principal / totalMonths;
      return Math.max(0, Math.round(principal - monthlyPrincipal * paidMonths));

    default:
      return principal;
  }
}

// 대출 초기값 일괄 계산
export function calculateLoanInitialValues(
  totalAmount: number,
  interestRate: number,
  repaymentType: RepaymentType,
  startDate: string,
  endDate: string
) {
  const totalMonths = getTotalMonths(startDate, endDate);
  const paidMonths = Math.min(calculateElapsedMonths(startDate), totalMonths);

  const monthlyPayment = calculateMonthlyPayment(
    totalAmount,
    interestRate,
    totalMonths,
    repaymentType
  );

  const remainingBalance = calculateRemainingBalance(
    totalAmount,
    interestRate,
    totalMonths,
    repaymentType,
    monthlyPayment,
    paidMonths
  );

  return { monthlyPayment, paidMonths, remainingBalance, totalMonths };
}

// 할부 초기 납부 개월 계산
export function getInstallmentInitialPaidMonths(
  startDate: string,
  totalMonths: number
): number {
  const elapsed = calculateElapsedMonths(startDate);
  return Math.min(elapsed, totalMonths);
}

// 김프 계산
export function calculateKimchiPremium(
  btcKrw: number,
  btcUsdt: number,
  usdKrw: number
): number {
  const internationalPrice = btcUsdt * usdKrw;
  const premium = ((btcKrw - internationalPrice) / internationalPrice) * 100;
  return Math.round(premium * 100) / 100;
}

// 원화 → sats 환산
export function krwToSats(krwAmount: number, btcKrw: number): number {
  if (btcKrw === 0) return 0;
  return Math.round((krwAmount / btcKrw) * 100_000_000);
}

// sats → 원화 환산
export function satsToKrw(satsAmount: number, btcKrw: number): number {
  return Math.round((satsAmount / 100_000_000) * btcKrw);
}
