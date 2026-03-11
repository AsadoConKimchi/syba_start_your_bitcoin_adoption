import CryptoJS from 'crypto-js';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { CONFIG } from '../constants/config';

// SecureStore 키
export const SECURE_KEYS = {
  PASSWORD_HASH: 'password_hash',
  ENCRYPTION_SALT: 'encryption_salt',
  ENCRYPTION_KEY: 'encryption_key',
  BIOMETRIC_ENABLED: 'biometric_enabled',
  USER_ID: 'user_id',
  CRYPTO_VERSION: 'crypto_version', // '1' = legacy SHA-1, '2' = SHA-256, '3' = SHA-256 100k hash
} as const;

// Crypto version constants
export const CRYPTO_V1 = '1'; // Legacy: PBKDF2-SHA1 key + SHA256 simple hash
export const CRYPTO_V2 = '2'; // Transitional: PBKDF2-SHA256 key + PBKDF2-SHA256 hash (10k iterations)
export const CRYPTO_V3 = '3'; // Current: PBKDF2-SHA256 key + PBKDF2-SHA256 hash (100k iterations)

// 랜덤 솔트 생성
export async function generateSalt(): Promise<string> {
  const randomBytes = await Crypto.getRandomBytesAsync(32);
  return Array.from(randomBytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// 비밀번호에서 암호화 키 파생 — SHA-256 (v1.2.0+)
// PBKDF2-HMAC-SHA256, 100k iterations — chunked for UI responsiveness
export async function deriveKey(
  password: string,
  salt: string,
  onProgress?: (progress: number) => void,
): Promise<string> {
  return deriveKeyWithHasher(password, salt, CryptoJS.algo.SHA256, 8, onProgress);
}

// Legacy 키 파생 — SHA-1 (v1.1.x 호환)
export async function deriveKeySHA1(
  password: string,
  salt: string,
  onProgress?: (progress: number) => void,
): Promise<string> {
  return deriveKeyWithHasher(password, salt, CryptoJS.algo.SHA1, 5, onProgress);
}

/**
 * Generic PBKDF2 key derivation with configurable hasher.
 * @param hasherAlgo CryptoJS.algo.SHA1 or CryptoJS.algo.SHA256
 * @param hLen Hash output length in 32-bit words (SHA-1=5, SHA-256=8)
 */
async function deriveKeyWithHasher(
  password: string,
  salt: string,
  hasherAlgo: typeof CryptoJS.algo.SHA1,
  hLen: number,
  onProgress?: (progress: number) => void,
): Promise<string> {
  const iterations = CONFIG.PBKDF2_ITERATIONS;
  const keySize = 256 / 32; // 8 words = 32 bytes
  const blockCount = Math.ceil(keySize / hLen);
  const chunkSize = 5000;

  onProgress?.(0);
  await new Promise(resolve => setTimeout(resolve, 0));

  const saltWords = CryptoJS.enc.Utf8.parse(salt);
  const derivedKey = CryptoJS.lib.WordArray.create(undefined, keySize * 4);
  const totalWork = blockCount * iterations;
  let completedWork = 0;

  for (let blockIndex = 1; blockIndex <= blockCount; blockIndex++) {
    const blockIndexWord = CryptoJS.lib.WordArray.create([blockIndex]);
    const saltBlock = saltWords.clone().concat(blockIndexWord);

    const hmac = CryptoJS.algo.HMAC.create(hasherAlgo, password);
    let u = hmac.finalize(saltBlock);
    const t = u.clone();

    for (let iter = 1; iter < iterations; iter++) {
      const hmacInner = CryptoJS.algo.HMAC.create(hasherAlgo, password);
      u = hmacInner.finalize(u);

      const tWords = t.words;
      const uWords = u.words;
      for (let w = 0; w < hLen; w++) {
        tWords[w] ^= uWords[w];
      }

      completedWork++;
      if (iter % chunkSize === 0) {
        onProgress?.(completedWork / totalWork);
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }
    completedWork++;

    const offset = (blockIndex - 1) * hLen;
    const wordsToWrite = Math.min(hLen, keySize - offset);
    for (let w = 0; w < wordsToWrite; w++) {
      derivedKey.words[offset + w] = t.words[w];
    }
  }

  derivedKey.sigBytes = keySize * 4;
  onProgress?.(1);
  return derivedKey.toString();
}

// 동기 버전 — SHA-1 (레거시 pre-v0.1.10 백업 복원 전용, 신규 사용 금지)
export function deriveKeySync(password: string, salt: string): string {
  const key = CryptoJS.PBKDF2(password, salt, {
    keySize: 256 / 32,
    iterations: CONFIG.PBKDF2_ITERATIONS,
    hasher: CryptoJS.algo.SHA1,
  });
  return key.toString();
}

// 비밀번호 해시 — v3: PBKDF2-SHA256 (100k iterations)
export function hashPassword(password: string, salt: string): string {
  const key = CryptoJS.PBKDF2(password + '_verify', salt, {
    keySize: 256 / 32,
    iterations: CONFIG.PBKDF2_ITERATIONS,
    hasher: CryptoJS.algo.SHA256,
  });
  return key.toString();
}

// 비밀번호 해시 — v2 레거시 (10k iterations, 마이그레이션 검증 전용)
export function hashPasswordV2(password: string, salt: string): string {
  const key = CryptoJS.PBKDF2(password + '_verify', salt, {
    keySize: 256 / 32,
    iterations: 10000,
    hasher: CryptoJS.algo.SHA256,
  });
  return key.toString();
}

// 레거시 해시 — v1: SHA-256(password + salt + '_verify')
export function hashPasswordLegacy(password: string, salt: string): string {
  return CryptoJS.SHA256(password + salt + '_verify').toString();
}

// 데이터 암호화 (expo-crypto로 IV 생성)
export async function encrypt(data: unknown, key: string): Promise<string> {
  const jsonString = JSON.stringify(data);

  // expo-crypto로 안전한 IV 생성
  const ivBytes = await Crypto.getRandomBytesAsync(16);
  const iv = CryptoJS.lib.WordArray.create(Array.from(ivBytes) as number[]);

  const keyWordArray = CryptoJS.enc.Hex.parse(key);
  const encrypted = CryptoJS.AES.encrypt(jsonString, keyWordArray, {
    iv: iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });

  // IV + 암호문 결합 (복호화 시 필요)
  const combined = iv.toString() + ':' + encrypted.toString();
  return combined;
}

// 데이터 복호화
export function decrypt<T>(encryptedString: string, key: string): T {
  const keyWordArray = CryptoJS.enc.Hex.parse(key);

  // IV와 암호문 분리
  const parts = encryptedString.split(':');
  if (parts.length === 2) {
    // 새 포맷 (IV:암호문)
    const iv = CryptoJS.enc.Hex.parse(parts[0]);
    const decrypted = CryptoJS.AES.decrypt(parts[1], keyWordArray, {
      iv: iv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    });
    const jsonString = decrypted.toString(CryptoJS.enc.Utf8);
    if (!jsonString) {
      throw new Error('Decryption failed: incorrect password');
    }
    return JSON.parse(jsonString) as T;
  } else {
    // 기존 포맷 (호환성) — passphrase 모드로 암호화된 레거시 데이터용
    // CryptoJS passphrase 모드: 문자열 키를 내부 OpenSSL KDF로 처리
    const decrypted = CryptoJS.AES.decrypt(encryptedString, key);
    const jsonString = decrypted.toString(CryptoJS.enc.Utf8);
    if (!jsonString) {
      // Passphrase 모드 실패 시 hex key로 재시도
      const keyWordArray = CryptoJS.enc.Hex.parse(key);
      const retryDecrypted = CryptoJS.AES.decrypt(encryptedString, keyWordArray, {
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7,
      });
      const retryJson = retryDecrypted.toString(CryptoJS.enc.Utf8);
      if (!retryJson) {
        throw new Error('Decryption failed: incorrect password');
      }
      return JSON.parse(retryJson) as T;
    }
    return JSON.parse(jsonString) as T;
  }
}

// SecureStore 헬퍼
export async function saveSecure(key: string, value: string): Promise<void> {
  await SecureStore.setItemAsync(key, value);
}

export async function getSecure(key: string): Promise<string | null> {
  return await SecureStore.getItemAsync(key);
}

export async function deleteSecure(key: string): Promise<void> {
  await SecureStore.deleteItemAsync(key);
}

// 비밀번호 설정 여부 확인
export async function isPasswordSet(): Promise<boolean> {
  const hash = await getSecure(SECURE_KEYS.PASSWORD_HASH);
  return hash !== null;
}
