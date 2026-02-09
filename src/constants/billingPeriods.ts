/**
 * 카드사별 결제일-산정기간 매핑 (공식 데이터 기반)
 *
 * 출처: 각 카드사 공식 홈페이지, BC카드 신용공여기간 조회
 * 마지막 업데이트: 2026-02-01
 *
 * 형식: { 결제일: { start, end } }
 * - start: { monthOffset, day } - 산정 시작일
 * - end: { monthOffset, day } - 산정 종료일
 * - monthOffset: 0 = 결제월(당월), -1 = 전월, -2 = 전전월
 *
 * 예: 삼성카드 14일 결제 → 전월 2일 ~ 당월 1일
 *     { 14: { start: { monthOffset: -1, day: 2 }, end: { monthOffset: 0, day: 1 } } }
 */

interface BillingPeriodOffset {
  monthOffset: number;
  day: number;
}

interface BillingPeriodRule {
  start: BillingPeriodOffset;
  end: BillingPeriodOffset;
}

type PaymentDayRules = Record<number, BillingPeriodRule>;

export interface CardCompanyBillingRules {
  companyId: string;
  companyName: string;
  availablePaymentDays: number[];
  recommendedDay: number; // 추천 결제일 (전월 1일~말일이 되는 날)
  rules: PaymentDayRules;
}

/**
 * 삼성카드
 * 출처: https://www.samsungcard.com/personal/payment/settlement/UHPPMM1405L0.jsp
 * 추천 결제일: 13일 (전월 1일~말일)
 */
const SAMSUNG_RULES: PaymentDayRules = {
  1: { start: { monthOffset: -2, day: 18 }, end: { monthOffset: -1, day: 17 } },
  5: { start: { monthOffset: -2, day: 22 }, end: { monthOffset: -1, day: 21 } },
  10: { start: { monthOffset: -2, day: 27 }, end: { monthOffset: -1, day: 26 } },
  11: { start: { monthOffset: -2, day: 28 }, end: { monthOffset: -1, day: 27 } },
  12: { start: { monthOffset: -2, day: 29 }, end: { monthOffset: -1, day: 28 } },
  13: { start: { monthOffset: -1, day: 1 }, end: { monthOffset: -1, day: 31 } }, // 추천!
  14: { start: { monthOffset: -1, day: 2 }, end: { monthOffset: 0, day: 1 } },
  15: { start: { monthOffset: -1, day: 3 }, end: { monthOffset: 0, day: 2 } },
  18: { start: { monthOffset: -1, day: 6 }, end: { monthOffset: 0, day: 5 } },
  21: { start: { monthOffset: -1, day: 9 }, end: { monthOffset: 0, day: 8 } },
  22: { start: { monthOffset: -1, day: 10 }, end: { monthOffset: 0, day: 9 } },
  23: { start: { monthOffset: -1, day: 11 }, end: { monthOffset: 0, day: 10 } },
  24: { start: { monthOffset: -1, day: 12 }, end: { monthOffset: 0, day: 11 } },
  25: { start: { monthOffset: -1, day: 13 }, end: { monthOffset: 0, day: 12 } },
  26: { start: { monthOffset: -1, day: 14 }, end: { monthOffset: 0, day: 13 } },
};

/**
 * 신한카드
 * 출처: https://www.shinhancard.com/pconts/html/helpdesk/useGuide/credit/guide01/MOBFM12502R01.html
 * 추천 결제일: 14일 (전월 1일~말일)
 */
const SHINHAN_RULES: PaymentDayRules = {
  1: { start: { monthOffset: -2, day: 18 }, end: { monthOffset: -1, day: 17 } },
  2: { start: { monthOffset: -2, day: 19 }, end: { monthOffset: -1, day: 18 } },
  3: { start: { monthOffset: -2, day: 20 }, end: { monthOffset: -1, day: 19 } },
  4: { start: { monthOffset: -2, day: 21 }, end: { monthOffset: -1, day: 20 } },
  5: { start: { monthOffset: -2, day: 22 }, end: { monthOffset: -1, day: 21 } },
  6: { start: { monthOffset: -2, day: 23 }, end: { monthOffset: -1, day: 22 } },
  7: { start: { monthOffset: -2, day: 24 }, end: { monthOffset: -1, day: 23 } },
  8: { start: { monthOffset: -2, day: 25 }, end: { monthOffset: -1, day: 24 } },
  9: { start: { monthOffset: -2, day: 26 }, end: { monthOffset: -1, day: 25 } },
  10: { start: { monthOffset: -2, day: 27 }, end: { monthOffset: -1, day: 26 } },
  11: { start: { monthOffset: -2, day: 28 }, end: { monthOffset: -1, day: 27 } },
  12: { start: { monthOffset: -2, day: 29 }, end: { monthOffset: -1, day: 28 } },
  13: { start: { monthOffset: -2, day: 30 }, end: { monthOffset: -1, day: 29 } },
  14: { start: { monthOffset: -1, day: 1 }, end: { monthOffset: -1, day: 31 } }, // 추천!
  15: { start: { monthOffset: -1, day: 2 }, end: { monthOffset: 0, day: 1 } },
  16: { start: { monthOffset: -1, day: 3 }, end: { monthOffset: 0, day: 2 } },
  17: { start: { monthOffset: -1, day: 4 }, end: { monthOffset: 0, day: 3 } },
  18: { start: { monthOffset: -1, day: 5 }, end: { monthOffset: 0, day: 4 } },
  19: { start: { monthOffset: -1, day: 6 }, end: { monthOffset: 0, day: 5 } },
  20: { start: { monthOffset: -1, day: 7 }, end: { monthOffset: 0, day: 6 } },
  21: { start: { monthOffset: -1, day: 8 }, end: { monthOffset: 0, day: 7 } },
  22: { start: { monthOffset: -1, day: 9 }, end: { monthOffset: 0, day: 8 } },
  23: { start: { monthOffset: -1, day: 10 }, end: { monthOffset: 0, day: 9 } },
  24: { start: { monthOffset: -1, day: 11 }, end: { monthOffset: 0, day: 10 } },
  25: { start: { monthOffset: -1, day: 12 }, end: { monthOffset: 0, day: 11 } },
  26: { start: { monthOffset: -1, day: 13 }, end: { monthOffset: 0, day: 12 } },
  27: { start: { monthOffset: -1, day: 14 }, end: { monthOffset: 0, day: 13 } },
};

/**
 * KB국민카드
 * 출처: https://card.kbcard.com/CXCRSCSC0044.cms
 * 추천 결제일: 14일 (전월 1일~말일)
 */
const KOOKMIN_RULES: PaymentDayRules = {
  1: { start: { monthOffset: -2, day: 18 }, end: { monthOffset: -1, day: 17 } },
  2: { start: { monthOffset: -2, day: 19 }, end: { monthOffset: -1, day: 18 } },
  3: { start: { monthOffset: -2, day: 20 }, end: { monthOffset: -1, day: 19 } },
  4: { start: { monthOffset: -2, day: 21 }, end: { monthOffset: -1, day: 20 } },
  5: { start: { monthOffset: -2, day: 22 }, end: { monthOffset: -1, day: 21 } },
  6: { start: { monthOffset: -2, day: 23 }, end: { monthOffset: -1, day: 22 } },
  7: { start: { monthOffset: -2, day: 24 }, end: { monthOffset: -1, day: 23 } },
  8: { start: { monthOffset: -2, day: 25 }, end: { monthOffset: -1, day: 24 } },
  9: { start: { monthOffset: -2, day: 26 }, end: { monthOffset: -1, day: 25 } },
  10: { start: { monthOffset: -2, day: 27 }, end: { monthOffset: -1, day: 26 } },
  11: { start: { monthOffset: -2, day: 28 }, end: { monthOffset: -1, day: 27 } },
  12: { start: { monthOffset: -2, day: 29 }, end: { monthOffset: -1, day: 28 } },
  13: { start: { monthOffset: -2, day: 30 }, end: { monthOffset: -1, day: 29 } },
  14: { start: { monthOffset: -1, day: 1 }, end: { monthOffset: -1, day: 31 } }, // 추천!
  15: { start: { monthOffset: -1, day: 2 }, end: { monthOffset: 0, day: 1 } },
  16: { start: { monthOffset: -1, day: 3 }, end: { monthOffset: 0, day: 2 } },
  17: { start: { monthOffset: -1, day: 4 }, end: { monthOffset: 0, day: 3 } },
  18: { start: { monthOffset: -1, day: 5 }, end: { monthOffset: 0, day: 4 } },
  19: { start: { monthOffset: -1, day: 6 }, end: { monthOffset: 0, day: 5 } },
  20: { start: { monthOffset: -1, day: 7 }, end: { monthOffset: 0, day: 6 } },
  21: { start: { monthOffset: -1, day: 8 }, end: { monthOffset: 0, day: 7 } },
  22: { start: { monthOffset: -1, day: 9 }, end: { monthOffset: 0, day: 8 } },
  23: { start: { monthOffset: -1, day: 10 }, end: { monthOffset: 0, day: 9 } },
  24: { start: { monthOffset: -1, day: 11 }, end: { monthOffset: 0, day: 10 } },
  25: { start: { monthOffset: -1, day: 12 }, end: { monthOffset: 0, day: 11 } },
  26: { start: { monthOffset: -1, day: 13 }, end: { monthOffset: 0, day: 12 } },
  27: { start: { monthOffset: -1, day: 14 }, end: { monthOffset: 0, day: 13 } },
};

/**
 * 현대카드
 * 출처: https://www.hyundaicard.com
 * 추천 결제일: 12일 (전월 1일~말일)
 * 특징: 결제일 3일 전까지가 산정기간
 */
const HYUNDAI_RULES: PaymentDayRules = {
  1: { start: { monthOffset: -2, day: 20 }, end: { monthOffset: -1, day: 19 } },
  2: { start: { monthOffset: -2, day: 21 }, end: { monthOffset: -1, day: 20 } },
  3: { start: { monthOffset: -2, day: 22 }, end: { monthOffset: -1, day: 21 } },
  4: { start: { monthOffset: -2, day: 23 }, end: { monthOffset: -1, day: 22 } },
  5: { start: { monthOffset: -2, day: 24 }, end: { monthOffset: -1, day: 23 } },
  6: { start: { monthOffset: -2, day: 25 }, end: { monthOffset: -1, day: 24 } },
  7: { start: { monthOffset: -2, day: 26 }, end: { monthOffset: -1, day: 25 } },
  8: { start: { monthOffset: -2, day: 27 }, end: { monthOffset: -1, day: 26 } },
  9: { start: { monthOffset: -2, day: 28 }, end: { monthOffset: -1, day: 27 } },
  10: { start: { monthOffset: -2, day: 29 }, end: { monthOffset: -1, day: 28 } },
  11: { start: { monthOffset: -2, day: 30 }, end: { monthOffset: -1, day: 29 } },
  12: { start: { monthOffset: -1, day: 1 }, end: { monthOffset: -1, day: 31 } }, // 추천!
  13: { start: { monthOffset: -1, day: 2 }, end: { monthOffset: 0, day: 1 } },
  14: { start: { monthOffset: -1, day: 3 }, end: { monthOffset: 0, day: 2 } },
  15: { start: { monthOffset: -1, day: 4 }, end: { monthOffset: 0, day: 3 } },
  16: { start: { monthOffset: -1, day: 5 }, end: { monthOffset: 0, day: 4 } },
  17: { start: { monthOffset: -1, day: 6 }, end: { monthOffset: 0, day: 5 } },
  18: { start: { monthOffset: -1, day: 7 }, end: { monthOffset: 0, day: 6 } },
  19: { start: { monthOffset: -1, day: 8 }, end: { monthOffset: 0, day: 7 } },
  20: { start: { monthOffset: -1, day: 9 }, end: { monthOffset: 0, day: 8 } },
  21: { start: { monthOffset: -1, day: 10 }, end: { monthOffset: 0, day: 9 } },
  22: { start: { monthOffset: -1, day: 11 }, end: { monthOffset: 0, day: 10 } },
  23: { start: { monthOffset: -1, day: 12 }, end: { monthOffset: 0, day: 11 } },
  24: { start: { monthOffset: -1, day: 13 }, end: { monthOffset: 0, day: 12 } },
  25: { start: { monthOffset: -1, day: 14 }, end: { monthOffset: 0, day: 13 } },
  26: { start: { monthOffset: -1, day: 15 }, end: { monthOffset: 0, day: 14 } },
};

/**
 * 롯데카드
 * 출처: https://www.lottecard.co.kr
 * 추천 결제일: 14일 (전월 1일~말일)
 */
const LOTTE_RULES: PaymentDayRules = {
  1: { start: { monthOffset: -2, day: 18 }, end: { monthOffset: -1, day: 17 } },
  5: { start: { monthOffset: -2, day: 22 }, end: { monthOffset: -1, day: 21 } },
  7: { start: { monthOffset: -2, day: 24 }, end: { monthOffset: -1, day: 23 } },
  10: { start: { monthOffset: -2, day: 27 }, end: { monthOffset: -1, day: 26 } },
  14: { start: { monthOffset: -1, day: 1 }, end: { monthOffset: -1, day: 31 } }, // 추천!
  15: { start: { monthOffset: -1, day: 2 }, end: { monthOffset: 0, day: 1 } },
  17: { start: { monthOffset: -1, day: 4 }, end: { monthOffset: 0, day: 3 } },
  20: { start: { monthOffset: -1, day: 7 }, end: { monthOffset: 0, day: 6 } },
  21: { start: { monthOffset: -1, day: 8 }, end: { monthOffset: 0, day: 7 } },
  22: { start: { monthOffset: -1, day: 9 }, end: { monthOffset: 0, day: 8 } },
  23: { start: { monthOffset: -1, day: 10 }, end: { monthOffset: 0, day: 9 } },
  24: { start: { monthOffset: -1, day: 11 }, end: { monthOffset: 0, day: 10 } },
  25: { start: { monthOffset: -1, day: 12 }, end: { monthOffset: 0, day: 11 } },
};

/**
 * 우리카드
 * 출처: https://www.wooricard.com
 * 추천 결제일: 14일 (전월 1일~말일)
 */
const WOORI_RULES: PaymentDayRules = {
  1: { start: { monthOffset: -2, day: 18 }, end: { monthOffset: -1, day: 17 } },
  2: { start: { monthOffset: -2, day: 19 }, end: { monthOffset: -1, day: 18 } },
  3: { start: { monthOffset: -2, day: 20 }, end: { monthOffset: -1, day: 19 } },
  4: { start: { monthOffset: -2, day: 21 }, end: { monthOffset: -1, day: 20 } },
  5: { start: { monthOffset: -2, day: 22 }, end: { monthOffset: -1, day: 21 } },
  6: { start: { monthOffset: -2, day: 23 }, end: { monthOffset: -1, day: 22 } },
  7: { start: { monthOffset: -2, day: 24 }, end: { monthOffset: -1, day: 23 } },
  8: { start: { monthOffset: -2, day: 25 }, end: { monthOffset: -1, day: 24 } },
  9: { start: { monthOffset: -2, day: 26 }, end: { monthOffset: -1, day: 25 } },
  10: { start: { monthOffset: -2, day: 27 }, end: { monthOffset: -1, day: 26 } },
  11: { start: { monthOffset: -2, day: 28 }, end: { monthOffset: -1, day: 27 } },
  12: { start: { monthOffset: -2, day: 29 }, end: { monthOffset: -1, day: 28 } },
  13: { start: { monthOffset: -2, day: 30 }, end: { monthOffset: -1, day: 29 } },
  14: { start: { monthOffset: -1, day: 1 }, end: { monthOffset: -1, day: 31 } }, // 추천!
  15: { start: { monthOffset: -1, day: 2 }, end: { monthOffset: 0, day: 1 } },
  16: { start: { monthOffset: -1, day: 3 }, end: { monthOffset: 0, day: 2 } },
  17: { start: { monthOffset: -1, day: 4 }, end: { monthOffset: 0, day: 3 } },
  18: { start: { monthOffset: -1, day: 5 }, end: { monthOffset: 0, day: 4 } },
  19: { start: { monthOffset: -1, day: 6 }, end: { monthOffset: 0, day: 5 } },
  20: { start: { monthOffset: -1, day: 7 }, end: { monthOffset: 0, day: 6 } },
  21: { start: { monthOffset: -1, day: 8 }, end: { monthOffset: 0, day: 7 } },
  22: { start: { monthOffset: -1, day: 9 }, end: { monthOffset: 0, day: 8 } },
  23: { start: { monthOffset: -1, day: 10 }, end: { monthOffset: 0, day: 9 } },
  24: { start: { monthOffset: -1, day: 11 }, end: { monthOffset: 0, day: 10 } },
  25: { start: { monthOffset: -1, day: 12 }, end: { monthOffset: 0, day: 11 } },
  26: { start: { monthOffset: -1, day: 13 }, end: { monthOffset: 0, day: 12 } },
  27: { start: { monthOffset: -1, day: 14 }, end: { monthOffset: 0, day: 13 } },
};

/**
 * 하나카드
 * 출처: https://www.hanacard.co.kr/OSA15000000N.web
 * 추천 결제일: 13일 (전월 1일~말일)
 */
const HANA_RULES: PaymentDayRules = {
  1: { start: { monthOffset: -2, day: 19 }, end: { monthOffset: -1, day: 18 } },
  5: { start: { monthOffset: -2, day: 23 }, end: { monthOffset: -1, day: 22 } },
  7: { start: { monthOffset: -2, day: 25 }, end: { monthOffset: -1, day: 24 } },
  8: { start: { monthOffset: -2, day: 26 }, end: { monthOffset: -1, day: 25 } },
  10: { start: { monthOffset: -2, day: 28 }, end: { monthOffset: -1, day: 27 } },
  12: { start: { monthOffset: -2, day: 30 }, end: { monthOffset: -1, day: 29 } },
  13: { start: { monthOffset: -1, day: 1 }, end: { monthOffset: -1, day: 31 } }, // 추천!
  14: { start: { monthOffset: -1, day: 2 }, end: { monthOffset: 0, day: 1 } },
  15: { start: { monthOffset: -1, day: 3 }, end: { monthOffset: 0, day: 2 } },
  17: { start: { monthOffset: -1, day: 5 }, end: { monthOffset: 0, day: 4 } },
  18: { start: { monthOffset: -1, day: 6 }, end: { monthOffset: 0, day: 5 } },
  20: { start: { monthOffset: -1, day: 8 }, end: { monthOffset: 0, day: 7 } },
  21: { start: { monthOffset: -1, day: 9 }, end: { monthOffset: 0, day: 8 } },
  23: { start: { monthOffset: -1, day: 11 }, end: { monthOffset: 0, day: 10 } },
  25: { start: { monthOffset: -1, day: 13 }, end: { monthOffset: 0, day: 12 } },
  27: { start: { monthOffset: -1, day: 15 }, end: { monthOffset: 0, day: 14 } },
};

/**
 * NH농협카드
 * 출처: https://card.nonghyup.com
 * 추천 결제일: 14일 (전월 1일~말일)
 */
const NH_RULES: PaymentDayRules = {
  1: { start: { monthOffset: -2, day: 18 }, end: { monthOffset: -1, day: 17 } },
  2: { start: { monthOffset: -2, day: 19 }, end: { monthOffset: -1, day: 18 } },
  3: { start: { monthOffset: -2, day: 20 }, end: { monthOffset: -1, day: 19 } },
  4: { start: { monthOffset: -2, day: 21 }, end: { monthOffset: -1, day: 20 } },
  5: { start: { monthOffset: -2, day: 22 }, end: { monthOffset: -1, day: 21 } },
  6: { start: { monthOffset: -2, day: 23 }, end: { monthOffset: -1, day: 22 } },
  7: { start: { monthOffset: -2, day: 24 }, end: { monthOffset: -1, day: 23 } },
  8: { start: { monthOffset: -2, day: 25 }, end: { monthOffset: -1, day: 24 } },
  9: { start: { monthOffset: -2, day: 26 }, end: { monthOffset: -1, day: 25 } },
  10: { start: { monthOffset: -2, day: 27 }, end: { monthOffset: -1, day: 26 } },
  11: { start: { monthOffset: -2, day: 28 }, end: { monthOffset: -1, day: 27 } },
  12: { start: { monthOffset: -2, day: 29 }, end: { monthOffset: -1, day: 28 } },
  13: { start: { monthOffset: -2, day: 30 }, end: { monthOffset: -1, day: 29 } },
  14: { start: { monthOffset: -1, day: 1 }, end: { monthOffset: -1, day: 31 } }, // 추천!
  15: { start: { monthOffset: -1, day: 2 }, end: { monthOffset: 0, day: 1 } },
  16: { start: { monthOffset: -1, day: 3 }, end: { monthOffset: 0, day: 2 } },
  17: { start: { monthOffset: -1, day: 4 }, end: { monthOffset: 0, day: 3 } },
  18: { start: { monthOffset: -1, day: 5 }, end: { monthOffset: 0, day: 4 } },
  19: { start: { monthOffset: -1, day: 6 }, end: { monthOffset: 0, day: 5 } },
  20: { start: { monthOffset: -1, day: 7 }, end: { monthOffset: 0, day: 6 } },
  21: { start: { monthOffset: -1, day: 8 }, end: { monthOffset: 0, day: 7 } },
  22: { start: { monthOffset: -1, day: 9 }, end: { monthOffset: 0, day: 8 } },
  23: { start: { monthOffset: -1, day: 10 }, end: { monthOffset: 0, day: 9 } },
  24: { start: { monthOffset: -1, day: 11 }, end: { monthOffset: 0, day: 10 } },
  25: { start: { monthOffset: -1, day: 12 }, end: { monthOffset: 0, day: 11 } },
  26: { start: { monthOffset: -1, day: 13 }, end: { monthOffset: 0, day: 12 } },
  27: { start: { monthOffset: -1, day: 14 }, end: { monthOffset: 0, day: 13 } },
};

/**
 * BC카드 (BC바로카드)
 * 출처: https://www.bccard.com
 * 추천 결제일: 12일 (전월 1일~말일 없음, 가장 가까운 날짜)
 * 주의: BC카드는 회원사별로 다를 수 있음
 */
const BC_RULES: PaymentDayRules = {
  1: { start: { monthOffset: -2, day: 19 }, end: { monthOffset: -1, day: 18 } },
  5: { start: { monthOffset: -2, day: 23 }, end: { monthOffset: -1, day: 22 } },
  8: { start: { monthOffset: -2, day: 26 }, end: { monthOffset: -1, day: 25 } },
  12: { start: { monthOffset: -2, day: 30 }, end: { monthOffset: -1, day: 29 } },
  15: { start: { monthOffset: -1, day: 3 }, end: { monthOffset: 0, day: 2 } },
  23: { start: { monthOffset: -1, day: 11 }, end: { monthOffset: 0, day: 10 } },
  25: { start: { monthOffset: -1, day: 13 }, end: { monthOffset: 0, day: 12 } },
  27: { start: { monthOffset: -1, day: 15 }, end: { monthOffset: 0, day: 14 } },
};

/**
 * 카카오뱅크 (체크카드만 - 신용카드 없음)
 * 체크카드는 즉시 결제되므로 산정기간 없음
 */
const KAKAOBANK_RULES: PaymentDayRules = {};

/**
 * 토스뱅크 (체크카드만 - 신용카드 없음)
 * 체크카드는 즉시 결제되므로 산정기간 없음
 */
const TOSSBANK_RULES: PaymentDayRules = {};

/**
 * 케이뱅크 (체크카드만)
 * 결제일 15일 고정, 전월 1일~말일
 */
const KBANK_RULES: PaymentDayRules = {
  15: { start: { monthOffset: -1, day: 1 }, end: { monthOffset: -1, day: 31 } },
};

/**
 * 카드사별 산정기간 규칙
 */
export const CARD_COMPANY_BILLING_RULES: Record<string, CardCompanyBillingRules> = {
  samsung: {
    companyId: 'samsung',
    companyName: '삼성카드',
    availablePaymentDays: [1, 5, 10, 11, 12, 13, 14, 15, 18, 21, 22, 23, 24, 25, 26],
    recommendedDay: 13,
    rules: SAMSUNG_RULES,
  },
  shinhan: {
    companyId: 'shinhan',
    companyName: '신한카드',
    availablePaymentDays: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27],
    recommendedDay: 14,
    rules: SHINHAN_RULES,
  },
  kookmin: {
    companyId: 'kookmin',
    companyName: 'KB국민카드',
    availablePaymentDays: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27],
    recommendedDay: 14,
    rules: KOOKMIN_RULES,
  },
  hyundai: {
    companyId: 'hyundai',
    companyName: '현대카드',
    availablePaymentDays: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26],
    recommendedDay: 12,
    rules: HYUNDAI_RULES,
  },
  lotte: {
    companyId: 'lotte',
    companyName: '롯데카드',
    availablePaymentDays: [1, 5, 7, 10, 14, 15, 17, 20, 21, 22, 23, 24, 25],
    recommendedDay: 14,
    rules: LOTTE_RULES,
  },
  woori: {
    companyId: 'woori',
    companyName: '우리카드',
    availablePaymentDays: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27],
    recommendedDay: 14,
    rules: WOORI_RULES,
  },
  hana: {
    companyId: 'hana',
    companyName: '하나카드',
    availablePaymentDays: [1, 5, 7, 8, 10, 12, 13, 14, 15, 17, 18, 20, 21, 23, 25, 27],
    recommendedDay: 13,
    rules: HANA_RULES,
  },
  nh: {
    companyId: 'nh',
    companyName: 'NH농협카드',
    availablePaymentDays: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27],
    recommendedDay: 14,
    rules: NH_RULES,
  },
  bc: {
    companyId: 'bc',
    companyName: 'BC카드',
    availablePaymentDays: [1, 5, 8, 12, 15, 23, 25, 27],
    recommendedDay: 12,
    rules: BC_RULES,
  },
  kakaobank: {
    companyId: 'kakaobank',
    companyName: '카카오뱅크',
    availablePaymentDays: [], // 체크카드만
    recommendedDay: 0,
    rules: KAKAOBANK_RULES,
  },
  tossbank: {
    companyId: 'tossbank',
    companyName: '토스뱅크',
    availablePaymentDays: [], // 체크카드만
    recommendedDay: 0,
    rules: TOSSBANK_RULES,
  },
  kbank: {
    companyId: 'kbank',
    companyName: '케이뱅크',
    availablePaymentDays: [15], // 15일 고정
    recommendedDay: 15,
    rules: KBANK_RULES,
  },
  other: {
    companyId: 'other',
    companyName: '기타',
    availablePaymentDays: [1, 5, 10, 12, 13, 14, 15, 20, 25, 27],
    recommendedDay: 14,
    rules: SHINHAN_RULES, // 기본값으로 신한카드 규칙 사용 (가장 일반적)
  },
};

/**
 * 카드사와 결제일로 산정기간 계산
 * @param companyId 카드사 ID
 * @param paymentDay 결제일
 * @param paymentMonth 결제월 (Date 객체)
 * @returns 산정기간 { startDate, endDate }
 */
export function getBillingPeriodByCompany(
  companyId: string,
  paymentDay: number,
  paymentMonth: Date
): { startDate: Date; endDate: Date; startDay: number; endDay: number } | null {
  const companyRules = CARD_COMPANY_BILLING_RULES[companyId];
  if (!companyRules) return null;

  const rule = companyRules.rules[paymentDay];
  if (!rule) return null;

  const paymentYear = paymentMonth.getFullYear();
  const paymentMonthIndex = paymentMonth.getMonth();

  // 산정 시작일 계산
  const startDate = new Date(
    paymentYear,
    paymentMonthIndex + rule.start.monthOffset,
    rule.start.day
  );

  // 산정 종료일 계산 (day가 31인 경우 해당 월의 마지막 날로 조정)
  let endDay = rule.end.day;
  if (endDay === 31) {
    const tempDate = new Date(paymentYear, paymentMonthIndex + rule.end.monthOffset + 1, 0);
    endDay = tempDate.getDate();
  }

  const endDate = new Date(
    paymentYear,
    paymentMonthIndex + rule.end.monthOffset,
    endDay
  );

  return {
    startDate,
    endDate,
    startDay: rule.start.day,
    endDay: rule.end.day,
  };
}

/**
 * 카드사의 가용 결제일 목록 가져오기
 */
export function getAvailablePaymentDays(companyId: string): number[] {
  const companyRules = CARD_COMPANY_BILLING_RULES[companyId];
  return companyRules?.availablePaymentDays || [1, 5, 10, 14, 15, 20, 25];
}

/**
 * 카드사의 추천 결제일 가져오기
 */
export function getRecommendedPaymentDay(companyId: string): number {
  const companyRules = CARD_COMPANY_BILLING_RULES[companyId];
  return companyRules?.recommendedDay || 14;
}

import i18n from '../i18n';

/**
 * Format billing period text (i18n)
 */
export function formatBillingPeriodText(
  companyId: string,
  paymentDay: number
): string | null {
  const companyRules = CARD_COMPANY_BILLING_RULES[companyId];
  if (!companyRules) return null;

  const rule = companyRules.rules[paymentDay];
  if (!rule) return null;

  const startMonth = rule.start.monthOffset === -2
    ? i18n.t('card.twoMonthsAgo')
    : i18n.t('card.prevMonth');
  const endMonth = rule.end.monthOffset === -1
    ? i18n.t('card.prevMonth')
    : i18n.t('card.currentMonth');
  const dayUnit = i18n.t('card.dayUnit');
  const endDay = rule.end.day === 31
    ? i18n.t('common.lastDay', { defaultValue: 'last' })
    : `${rule.end.day}${dayUnit}`;

  return `${startMonth} ${rule.start.day}${dayUnit} ~ ${endMonth} ${endDay}`;
}
