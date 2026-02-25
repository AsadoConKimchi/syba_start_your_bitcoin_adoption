export const CONFIG = {
  // 암호화
  PBKDF2_ITERATIONS: 100000,

  // 인증
  MAX_LOGIN_ATTEMPTS: 5,
  LOCKOUT_DURATION_MS: 5 * 60 * 1000, // 5분

  // 구독 (폴백 가격 — DB에서 가져오지 못할 때 사용)
  FALLBACK_MONTHLY_PRICE_SATS: 1000,
  SUBSCRIPTION_GRACE_PERIOD_DAYS: 7,

  // 구독 티어별 폴백 가격 (sats) — multiplier × monthly price
  SUBSCRIPTION_TIERS: {
    monthly:  { price: 1000,  durationDays: 30,  multiplier: 1  },
    annual:   { price: 10000, durationDays: 365, multiplier: 10 },
    lifetime: { price: 60000, durationDays: -1,  multiplier: 60 },
  },

  // 웹 결제 페이지 URL
  WEB_PAYMENT_URL: 'https://syba-sats.vercel.app/subscribe',

  // API
  PRICE_CACHE_DURATION_MS: 60 * 1000, // 1분

  // 자동 잠금 옵션 (밀리초)
  AUTO_LOCK_OPTIONS: {
    immediate: 0,
    '1min': 60 * 1000,
    '5min': 5 * 60 * 1000,
    '15min': 15 * 60 * 1000,
    '30min': 30 * 60 * 1000,
    never: -1,
  },

  // 무료 기능 제한
  FREE_MAX_CARDS: 3,
} as const;

export type AutoLockTime = keyof typeof CONFIG.AUTO_LOCK_OPTIONS;
