-- ============================================================
-- 002: subscription_prices에 base_multiplier 컬럼 추가
-- 월간 가격(base) × multiplier = 각 티어 실제 가격
-- 월간 가격만 변경하면 전체 가격이 자동으로 연동됨
-- ============================================================

ALTER TABLE subscription_prices
ADD COLUMN IF NOT EXISTS base_multiplier INTEGER NOT NULL DEFAULT 1;

-- 배수 설정: monthly × 1, annual × 10, lifetime × 60
UPDATE subscription_prices SET base_multiplier = 1  WHERE tier = 'monthly';
UPDATE subscription_prices SET base_multiplier = 10 WHERE tier = 'annual';
UPDATE subscription_prices SET base_multiplier = 60 WHERE tier = 'lifetime';

-- 확인용 COMMENT
COMMENT ON COLUMN subscription_prices.base_multiplier IS 'monthly price_sats × base_multiplier = effective price for this tier';
