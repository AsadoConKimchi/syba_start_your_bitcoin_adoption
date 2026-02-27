export interface RecurringExpense {
  id: string;
  name: string;                // "삼성화재 보험료"
  amount: number;              // 150,000
  currency: 'KRW' | 'SATS';
  category: string;            // "금융", "구독료" 등

  // 반복 주기
  frequency: 'monthly' | 'yearly';
  dayOfMonth: number;          // 매월 N일 (1-28)
  monthOfYear?: number;        // yearly일 때 몇 월 (1-12)

  // 결제 수단
  paymentMethod: 'card' | 'bank' | 'cash';
  cardId?: string;             // 카드 결제 시
  linkedAssetId?: string;      // 계좌 차감 시

  // 상태
  isActive: boolean;
  startDate: string;           // YYYY-MM-DD
  endDate?: string;            // 종료일 (선택)
  lastExecutedDate?: string;   // 마지막 자동 실행일 (YYYY-MM-DD)

  memo?: string;
  createdAt: string;
  updatedAt: string;
}
