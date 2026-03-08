-- ============================================================
-- 004: users 테이블에 email 컬럼 추가
-- Date: 2026-03-07
-- Description:
--   - users.email 컬럼 추가 (optional, CS/마케팅 연락처)
--   - updateUserEmail() RPC 지원
--   - RLS: 사용자 본인만 자신의 email 업데이트 가능
-- ============================================================

-- email 컬럼 추가
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'email'
  ) THEN
    ALTER TABLE users ADD COLUMN email TEXT;
    COMMENT ON COLUMN users.email IS 'Optional user email for CS and notifications';
  END IF;
END $$;

-- 인덱스: 이메일 기반 CS 조회 (nullable이므로 WHERE IS NOT NULL 조건부)
CREATE INDEX IF NOT EXISTS idx_users_email ON users (email) WHERE email IS NOT NULL;

-- ============================================================
-- RLS 정책 (Row Level Security)
-- NOTE: 아래 정책은 Supabase Dashboard > Authentication > Policies 에서
--       직접 확인/적용하거나, 이미 RLS가 활성화된 경우 아래 SQL 실행
-- ============================================================

-- users 테이블에 RLS가 활성화되어 있다면 email 업데이트 정책 추가
-- (이미 동일 이름의 정책이 없는 경우에만 적용)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'users' AND policyname = 'Users can update own email'
  ) THEN
    EXECUTE '
      CREATE POLICY "Users can update own email"
      ON users
      FOR UPDATE
      USING (auth.uid() = id)
      WITH CHECK (auth.uid() = id)
    ';
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- RLS not enabled or policy creation failed — apply manually if needed
  RAISE NOTICE 'RLS policy skipped: %', SQLERRM;
END $$;
