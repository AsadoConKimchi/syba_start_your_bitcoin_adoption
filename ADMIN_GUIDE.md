# SYBA Admin Guide (Quick Reference)

> Full version: `SYBA_Admin_Guide_v2.docx` (same folder)

## Supabase Dashboard

```
https://supabase.com/dashboard/project/tbjfzenhrjcygvqfpqwl
```

All commands: **Dashboard > SQL Editor**

---

## User Identification

Users have an 8-character Display ID (shown in app Settings as `SYBA-xxxxxxxx`).

```sql
-- Find user
SELECT * FROM users WHERE display_id = 'a1b2c3d4';

-- Add memo
UPDATE users SET memo = 'Jin test' WHERE display_id = 'a1b2c3d4';
```

---

## CS Operations (Display ID required)

```sql
-- Activate subscription (monthly/annual/lifetime)
SELECT admin_activate_subscription('a1b2c3d4', 'monthly', 'Payment verified');

-- Extend subscription (add days)
SELECT admin_extend_subscription('a1b2c3d4', 30, 'Compensation');

-- Revoke subscription
SELECT admin_revoke_subscription('a1b2c3d4', 'Reason');

-- View CS log
SELECT * FROM cs_actions ORDER BY created_at DESC LIMIT 20;
```

---

## Business Metrics

```sql
SELECT * FROM v_subscription_summary;   -- Active subscribers, tier breakdown
SELECT * FROM v_revenue_monthly;        -- Monthly revenue
SELECT * FROM v_discount_usage;         -- Discount code performance
```

---

## Pricing (Multiplier System)

Monthly price x multiplier = tier price. Change monthly, all tiers update.

```sql
-- Change monthly base price (annual = x10, lifetime = x60)
UPDATE subscription_prices SET price_sats = 1500 WHERE tier = 'monthly';

-- View prices
SELECT tier, price_sats, base_multiplier, price_sats * base_multiplier AS effective_price
FROM subscription_prices ORDER BY base_multiplier;
```

---

## Discount Codes

```sql
-- Create new code
INSERT INTO discount_codes (code, discount_type, discount_value, max_uses, valid_until, description)
VALUES ('EARLYBIRD', 'percent', 30, 100, '2026-12-31T23:59:59Z', 'Early bird 30% off');

-- Disable code
UPDATE discount_codes SET is_active = false WHERE LOWER(code) = LOWER('EARLYBIRD');
```

---

## Full Subscriber List

```sql
SELECT u.display_id, u.memo, s.tier, s.status, s.is_lifetime, s.started_at, s.expires_at,
  CASE WHEN s.is_lifetime THEN 'LIFETIME' WHEN s.expires_at > now() THEN 'ACTIVE' ELSE 'EXPIRED' END AS state
FROM subscriptions s JOIN users u ON s.user_id = u.id
ORDER BY s.started_at DESC;
```

---

## Auto-Expire Setup (one-time)

```sql
-- Enable pg_cron extension first (Dashboard > Database > Extensions)
SELECT cron.schedule('auto-expire-subs', '0 3 * * *', 'SELECT auto_expire_subscriptions()');

-- Manual run
SELECT auto_expire_subscriptions();
```
