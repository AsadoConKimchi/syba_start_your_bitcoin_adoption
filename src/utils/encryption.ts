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
} as const;

// 랜덤 솔트 생성
export async function generateSalt(): Promise<string> {
  const randomBytes = await Crypto.getRandomBytesAsync(32);
  return Array.from(randomBytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// 비밀번호에서 암호화 키 파생 (async, progress callback 지원)
// PBKDF2-HMAC-SHA1, 100k iterations — chunked for UI responsiveness
// ⚠️ MUST use SHA-1 (CryptoJS default) for backward compatibility with existing encrypted data!
export async function deriveKey(
  password: string,
  salt: string,
  onProgress?: (progress: number) => void,
): Promise<string> {
  const iterations = CONFIG.PBKDF2_ITERATIONS;
  const keySize = 256 / 32; // 8 words = 32 bytes
  const hLen = 5; // SHA-1 output = 20 bytes = 5 words
  const blockCount = Math.ceil(keySize / hLen); // 2 blocks for 32-byte key with SHA-1
  const chunkSize = 1000; // iterations per chunk before yielding

  onProgress?.(0);
  await new Promise(resolve => setTimeout(resolve, 0));

  // Parse salt as UTF-8 (matches CryptoJS.PBKDF2 default behavior)
  const saltWords = CryptoJS.enc.Utf8.parse(salt);

  // Manual PBKDF2 implementation — byte-for-byte identical to CryptoJS.PBKDF2
  // with { keySize: 256/32, iterations } (default hasher = SHA-1)
  const derivedKey = CryptoJS.lib.WordArray.create(undefined, keySize * 4);
  const totalWork = blockCount * iterations;
  let completedWork = 0;

  for (let blockIndex = 1; blockIndex <= blockCount; blockIndex++) {
    // salt || INT(blockIndex) — 4-byte big-endian block index
    const blockIndexWord = CryptoJS.lib.WordArray.create([blockIndex]);
    const saltBlock = saltWords.clone().concat(blockIndexWord);

    // U1 = HMAC-SHA1(password, salt || INT(i))
    const hmac = CryptoJS.algo.HMAC.create(CryptoJS.algo.SHA1, password);
    let u = hmac.finalize(saltBlock);
    const t = u.clone();

    // U2..Uc: iterate and XOR
    for (let iter = 1; iter < iterations; iter++) {
      const hmacInner = CryptoJS.algo.HMAC.create(CryptoJS.algo.SHA1, password);
      u = hmacInner.finalize(u);

      // XOR into T
      const tWords = t.words;
      const uWords = u.words;
      for (let w = 0; w < hLen; w++) {
        tWords[w] ^= uWords[w];
      }

      completedWork++;

      // Yield to UI thread every chunkSize iterations
      if (iter % chunkSize === 0) {
        onProgress?.(completedWork / totalWork);
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }
    completedWork++; // count the first iteration

    // Copy block result into derivedKey
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

// Verification (run once to confirm byte-for-byte match with CryptoJS default):
// const testKey1 = CryptoJS.PBKDF2('test', 'salt', { keySize: 256/32, iterations: 100000 }).toString();
// const testKey2 = await deriveKey('test', 'salt');
// console.assert(testKey1 === testKey2, 'PBKDF2 mismatch!', testKey1, testKey2);

// 동기 버전 (레거시 호환, 내부 사용)
// 동기 버전 — SHA-1 (CryptoJS default), 기존 호환성 유지
export function deriveKeySync(password: string, salt: string): string {
  const key = CryptoJS.PBKDF2(password, salt, {
    keySize: 256 / 32,
    iterations: CONFIG.PBKDF2_ITERATIONS,
  });
  return key.toString();
}

// 비밀번호 해시 생성 (검증용) - SHA-256 사용 (빠름)
// ⚠️ PBKDF2로 바꾸면 기존 사용자 hash와 불일치 → 로그인 불가!
export function hashPassword(password: string, salt: string): string {
  return CryptoJS.SHA256(password + salt + '_verify').toString();
}

// 데이터 암호화 (expo-crypto로 IV 생성)
export async function encrypt(data: unknown, key: string): Promise<string> {
  const jsonString = JSON.stringify(data);

  // expo-crypto로 안전한 IV 생성
  const ivBytes = await Crypto.getRandomBytesAsync(16);
  const iv = CryptoJS.lib.WordArray.create(ivBytes as unknown as number[]);

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
    // 기존 포맷 (호환성)
    const decrypted = CryptoJS.AES.decrypt(encryptedString, key);
    const jsonString = decrypted.toString(CryptoJS.enc.Utf8);
    if (!jsonString) {
      throw new Error('Decryption failed: incorrect password');
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
