-- ============================================================
-- SYBA Subscription System v2 Migration
-- Date: 2026-02-25
-- Description: 3-tier subscriptions + discount codes + quantity limits
-- ============================================================

-- 1. subscription_prices: 티어별 가격 및 수량 관리
CREATE TABLE IF NOT EXISTS subscription_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tier VARCHAR(20) UNIQUE NOT NULL,
  price_sats INT NOT NULL,
  duration_days INT NOT NULL,              -- -1 = lifetime (무기한)
  max_quantity INT NOT NULL DEFAULT -1,    -- -1 = unlimited, 50 = 선착순 50명
  current_sold INT NOT NULL DEFAULT 0,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed: 기본 구독 티어 3종
INSERT INTO subscription_prices (tier, price_sats, duration_days, max_quantity, description) VALUES
  ('monthly',  1000,   30,  -1, 'Monthly subscription'),
  ('annual',   10000,  365, -1, 'Annual subscription (2 months free)'),
  ('lifetime', 60000,  -1,  50, 'Lifetime subscription (early adopter, limited 50)')
ON CONFLICT (tier) DO NOTHING;

-- 2. discount_codes: 할인코드 관리
CREATE TABLE IF NOT EXISTS discount_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) UNIQUE NOT NULL,
  discount_type VARCHAR(10) NOT NULL CHECK (discount_type IN ('percent', 'fixed')),
  discount_value INT NOT NULL CHECK (discount_value > 0),
  max_uses INT NOT NULL DEFAULT -1,          -- -1 = unlimited
  current_uses INT NOT NULL DEFAULT 0,
  valid_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_until TIMESTAMPTZ NOT NULL,
  applicable_tiers TEXT[] NOT NULL DEFAULT ARRAY['monthly', 'annual', 'lifetime'],
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  description TEXT
);

-- Index: 대소문자 무관 코드 검색
CREATE UNIQUE INDEX IF NOT EXISTS idx_discount_codes_lower ON discount_codes (LOWER(code));

-- Seed: 초기 할인코드
INSERT INTO discount_codes (code, discount_type, discount_value, max_uses, valid_until, applicable_tiers, description) VALUES
  ('SYBASATS', 'percent', 20, -1, '2027-12-31T23:59:59Z', ARRAY['monthly', 'annual', 'lifetime'], 'General launch discount 20%')
ON CONFLICT (code) DO NOTHING;

-- 3. subscriptions 테이블 확장
-- tier 컬럼 추가
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subscriptions' AND column_name = 'tier'
  ) THEN
    ALTER TABLE subscriptions ADD COLUMN tier VARCHAR(20) NOT NULL DEFAULT 'monthly';
  END IF;
END $$;

-- is_lifetime 컬럼 추가
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subscriptions' AND column_name = 'is_lifetime'
  ) THEN
    ALTER TABLE subscriptions ADD COLUMN is_lifetime BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;

-- 4. payments 테이블 확장
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payments' AND column_name = 'tier'
  ) THEN
    ALTER TABLE payments ADD COLUMN tier VARCHAR(20) NOT NULL DEFAULT 'monthly';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payments' AND column_name = 'original_price_sats'
  ) THEN
    ALTER TABLE payments ADD COLUMN original_price_sats INT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payments' AND column_name = 'discount_code_id'
  ) THEN
    ALTER TABLE payments ADD COLUMN discount_code_id UUID REFERENCES discount_codes(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payments' AND column_name = 'discount_amount_sats'
  ) THEN
    ALTER TABLE payments ADD COLUMN discount_amount_sats INT DEFAULT 0;
  END IF;
END $$;

-- 5. Atomic sold counter increment function (동시성 안전)
CREATE OR REPLACE FUNCTION increment_tier_sold(p_tier VARCHAR)
RETURNS BOOLEAN AS $$
DECLARE
  updated_rows INT;
BEGIN
  UPDATE subscription_prices
  SET current_sold = current_sold + 1
  WHERE tier = p_tier
    AND is_active = true
    AND (max_quantity = -1 OR current_sold < max_quantity)
  RETURNING 1 INTO updated_rows;

  RETURN updated_rows IS NOT NULL;
END;
$$ LANGUAGE plpgsql;

-- 6. Atomic discount code usage increment
CREATE OR REPLACE FUNCTION use_discount_code(p_code VARCHAR)
RETURNS UUID AS $$
DECLARE
  code_id UUID;
BEGIN
  UPDATE discount_codes
  SET current_uses = current_uses + 1
  WHERE LOWER(code) = LOWER(p_code)
    AND is_active = true
    AND now() BETWEEN valid_from AND valid_until
    AND (max_uses = -1 OR current_uses < max_uses)
  RETURNING id INTO code_id;

  RETURN code_id;
END;
$$ LANGUAGE plpgsql;
