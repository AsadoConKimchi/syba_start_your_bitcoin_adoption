# SYBA Security Audit Report

**Date:** 2026-02-14  
**Auditor:** Security & Data Auditor (AI)  
**Scope:** encryption, storage, auth, services, env, app.json  

---

## Summary

| Severity | Count |
|----------|-------|
| Critical | 2 |
| Major | 6 |
| Minor | 5 |

---

## Critical

### C1. PBKDF2 uses SHA-1 (default) instead of SHA-256/512
- **File:** `src/utils/encryption.ts` L33-37
- **Detail:** `CryptoJS.PBKDF2()` defaults to SHA-1 as the hasher. 100,000 iterations with SHA-1 is below modern recommendations (OWASP recommends 600,000 for PBKDF2-SHA256 or 210,000 for SHA-512).
- **Risk:** Weaker resistance to brute-force key derivation attacks.
- **Fix:** Add `hasher: CryptoJS.algo.SHA256` or `SHA512` to the PBKDF2 config. Increase iterations to at least 600,000 (SHA-256). Note: migration path needed for existing users.

### C2. Password hash uses single SHA-256 (no stretching)
- **File:** `src/utils/encryption.ts` L52-54
- **Detail:** `hashPassword()` uses `SHA256(password + salt + '_verify')` — a single hash round. This is trivially brute-forceable if the hash leaks from SecureStore compromise.
- **Risk:** Password verification hash is not computationally expensive. An attacker who extracts SecureStore data can crack passwords quickly.
- **Fix:** Use PBKDF2 (or bcrypt/scrypt/argon2) for the verification hash too, or derive both the verification hash and the encryption key from the same PBKDF2 output (e.g., split the derived key).

---

## Major

### M1. Encryption key stored in SecureStore in plaintext
- **File:** `src/stores/authStore.ts` L93 (`saveSecure(SECURE_KEYS.ENCRYPTION_KEY, key)`)
- **Detail:** The derived encryption key is cached in SecureStore for fast login and biometric auth. If SecureStore is compromised (rooted device, backup extraction), all encrypted `.enc` files are decryptable without knowing the password.
- **Risk:** Defeats the purpose of password-based key derivation. Biometric unlock bypasses password entirely by loading the raw key.
- **Fix:** Accept this as a deliberate UX tradeoff but document the threat model. Consider requiring re-derivation periodically or after N biometric unlocks.

### M2. Legacy decrypt fallback uses passphrase mode (not AES-256-CBC with explicit key)
- **File:** `src/utils/encryption.ts` L83-88
- **Detail:** The `else` branch in `decrypt()` calls `CryptoJS.AES.decrypt(encryptedString, key)` where `key` is a string. CryptoJS treats string keys as passphrases and derives an internal key using EVP_BytesToKey (MD5-based, single iteration) — extremely weak.
- **Risk:** Any data encrypted in the old format has weak encryption.
- **Fix:** Add a migration that re-encrypts legacy-format data to the IV:ciphertext format on first successful decrypt, then remove the fallback.

### M3. Excessive debug logging with sensitive context
- **Files:** 
  - `src/utils/storage.ts` L4-5 (logs `documentDirectory`)
  - `src/stores/authStore.ts` L83-103, L108-151, L210-239 (logs auth flow details, key length, biometric results)
  - `src/utils/storage.ts` L57-61, L100-101, L166-170, L193-197 (logs file paths, encryption status)
- **Detail:** `console.log('[DEBUG]')` statements throughout auth and storage code. In production React Native builds, these are still emitted and visible via `adb logcat` or device console.
- **Risk:** Internal file paths, key existence/length, auth flow state leaked to device logs.
- **Fix:** Use `__DEV__` guard or strip console logs in production builds (e.g., `babel-plugin-transform-remove-console`).

### M4. Backup uses same encryption key as local storage
- **File:** `src/utils/storage.ts` L134-155 (`createBackup`)
- **Detail:** Backup `.enc` files are encrypted with the same `encryptionKey` used for local files. If the user shares a backup file and the key is compromised once, all data (local + backup) is exposed.
- **Risk:** No key separation between local and exported data.
- **Fix:** Derive a separate backup key (e.g., PBKDF2 with a different salt or context string), or let the user choose a separate backup password.

### M5. No certificate pinning — MITM possible
- **Files:** All `fetch()` calls in `src/services/` (supabase.ts, blinkProxy.ts, currencyService.ts, api/)
- **Detail:** No TLS certificate pinning configured. React Native / Expo does not pin by default.
- **Risk:** On compromised networks (public WiFi, corporate proxy), a MITM attacker with a rogue CA cert can intercept API traffic including Supabase anon key, payment data, and subscription status.
- **Fix:** Consider `react-native-ssl-pinning` or `expo-certificate-transparency` for critical endpoints (Supabase, Blink proxy).

### M6. Supabase client-side operations rely entirely on RLS
- **File:** `src/services/supabase.ts` L79-90 (`createPayment`), L93-108 (`updatePaymentStatus`), L111-147 (`activateSubscription`)
- **Detail:** Payment creation, status updates, and subscription activation are done client-side via Supabase JS with anon key. Security depends entirely on RLS policies being correctly configured. `updatePaymentStatus` and `activateSubscription` are particularly dangerous — a malicious client could mark payments as "paid" or create subscriptions without actual payment.
- **Risk:** If RLS is misconfigured or missing, any user can manipulate any other user's payments/subscriptions.
- **Fix:** Move payment verification and subscription activation to a server-side function (Supabase Edge Function) that validates the Lightning payment hash before updating status. Never trust the client to set `status: 'paid'`.

---

## Minor

### m1. Supabase anon key exposed via EXPO_PUBLIC_ (expected but notable)
- **File:** `.env` L3
- **Detail:** `EXPO_PUBLIC_SUPABASE_ANON_KEY` is bundled into the JS bundle. This is by design (Supabase anon key is public), but it means RLS must be bulletproof (see M6).
- **Note:** Verify no service_role key is ever used client-side. Current code looks clean.

### m2. `.env` contains real credentials in repo
- **File:** `.env` (actual Supabase URL + anon key)
- **Detail:** `.env` is in `.gitignore` ✓, but `.env.example` exists with placeholder values ✓. Good practice. Just ensure `.env` was never committed historically.
- **Fix:** Run `git log --all --full-history -- .env` to verify it was never committed.

### m3. Deprecated blink.ts still references API key pattern
- **File:** `src/services/blink.ts` L10, L22, L196
- **Detail:** File is marked `@deprecated` but still contains `API_KEY` references (empty string). If anyone accidentally imports from this file, requests will fail but the code structure suggests API key could be re-added here.
- **Fix:** Delete the file or add a runtime throw at the top.

### m4. No rate limiting on forgot-password / app reset
- **File:** Login screen (via i18n keys `forgotPassword*`)
- **Detail:** The "forgot password" flow appears to be a full app data wipe (not a server-side password reset). It requires two confirmations (warning + final confirmation). No server-side rate limiting needed since it's a destructive local-only operation.
- **Assessment:** The two-step confirmation is adequate. The worst case is the user wiping their own data, which is intentional. **Low risk.**

### m5. Blink proxy calls have no client-side auth token
- **File:** `src/services/blinkProxy.ts` L35-45
- **Detail:** HTTP POST to the Deno Deploy proxy includes no auth header. Anyone who discovers the proxy URL can call it. Rate limiting and CORS must be enforced server-side.
- **Fix:** Verify the Deno Deploy proxy has: (1) CORS restricted to app origin, (2) rate limiting per IP, (3) optionally a shared secret or Supabase JWT for auth.

---

## Positive Findings

1. **IV generation** (`encryption.ts` L59): Uses `expo-crypto` (CSPRNG) for 16-byte IV — correct.
2. **Salt generation** (`encryption.ts` L18): 32-byte random salt via CSPRNG — good.
3. **Salt uniqueness**: New salt generated on password setup and change — good.
4. **AES-256-CBC with PKCS7**: Correct mode and padding for the new format.
5. **Account lockout**: 5 attempts → 5-minute lockout (`config.ts` + `authStore.ts`) — adequate.
6. **Blink API key not in app**: Moved to server-side proxy — good architecture.
7. **HTTPS only**: All API URLs use `https://` — no plaintext HTTP.
8. **hashPassword vs deriveKey separation**: These are separate functions with different purposes (verification vs encryption) — good design, though hashPassword needs strengthening (see C2).
9. **Password change re-encrypts all data** (`storage.ts` `reEncryptAllData`) — correct approach.
10. **New salt on password change** (`authStore.ts` L180) — good.

---

## Recommended Priority

1. **C2** → Strengthen password hash (quick win, high impact)
2. **M6** → Move payment/subscription mutations to Edge Functions (prevents payment fraud)
3. **C1** → Upgrade PBKDF2 hasher + iterations (with migration)
4. **M3** → Strip debug logs in production
5. **M2** → Deprecate legacy decrypt path
6. **M4** → Separate backup encryption key
7. **M5** → Certificate pinning for critical endpoints
8. **M1** → Document SecureStore key caching threat model
