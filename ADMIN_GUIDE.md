# SYBA 관리자 가이드

## 프리미엄 구독 관리

### 사전 설정 (최초 1회)

Supabase SQL Editor에서 실행:
```sql
-- user_id unique 제약 추가 (이미 추가했으면 스킵)
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_user_id_unique UNIQUE (user_id);
```

---

### 사용자 식별 방법

1. 앱 → 설정 탭 → 프리미엄 구독 → "Lightning 연결됨" 아래 표시된 코드
2. 해당 코드의 **앞 8자리**를 사용
3. Supabase `users` 테이블의 `memo` 필드에 사용자 이름 메모 가능

**메모 추가:**
```sql
UPDATE users SET memo = '홍길동' WHERE linking_key LIKE '앞8자리%';
```

---

### 프리미엄 부여

```sql
-- 사용법: '앞8자리'와 개월수(숫자) 수정
INSERT INTO subscriptions (user_id, status, started_at, expires_at)
SELECT id, 'active', NOW(), NOW() + INTERVAL '3 month'
FROM users WHERE linking_key LIKE '앞8자리%'
ON CONFLICT (user_id) DO UPDATE SET
  status = 'active',
  expires_at = NOW() + INTERVAL '3 month';
```

**예시:**
```sql
-- abc12345로 시작하는 사용자에게 1개월 프리미엄
INSERT INTO subscriptions (user_id, status, started_at, expires_at)
SELECT id, 'active', NOW(), NOW() + INTERVAL '1 month'
FROM users WHERE linking_key LIKE 'abc12345%'
ON CONFLICT (user_id) DO UPDATE SET
  status = 'active',
  expires_at = NOW() + INTERVAL '1 month';
```

---

### 프리미엄 회수 (즉시 만료)

```sql
-- 사용법: '앞8자리' 수정
UPDATE subscriptions
SET status = 'expired', expires_at = NOW()
WHERE user_id = (SELECT id FROM users WHERE linking_key LIKE '앞8자리%');
```

**예시:**
```sql
-- abc12345로 시작하는 사용자의 프리미엄 회수
UPDATE subscriptions
SET status = 'expired', expires_at = NOW()
WHERE user_id = (SELECT id FROM users WHERE linking_key LIKE 'abc12345%');
```

---

### 프리미엄 연장

기존 만료일에서 추가 연장:
```sql
-- 현재 만료일에서 1개월 추가
UPDATE subscriptions
SET expires_at = expires_at + INTERVAL '1 month'
WHERE user_id = (SELECT id FROM users WHERE linking_key LIKE '앞8자리%')
  AND status = 'active';
```

---

### 전체 구독자 목록 조회

```sql
SELECT
  u.memo,
  LEFT(u.linking_key, 8) AS "식별코드",
  s.status,
  s.started_at,
  s.expires_at,
  CASE
    WHEN s.expires_at > NOW() THEN '활성'
    ELSE '만료'
  END AS "상태"
FROM subscriptions s
JOIN users u ON s.user_id = u.id
ORDER BY s.expires_at DESC;
```

---

### 구독료 변경

```sql
-- Supabase app_config 테이블에서 변경
UPDATE app_config
SET value = '15000', updated_at = NOW()
WHERE key = 'subscription_price_sats';
```

현재 가격 확인:
```sql
SELECT * FROM app_config WHERE key = 'subscription_price_sats';
```

---

## 참고

- 모든 작업은 Supabase Dashboard → SQL Editor에서 실행
- `linking_key`는 Lightning 지갑마다 고유한 값
- 사용자가 다른 지갑으로 로그인하면 새로운 `linking_key` 생성됨
