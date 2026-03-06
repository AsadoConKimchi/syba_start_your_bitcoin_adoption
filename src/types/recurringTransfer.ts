export interface RecurringTransfer {
  id: string;
  name: string;               // "월세 이체", "적금"
  amount: number;
  currency: 'KRW' | 'SATS';

  // 반복 주기
  frequency: 'monthly' | 'yearly';
  dayOfMonth: number;          // 매월 N일 (1-28)
  monthOfYear?: number;        // yearly일 때 몇 월 (1-12)

  // 이체 대상
  fromAssetId: string;         // 출금 계좌
  toAssetId?: string;          // 입금 계좌 (계좌→계좌)
  toCardId?: string;           // 충전 대상 (계좌→선불카드)

  // 상태
  isActive: boolean;
  startDate: string;           // YYYY-MM-DD
  endDate?: string;            // 종료일 (선택)
  lastExecutedDate?: string;   // 마지막 자동 실행일 (YYYY-MM-DD)

  memo?: string;
  createdAt: string;
  updatedAt: string;
}
