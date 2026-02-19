import { CardCompanyId } from '../constants/cardCompanies';
import { getCurrentRegion } from '../regions';

export type CardType = 'credit' | 'debit' | 'prepaid';

export interface Card {
  id: string;
  name: string;
  company: CardCompanyId;
  type: CardType;
  color: string;
  isDefault: boolean;
  // 결제일 정보 (신용카드용)
  paymentDay?: number; // 결제일 (1~28)
  billingStartDay?: number; // 산정기간 시작일
  billingEndDay?: number; // 산정기간 종료일
  // 자산 연동 (Phase 5)
  linkedAssetId?: string; // 결제일에 출금될 계좌 (자산 ID) — 신용카드
  linkedAccountId?: string; // 체크카드 연결 계좌 (자산 ID)
  balance?: number; // 선불카드 잔액 (원 단위)
  createdAt: string;
  updatedAt: string;
}

// 카드사별 결제일 옵션 가져오기
export function getPaymentDayOptions(companyId: string): number[] {
  const region = getCurrentRegion();
  const companyRules = region.billingRules[companyId];
  if (companyRules) {
    return companyRules.availablePaymentDays || [1, 5, 10, 14, 15, 20, 25];
  }
  // No billing rules for this region/company, allow all days 1-28
  return Array.from({ length: 28 }, (_, i) => i + 1);
}

// 기본 결제일 옵션 (전체 목록)
export const PAYMENT_DAY_OPTIONS = [1, 5, 7, 10, 12, 14, 15, 17, 20, 21, 25, 27] as const;

/**
 * 카드사와 결제일에 따른 산정기간 계산
 * @param companyId 카드사 ID
 * @param paymentDay 결제일
 * @returns { startDay, endDay } 또는 기본값
 */
export function getBillingPeriodForCard(
  companyId: string,
  paymentDay: number
): { startDay: number; endDay: number } {
  const region = getCurrentRegion();
  const companyRules = region.billingRules[companyId];

  if (companyRules && companyRules.rules[paymentDay]) {
    const rule = companyRules.rules[paymentDay];
    return {
      startDay: rule.start.day,
      endDay: rule.end.day,
    };
  }

  return {
    startDay: paymentDay + 1 > 28 ? 1 : paymentDay + 1,
    endDay: paymentDay,
  };
}

// 레거시 함수 (하위 호환성)
export function getDefaultBillingPeriod(paymentDay: number): { startDay: number; endDay: number } {
  return {
    startDay: paymentDay + 1 > 28 ? 1 : paymentDay + 1,
    endDay: paymentDay,
  };
}
