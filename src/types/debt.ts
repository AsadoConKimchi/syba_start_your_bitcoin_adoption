// 할부 정보
export interface Installment {
  id: string;
  cardId: string; // 연결된 카드
  expenseId: string | null; // 지출 기록에서 생성된 경우

  // 결제 정보
  storeName: string; // 상점명 (카테고리 또는 직접 입력)
  totalAmount: number; // 총 결제 금액

  // 할부 조건
  months: number; // 할부 개월 수
  isInterestFree: boolean; // 무이자 여부
  interestRate: number; // 이자율 (유이자인 경우, 연 %)

  // 계산된 값
  monthlyPayment: number; // 월 납부액
  totalInterest: number; // 총 이자

  // 기간
  startDate: string; // 시작일 (YYYY-MM-DD)
  endDate: string; // 종료일 (YYYY-MM-DD)

  // 납부 상태
  paidMonths: number; // 납부한 개월 수
  remainingAmount: number; // 남은 금액

  // 상태
  status: 'active' | 'completed' | 'cancelled';

  // 메타
  memo: string | null;
  createdAt: string;
  updatedAt: string;
}

// 대출 상환 방식
export type RepaymentType =
  | 'bullet' // 만기일시상환 (이자만 납부, 만기에 원금 상환)
  | 'equalPrincipalAndInterest' // 원리금균등상환
  | 'equalPrincipal'; // 원금균등상환

// 대출 정보
export interface Loan {
  id: string;

  // 대출 정보
  name: string; // 대출명
  institution: string; // 대출 기관
  principal: number; // 대출 원금
  interestRate: number; // 연 이자율 (%)

  // 상환 조건
  repaymentType: RepaymentType;
  termMonths: number; // 대출 기간 (개월)
  repaymentDay?: number; // 상환일 (1~28), 없으면 시작일 기준

  // 기간
  startDate: string; // 시작일
  endDate: string; // 만기일

  // 계산된 값
  monthlyPayment: number; // 월 상환금 (만기일시는 이자만)
  totalInterest: number; // 총 예상 이자

  // 상환 상태
  paidMonths: number; // 상환한 개월 수
  remainingPrincipal: number; // 잔여 원금

  // 상태
  status: 'active' | 'completed' | 'cancelled';

  // 이자 납부일 (만기일시상환/마이너스통장)
  interestPaymentDay?: number; // 1~28

  // 자산 연동 (Phase 5)
  linkedAssetId?: string; // 상환금이 출금될 계좌

  // 메타
  memo: string | null;
  createdAt: string;
  updatedAt: string;
}

// 월별 상환 계획
export interface RepaymentSchedule {
  month: number; // 회차
  date: string; // 상환일
  principal: number; // 원금
  interest: number; // 이자
  total: number; // 총액
  remainingPrincipal: number; // 상환 후 잔여 원금
}

// Repayment type i18n keys (use with t())
export const REPAYMENT_TYPE_LABEL_KEYS: Record<RepaymentType, string> = {
  bullet: 'loan.bullet',
  equalPrincipalAndInterest: 'loan.equalPrincipalInterest',
  equalPrincipal: 'loan.equalPrincipal',
};

// Legacy labels for backward compatibility
export const REPAYMENT_TYPE_LABELS: Record<RepaymentType, string> = {
  bullet: '만기일시상환',
  equalPrincipalAndInterest: '원리금균등상환',
  equalPrincipal: '원금균등상환',
};

// Legacy descriptions for backward compatibility
export const REPAYMENT_TYPE_DESCRIPTIONS: Record<RepaymentType, string> = {
  bullet: '매월 이자만 납부, 만기에 원금 일시 상환',
  equalPrincipalAndInterest: '매월 동일한 금액(원금+이자) 상환',
  equalPrincipal: '매월 동일한 원금 + 잔액 이자 상환',
};
