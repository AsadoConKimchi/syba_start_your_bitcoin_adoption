import { create } from 'zustand';
import * as LocalAuthentication from 'expo-local-authentication';
import * as FileSystem from 'expo-file-system/legacy';
import i18n from '../i18n';
import {
  generateSalt,
  deriveKey,
  deriveKeySHA1,
  hashPassword,
  hashPasswordV2,
  hashPasswordLegacy,
  getSecure,
  saveSecure,
  deleteSecure,
  SECURE_KEYS,
  CRYPTO_V1,
  CRYPTO_V2,
  CRYPTO_V3,
} from '../utils/encryption';
import { initializeStorage, reEncryptAllData } from '../utils/storage';
import { CONFIG } from '../constants/config';

// 암호화 키를 Zustand state 외부에 저장 (React DevTools/메모리 덤프 노출 방지)
let _encryptionKey: string | null = null;

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  isFirstLaunch: boolean;
  biometricEnabled: boolean;
  biometricAvailable: boolean;
  biometricType: 'faceid' | 'fingerprint' | 'iris' | null;
  failedAttempts: number;
  lockedUntil: number | null;
}

interface AuthActions {
  initialize: () => Promise<void>;
  getEncryptionKey: () => string | null;
  setupPassword: (password: string, onProgress?: (progress: number) => void) => Promise<void>;
  verifyPassword: (password: string, onProgress?: (progress: number) => void) => Promise<boolean>;
  setAuthenticatedFromRestore: (encryptionKey: string) => void;
  changePassword: (currentPassword: string, newPassword: string, onProgress?: (progress: number) => void) => Promise<boolean>;
  authenticateWithBiometric: () => Promise<boolean>;
  enableBiometric: () => Promise<void>;
  disableBiometric: () => Promise<void>;
  lock: () => void;
  checkLockStatus: () => boolean;
  getRemainingLockTime: () => number;
}

export const useAuthStore = create<AuthState & AuthActions>((set, get) => ({
  // 상태
  isAuthenticated: false,
  isLoading: true,
  isFirstLaunch: true,
  biometricEnabled: false,
  biometricAvailable: false,
  biometricType: null,
  failedAttempts: 0,
  lockedUntil: null,

  // 암호화 키 getter (클로저 변수에서 읽기)
  getEncryptionKey: () => _encryptionKey,

  // 초기화
  initialize: async () => {
    try {
      // ── 재설치 감지 (initializeStorage 호출 전에 체크해야 함) ──────────
      // initializeStorage()가 data 디렉토리를 생성하므로 그 전에 존재 여부를 확인.
      // iOS Keychain은 앱 삭제 후에도 유지됨.
      // 데이터 디렉토리가 없는데 PASSWORD_HASH가 Keychain에 남아있으면 재설치 상태.
      // → 모든 SecureStore 키를 지우고 첫 실행으로 처리.
      const dataDir = FileSystem.documentDirectory + 'data/';
      const [dirInfo, existingHash] = await Promise.all([
        FileSystem.getInfoAsync(dataDir),
        getSecure(SECURE_KEYS.PASSWORD_HASH),
      ]);

      if (!dirInfo.exists && existingHash !== null) {
        if (__DEV__) { console.log('[DEBUG] 재설치 감지 → Keychain 초기화'); }
        await Promise.all([
          deleteSecure(SECURE_KEYS.PASSWORD_HASH),
          deleteSecure(SECURE_KEYS.ENCRYPTION_SALT),
          deleteSecure(SECURE_KEYS.ENCRYPTION_KEY),
          deleteSecure(SECURE_KEYS.BIOMETRIC_ENABLED),
          deleteSecure(SECURE_KEYS.USER_ID),
          deleteSecure(SECURE_KEYS.CRYPTO_VERSION),
        ]);
        await initializeStorage(); // 디렉토리 생성은 정상 진행
        set({
          isFirstLaunch: true,
          biometricAvailable: false,
          biometricType: null,
          biometricEnabled: false,
          isLoading: false,
        });
        return;
      }
      // ─────────────────────────────────────────────────────────────────

      await initializeStorage();

      // 생체인증 가능 여부
      const compatible = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      const biometricAvailable = compatible && enrolled;

      // 생체인증 타입 확인
      let biometricType: 'faceid' | 'fingerprint' | 'iris' | null = null;
      if (biometricAvailable) {
        const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
        if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
          biometricType = 'faceid';
        } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
          biometricType = 'fingerprint';
        } else if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) {
          biometricType = 'iris';
        }
      }

      // 설정 확인
      const [passwordHash, biometricStr] = await Promise.all([
        getSecure(SECURE_KEYS.PASSWORD_HASH),
        getSecure(SECURE_KEYS.BIOMETRIC_ENABLED),
      ]);

      const isFirstLaunch = passwordHash === null;
      const biometricEnabled = biometricStr === 'true';

      set({
        isFirstLaunch,
        biometricAvailable,
        biometricType,
        biometricEnabled,
        isLoading: false,
      });
    } catch (error) {
      console.error('Auth 초기화 실패:', error);
      set({ isLoading: false });
    }
  },

  // 백업 복원 후 인증 상태 설정
  setAuthenticatedFromRestore: (encryptionKey: string) => {
    _encryptionKey = encryptionKey;
    set({
      isAuthenticated: true,
      isFirstLaunch: false,
    });
  },

  // 비밀번호 설정
  setupPassword: async (password: string, onProgress?: (progress: number) => void) => {
    if (__DEV__) { console.log('[DEBUG] setupPassword 시작'); }
    const salt = await generateSalt();
    if (__DEV__) { console.log('[DEBUG] salt 생성됨:', salt ? '있음' : '없음'); }
    const hash = hashPassword(password, salt);
    const key = await deriveKey(password, salt, onProgress);
    if (__DEV__) { console.log('[DEBUG] key 생성됨:', key ? '있음 (길이: ' + key.length + ')' : '없음'); }

    // 암호화 키도 SecureStore에 저장 (다음 로그인 시 빠르게 불러오기 위해)
    await Promise.all([
      saveSecure(SECURE_KEYS.ENCRYPTION_SALT, salt),
      saveSecure(SECURE_KEYS.PASSWORD_HASH, hash),
      saveSecure(SECURE_KEYS.ENCRYPTION_KEY, key),
      saveSecure(SECURE_KEYS.CRYPTO_VERSION, CRYPTO_V3),
    ]);
    if (__DEV__) { console.log('[DEBUG] SecureStore 저장 완료 (v3 키 포함)'); }

    _encryptionKey = key;
    set({
      isAuthenticated: true,
      isFirstLaunch: false,
    });
    if (__DEV__) { console.log('[DEBUG] setupPassword 완료'); }
  },

  // 비밀번호 검증
  verifyPassword: async (password: string, onProgress?: (progress: number) => void) => {
    if (__DEV__) { console.log('[DEBUG] verifyPassword 시작'); }
    const { failedAttempts, lockedUntil } = get();

    // 잠금 상태 확인
    if (lockedUntil && Date.now() < lockedUntil) {
      return false;
    }

    const [salt, storedHash, storedKey, cryptoVersion] = await Promise.all([
      getSecure(SECURE_KEYS.ENCRYPTION_SALT),
      getSecure(SECURE_KEYS.PASSWORD_HASH),
      getSecure(SECURE_KEYS.ENCRYPTION_KEY),
      getSecure(SECURE_KEYS.CRYPTO_VERSION),
    ]);

    if (!salt || !storedHash) {
      return false;
    }

    const isV1 = !cryptoVersion || cryptoVersion === CRYPTO_V1;

    // 해시 검증: v3이면 100k PBKDF2, v2이면 10k PBKDF2, v1이면 레거시 해시
    let inputHash = isV1
      ? hashPasswordLegacy(password, salt)
      : cryptoVersion === CRYPTO_V3
        ? hashPassword(password, salt)
        : hashPasswordV2(password, salt);
    if (__DEV__) { console.log('[DEBUG] 비밀번호 해시 비교 중 (v' + (cryptoVersion ?? '1') + ')'); }

    // 해시 불일치 시 다른 버전으로 재시도 (부분 마이그레이션 크래시 복구)
    if (inputHash !== storedHash && !isV1) {
      inputHash = cryptoVersion === CRYPTO_V3
        ? hashPasswordV2(password, salt)
        : hashPassword(password, salt);
    }

    if (inputHash === storedHash) {
      if (__DEV__) { console.log('[DEBUG] 비밀번호 일치'); }

      if (isV1) {
        // ── v1→v2 마이그레이션 ──
        if (__DEV__) { console.log('[DEBUG] v1→v2 마이그레이션 시작'); }
        onProgress?.(0);

        // 1. 레거시 키로 데이터 접근 보장
        let oldKey = storedKey;
        if (!oldKey) {
          oldKey = await deriveKeySHA1(password, salt, (p) => onProgress?.(p * 0.3));
        } else {
          onProgress?.(0.3);
        }

        // 2. SHA-256으로 새 키 파생
        const newKey = await deriveKey(password, salt, (p) => onProgress?.(0.3 + p * 0.3));

        // 3. 새 키를 먼저 저장 (crash safety: reEncrypt 후 크래시해도 새 키로 접근 가능)
        await saveSecure(SECURE_KEYS.ENCRYPTION_KEY, newKey);

        // 4. 모든 데이터를 새 키로 재암호화
        try {
          await reEncryptAllData(oldKey, newKey);
        } catch (error) {
          // reEncrypt 실패 시 이전 키 복원
          await saveSecure(SECURE_KEYS.ENCRYPTION_KEY, oldKey);
          throw error;
        }
        onProgress?.(0.8);

        // 5. 재암호화 성공 후 해시 + v3 플래그 저장
        const newHash = hashPassword(password, salt);
        await Promise.all([
          saveSecure(SECURE_KEYS.PASSWORD_HASH, newHash),
          saveSecure(SECURE_KEYS.CRYPTO_VERSION, CRYPTO_V3),
        ]);
        onProgress?.(1);

        if (__DEV__) { console.log('[DEBUG] v1→v2 마이그레이션 완료'); }
        _encryptionKey = newKey;
      } else {
        // v2/v3: 저장된 키 사용
        let key = storedKey;
        if (!key) {
          if (__DEV__) { console.log('[DEBUG] 저장된 키 없음, 새로 생성'); }
          key = await deriveKey(password, salt, onProgress);
          await saveSecure(SECURE_KEYS.ENCRYPTION_KEY, key);
        } else {
          if (__DEV__) { console.log('[DEBUG] 저장된 키 사용 (빠른 로그인)'); }
          onProgress?.(1);
        }

        // v2→v3 마이그레이션: 해시만 재생성 (재암호화 불필요, 키는 동일)
        if (cryptoVersion !== CRYPTO_V3) {
          const newHash = hashPassword(password, salt);
          await saveSecure(SECURE_KEYS.PASSWORD_HASH, newHash);
          await saveSecure(SECURE_KEYS.CRYPTO_VERSION, CRYPTO_V3);
          if (__DEV__) { console.log('[DEBUG] v2→v3 해시 마이그레이션 완료 (10k→100k iterations)'); }
        }

        _encryptionKey = key;
      }

      set({
        isAuthenticated: true,
        failedAttempts: 0,
        lockedUntil: null,
      });
      return true;
    }

    if (__DEV__) { console.log('[DEBUG] 비밀번호 불일치'); }
    // 실패 처리
    const newAttempts = failedAttempts + 1;
    if (newAttempts >= CONFIG.MAX_LOGIN_ATTEMPTS) {
      set({
        failedAttempts: newAttempts,
        lockedUntil: Date.now() + CONFIG.LOCKOUT_DURATION_MS,
      });
    } else {
      set({ failedAttempts: newAttempts });
    }

    return false;
  },

  // 비밀번호 변경 (항상 v2로 저장)
  changePassword: async (currentPassword: string, newPassword: string, onProgress?: (progress: number) => void) => {
    // 현재 비밀번호 확인
    const [salt, storedHash, oldKey, cryptoVersion] = await Promise.all([
      getSecure(SECURE_KEYS.ENCRYPTION_SALT),
      getSecure(SECURE_KEYS.PASSWORD_HASH),
      getSecure(SECURE_KEYS.ENCRYPTION_KEY),
      getSecure(SECURE_KEYS.CRYPTO_VERSION),
    ]);

    if (!salt || !storedHash) {
      return false;
    }

    // 현재 비밀번호 검증 (v1/v2/v3 호환)
    const isV1 = !cryptoVersion || cryptoVersion === CRYPTO_V1;
    let inputHash = isV1
      ? hashPasswordLegacy(currentPassword, salt)
      : cryptoVersion === CRYPTO_V3
        ? hashPassword(currentPassword, salt)
        : hashPasswordV2(currentPassword, salt);

    // 부분 마이그레이션 크래시 복구
    if (inputHash !== storedHash && !isV1) {
      inputHash = cryptoVersion === CRYPTO_V3
        ? hashPasswordV2(currentPassword, salt)
        : hashPassword(currentPassword, salt);
    }

    if (inputHash !== storedHash) {
      return false;
    }

    // Derive oldKey if not stored (v1.1.1 users)
    let resolvedOldKey = oldKey;
    if (!resolvedOldKey) {
      if (isV1) {
        resolvedOldKey = await deriveKeySHA1(currentPassword, salt);
      } else {
        resolvedOldKey = await deriveKey(currentPassword, salt);
      }
    }

    // 새 비밀번호로 v2 키 생성 (progress 0~50%)
    const newSalt = await generateSalt();
    const newHash = hashPassword(newPassword, newSalt);
    const newKey = await deriveKey(newPassword, newSalt, (p) => onProgress?.(p * 0.5));

    // crash safety: 새 키를 먼저 저장 (reEncrypt 후 크래시해도 새 키로 접근 가능)
    await saveSecure(SECURE_KEYS.ENCRYPTION_KEY, newKey);

    // 모든 데이터를 새 키로 재암호화 (progress 50~100%)
    try {
      await reEncryptAllData(resolvedOldKey, newKey, (p) => onProgress?.(0.5 + p * 0.5));
    } catch (error) {
      // reEncrypt 실패 시 이전 키 복원
      await saveSecure(SECURE_KEYS.ENCRYPTION_KEY, resolvedOldKey);
      console.error('데이터 재암호화 실패:', error);
      return false;
    }

    // 새 인증 정보 저장 (항상 v3)
    await Promise.all([
      saveSecure(SECURE_KEYS.ENCRYPTION_SALT, newSalt),
      saveSecure(SECURE_KEYS.PASSWORD_HASH, newHash),
      saveSecure(SECURE_KEYS.ENCRYPTION_KEY, newKey),
      saveSecure(SECURE_KEYS.CRYPTO_VERSION, CRYPTO_V3),
    ]);

    _encryptionKey = newKey;
    return true;
  },

  // 생체인증
  authenticateWithBiometric: async () => {
    if (__DEV__) { console.log('[DEBUG] authenticateWithBiometric 시작'); }
    try {
      if (__DEV__) { console.log('[DEBUG] LocalAuthentication.authenticateAsync 호출'); }
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: i18n.t('auth.biometricPrompt'),
        fallbackLabel: i18n.t('auth.biometricFallback'),
        disableDeviceFallback: true,
      });
      if (__DEV__) { console.log('[DEBUG] 생체인증 결과:', JSON.stringify(result)); }

      if (result.success) {
        if (__DEV__) { console.log('[DEBUG] 생체인증 성공'); }
        // SecureStore에서 암호화 키 불러오기
        const storedKey = await getSecure(SECURE_KEYS.ENCRYPTION_KEY);
        if (storedKey) {
          if (__DEV__) { console.log('[DEBUG] 저장된 암호화 키 로드 성공'); }
          _encryptionKey = storedKey;
          set({
            isAuthenticated: true,
          });
          return true;
        } else {
          if (__DEV__) { console.log('[DEBUG] 저장된 암호화 키 없음 - 비밀번호 로그인 필요'); }
        }
      } else {
        if (__DEV__) { console.log('[DEBUG] 생체인증 실패 또는 취소:', result.error); }
      }
      return false;
    } catch (error) {
      if (__DEV__) { console.log('[DEBUG] 생체인증 에러:', error); }
      return false;
    }
  },

  // 생체인증 활성화
  enableBiometric: async () => {
    await saveSecure(SECURE_KEYS.BIOMETRIC_ENABLED, 'true');
    set({ biometricEnabled: true });
  },

  // 생체인증 비활성화
  disableBiometric: async () => {
    await saveSecure(SECURE_KEYS.BIOMETRIC_ENABLED, 'false');
    set({ biometricEnabled: false });
  },

  // 잠금
  lock: () => {
    _encryptionKey = null;
    set({
      isAuthenticated: false,
    });
  },

  // 잠금 상태 확인
  checkLockStatus: () => {
    const { lockedUntil } = get();
    if (lockedUntil && Date.now() >= lockedUntil) {
      set({ lockedUntil: null, failedAttempts: 0 });
      return false;
    }
    return lockedUntil !== null;
  },

  // 남은 잠금 시간 (초)
  getRemainingLockTime: () => {
    const { lockedUntil } = get();
    if (!lockedUntil) return 0;
    const remaining = Math.max(0, lockedUntil - Date.now());
    return Math.ceil(remaining / 1000);
  },
}));
