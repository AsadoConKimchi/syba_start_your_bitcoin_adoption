export type RepaymentType = 'bullet' | 'equal_principal_interest' | 'equal_principal';

export interface Loan {
  id: string;
  name: string;
  lender: string;
  totalAmount: number;
  interestRate: number; // 연 이자율 (0.045 = 4.5%)
  repaymentType: RepaymentType;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  monthlyPayment: number;
  isAutoMonthlyPayment: boolean;
  paidMonths: number;
  isAutoPaidMonths: boolean;
  remainingBalance: number;
  isAutoRemainingBalance: boolean;
  registeredAt: string;
  initialPaidMonths: number;
  initialRemainingBalance: number;
  createdAt: string;
  updatedAt: string;
}

export const REPAYMENT_TYPE_LABEL_KEYS: Record<RepaymentType, string> = {
  bullet: 'loan.bullet',
  equal_principal_interest: 'loan.equalPrincipalInterest',
  equal_principal: 'loan.equalPrincipal',
};

// Legacy fallback
export const REPAYMENT_TYPE_LABELS: Record<RepaymentType, string> = {
  bullet: '만기일시상환',
  equal_principal_interest: '원리금균등상환',
  equal_principal: '원금균등상환',
};
