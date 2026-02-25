-- ============================================================
-- 003: CS & Business Operations Improvements
-- Date: 2026-02-25
-- Description:
--   - User display_id for CS identification
--   - cs_actions table for CS action logging
--   - subscription_history table with auto-trigger
--   - Business metric views (subscription, revenue, discount)
--   - Admin RPC functions (manual activate, expire)
--   - Auto-expire function for pg_cron
-- ============================================================

-- ============================================================
-- 1. users 테이블: display_id + memo 컬럼 추가
-- ============================================================

-- display_id: linking_key에서 접두사(02/03) 제거 후 8자리 추출
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'display_id'
  ) THEN
    ALTER TABLE users ADD COLUMN display_id VARCHAR(8);
  END IF;
END $$;

-- memo: 관리자가 유저를 메모할 수 있는 필드
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'memo'
  ) THEN
    ALTER TABLE users ADD COLUMN memo TEXT;
  END IF;
END $$;

-- 기존 유저의 display_id 일괄 채우기
UPDATE users
SET display_id = SUBSTRING(linking_key FROM 3 FOR 8)
WHERE display_id IS NULL AND linking_key IS NOT NULL;

-- 새 유저 생성 시 display_id 자동 설정하는 트리거
CREATE OR REPLACE FUNCTION set_display_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.display_id IS NULL AND NEW.linking_key IS NOT NULL THEN
    NEW.display_id := SUBSTRING(NEW.linking_key FROM 3 FOR 8);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_display_id ON users;
CREATE TRIGGER trg_set_display_id
  BEFORE INSERT ON users
  FOR EACH ROW
  EXECUTE FUNCTION set_display_id();

-- display_id 인덱스 (CS 검색용)
CREATE INDEX IF NOT EXISTS idx_users_display_id ON users (display_id);

-- ============================================================
-- 2. cs_actions: CS 조치 기록 테이블
-- ============================================================

CREATE TABLE IF NOT EXISTS cs_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  action_type VARCHAR(30) NOT NULL CHECK (action_type IN (
    'manual_activate',    -- 수동 구독 활성화
    'extend_period',      -- 구독 기간 연장
    'revoke',             -- 구독 회수
    'refund_credit',      -- 환불/크레딧 처리
    'memo'                -- 메모/기타
  )),
  detail TEXT,            -- 자유 텍스트 메모
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cs_actions_user ON cs_actions (user_id);
CREATE INDEX IF NOT EXISTS idx_cs_actions_date ON cs_actions (created_at DESC);

-- ============================================================
-- 3. subscription_history: 구독 상태 변경 이력 (자동 기록)
-- ============================================================

CREATE TABLE IF NOT EXISTS subscription_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL,
  user_id UUID NOT NULL,
  old_status VARCHAR(20),
  new_status VARCHAR(20),
  old_tier VARCHAR(20),
  new_tier VARCHAR(20),
  old_expires_at TIMESTAMPTZ,
  new_expires_at TIMESTAMPTZ,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  change_source VARCHAR(20) DEFAULT 'app'  -- 'app', 'admin', 'auto_expire'
);

CREATE INDEX IF NOT EXISTS idx_sub_history_user ON subscription_history (user_id);
CREATE INDEX IF NOT EXISTS idx_sub_history_date ON subscription_history (changed_at DESC);

-- 구독 변경 시 자동 이력 기록 트리거
CREATE OR REPLACE FUNCTION log_subscription_change()
RETURNS TRIGGER AS $$
BEGIN
  -- status, tier, expires_at 중 하나라도 변경되면 기록
  IF OLD.status IS DISTINCT FROM NEW.status
     OR OLD.tier IS DISTINCT FROM NEW.tier
     OR OLD.expires_at IS DISTINCT FROM NEW.expires_at THEN
    INSERT INTO subscription_history (
      subscription_id, user_id,
      old_status, new_status,
      old_tier, new_tier,
      old_expires_at, new_expires_at
    ) VALUES (
      NEW.id, NEW.user_id,
      OLD.status, NEW.status,
      OLD.tier, NEW.tier,
      OLD.expires_at, NEW.expires_at
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_log_subscription_change ON subscriptions;
CREATE TRIGGER trg_log_subscription_change
  AFTER UPDATE ON subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION log_subscription_change();

-- ============================================================
-- 4. 사업 지표 View
-- ============================================================

-- 4-1. 구독 현황 요약
CREATE OR REPLACE VIEW v_subscription_summary AS
SELECT
  COUNT(*) FILTER (WHERE s.status = 'active' AND (s.is_lifetime = true OR s.expires_at > now())) AS active_subscribers,
  COUNT(*) FILTER (WHERE s.status = 'active' AND s.tier = 'monthly' AND s.expires_at > now()) AS monthly_active,
  COUNT(*) FILTER (WHERE s.status = 'active' AND s.tier = 'annual' AND s.expires_at > now()) AS annual_active,
  COUNT(*) FILTER (WHERE s.status = 'active' AND s.is_lifetime = true) AS lifetime_active,
  COUNT(*) FILTER (WHERE s.status = 'expired') AS expired_total,
  COUNT(*) FILTER (WHERE s.created_at >= date_trunc('month', now())) AS new_this_month,
  (SELECT COUNT(*) FROM users) AS total_users
FROM subscriptions s;

-- 4-2. 월별 매출
CREATE OR REPLACE VIEW v_revenue_monthly AS
SELECT
  to_char(paid_at, 'YYYY-MM') AS month,
  COUNT(*) AS payment_count,
  SUM(amount_sats) AS total_sats,
  ROUND(AVG(amount_sats)) AS avg_sats,
  SUM(discount_amount_sats) AS total_discount_sats
FROM payments
WHERE status = 'paid'
GROUP BY to_char(paid_at, 'YYYY-MM')
ORDER BY month DESC;

-- 4-3. 할인코드 사용 현황
CREATE OR REPLACE VIEW v_discount_usage AS
SELECT
  dc.code,
  dc.discount_type,
  dc.discount_value,
  dc.current_uses,
  dc.max_uses,
  COALESCE(SUM(p.discount_amount_sats), 0) AS total_discounted_sats,
  COUNT(p.id) AS paid_count,
  dc.valid_until,
  dc.is_active
FROM discount_codes dc
LEFT JOIN payments p ON p.discount_code_id = dc.id AND p.status = 'paid'
GROUP BY dc.id
ORDER BY dc.current_uses DESC;

-- ============================================================
-- 5. 관리자 RPC 함수
-- ============================================================

-- 5-1. 수동 구독 활성화 (결제-구독 불일치 복구용)
CREATE OR REPLACE FUNCTION admin_activate_subscription(
  p_display_id VARCHAR,
  p_tier VARCHAR DEFAULT 'monthly',
  p_note TEXT DEFAULT NULL
)
RETURNS TEXT AS $$
DECLARE
  v_user_id UUID;
  v_duration INT;
  v_expires TIMESTAMPTZ;
  v_is_lifetime BOOLEAN;
BEGIN
  -- 유저 찾기
  SELECT id INTO v_user_id FROM users WHERE display_id = p_display_id;
  IF v_user_id IS NULL THEN
    RETURN 'ERROR: User not found with display_id = ' || p_display_id;
  END IF;

  -- 티어별 기간 계산
  SELECT duration_days INTO v_duration FROM subscription_prices WHERE tier = p_tier;
  IF v_duration IS NULL THEN
    RETURN 'ERROR: Invalid tier = ' || p_tier;
  END IF;

  v_is_lifetime := (v_duration = -1);
  v_expires := CASE WHEN v_is_lifetime THEN NULL ELSE now() + (v_duration || ' days')::INTERVAL END;

  -- 구독 생성/업데이트
  INSERT INTO subscriptions (user_id, status, tier, is_lifetime, started_at, expires_at)
  VALUES (v_user_id, 'active', p_tier, v_is_lifetime, now(), v_expires)
  ON CONFLICT (user_id) DO UPDATE SET
    status = 'active',
    tier = p_tier,
    is_lifetime = v_is_lifetime,
    started_at = now(),
    expires_at = v_expires;

  -- CS 기록
  INSERT INTO cs_actions (user_id, action_type, detail)
  VALUES (v_user_id, 'manual_activate',
    'Tier: ' || p_tier || COALESCE(', Note: ' || p_note, ''));

  RETURN 'OK: Activated ' || p_tier || ' for ' || p_display_id;
END;
$$ LANGUAGE plpgsql;

-- 5-2. 구독 기간 연장
CREATE OR REPLACE FUNCTION admin_extend_subscription(
  p_display_id VARCHAR,
  p_days INT,
  p_note TEXT DEFAULT NULL
)
RETURNS TEXT AS $$
DECLARE
  v_user_id UUID;
  v_current_expires TIMESTAMPTZ;
BEGIN
  SELECT id INTO v_user_id FROM users WHERE display_id = p_display_id;
  IF v_user_id IS NULL THEN
    RETURN 'ERROR: User not found with display_id = ' || p_display_id;
  END IF;

  SELECT expires_at INTO v_current_expires
  FROM subscriptions WHERE user_id = v_user_id AND status = 'active';

  IF v_current_expires IS NULL THEN
    RETURN 'ERROR: No active subscription found (or lifetime)';
  END IF;

  UPDATE subscriptions
  SET expires_at = expires_at + (p_days || ' days')::INTERVAL
  WHERE user_id = v_user_id AND status = 'active';

  INSERT INTO cs_actions (user_id, action_type, detail)
  VALUES (v_user_id, 'extend_period',
    'Extended ' || p_days || ' days' || COALESCE(', Note: ' || p_note, ''));

  RETURN 'OK: Extended ' || p_days || ' days for ' || p_display_id ||
         ' (was: ' || v_current_expires::TEXT || ')';
END;
$$ LANGUAGE plpgsql;

-- 5-3. 구독 회수
CREATE OR REPLACE FUNCTION admin_revoke_subscription(
  p_display_id VARCHAR,
  p_note TEXT DEFAULT NULL
)
RETURNS TEXT AS $$
DECLARE
  v_user_id UUID;
BEGIN
  SELECT id INTO v_user_id FROM users WHERE display_id = p_display_id;
  IF v_user_id IS NULL THEN
    RETURN 'ERROR: User not found with display_id = ' || p_display_id;
  END IF;

  UPDATE subscriptions
  SET status = 'expired', expires_at = now()
  WHERE user_id = v_user_id AND status = 'active';

  INSERT INTO cs_actions (user_id, action_type, detail)
  VALUES (v_user_id, 'revoke', COALESCE(p_note, 'Admin revoked'));

  RETURN 'OK: Revoked subscription for ' || p_display_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 6. 만료 자동 처리 함수 (pg_cron 또는 수동 실행)
-- ============================================================

CREATE OR REPLACE FUNCTION auto_expire_subscriptions()
RETURNS INT AS $$
DECLARE
  expired_count INT;
BEGIN
  WITH expired AS (
    UPDATE subscriptions
    SET status = 'expired'
    WHERE status = 'active'
      AND is_lifetime = false
      AND expires_at IS NOT NULL
      AND expires_at < now()
    RETURNING id
  )
  SELECT COUNT(*) INTO expired_count FROM expired;

  RETURN expired_count;
END;
$$ LANGUAGE plpgsql;

-- pg_cron 설정 (Supabase Dashboard에서 Extensions > pg_cron 활성화 필요)
-- 매일 오전 3시(UTC)에 실행 = KST 정오 12시
-- Dashboard SQL Editor에서 아래를 실행:
-- SELECT cron.schedule('auto-expire-subs', '0 3 * * *', 'SELECT auto_expire_subscriptions()');
