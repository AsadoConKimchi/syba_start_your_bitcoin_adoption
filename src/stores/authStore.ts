import { create } from 'zustand';
import * as LocalAuthentication from 'expo-local-authentication';
import i18n from '../i18n';
import {
  generateSalt,
  deriveKey,
  hashPassword,
  getSecure,
  saveSecure,
  SECURE_KEYS,
} from '../utils/encryption';
import { initializeStorage, reEncryptAllData } from '../utils/storage';
import { CONFIG } from '../constants/config';

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  isFirstLaunch: boolean;
  encryptionKey: string | null;
  biometricEnabled: boolean;
  biometricAvailable: boolean;
  failedAttempts: number;
  lockedUntil: number | null;
}

interface AuthActions {
  initialize: () => Promise<void>;
  setupPassword: (password: string) => Promise<void>;
  verifyPassword: (password: string) => Promise<boolean>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<boolean>;
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
  encryptionKey: null,
  biometricEnabled: false,
  biometricAvailable: false,
  failedAttempts: 0,
  lockedUntil: null,

  // 초기화
  initialize: async () => {
    try {
      await initializeStorage();

      // 생체인증 가능 여부
      const compatible = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      const biometricAvailable = compatible && enrolled;

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
        biometricEnabled,
        isLoading: false,
      });
    } catch (error) {
      console.error('Auth 초기화 실패:', error);
      set({ isLoading: false });
    }
  },

  // 비밀번호 설정
  setupPassword: async (password: string) => {
    console.log('[DEBUG] setupPassword 시작');
    const salt = await generateSalt();
    console.log('[DEBUG] salt 생성됨:', salt ? '있음' : '없음');
    const hash = hashPassword(password, salt);
    const key = deriveKey(password, salt);
    console.log('[DEBUG] key 생성됨:', key ? '있음 (길이: ' + key.length + ')' : '없음');

    // 암호화 키도 SecureStore에 저장 (다음 로그인 시 빠르게 불러오기 위해)
    await Promise.all([
      saveSecure(SECURE_KEYS.ENCRYPTION_SALT, salt),
      saveSecure(SECURE_KEYS.PASSWORD_HASH, hash),
      saveSecure(SECURE_KEYS.ENCRYPTION_KEY, key),
    ]);
    console.log('[DEBUG] SecureStore 저장 완료 (키 포함)');

    set({
      isAuthenticated: true,
      isFirstLaunch: false,
      encryptionKey: key,
    });
    console.log('[DEBUG] setupPassword 완료, encryptionKey 설정됨');
  },

  // 비밀번호 검증
  verifyPassword: async (password: string) => {
    console.log('[DEBUG] verifyPassword 시작');
    const { failedAttempts, lockedUntil } = get();

    // 잠금 상태 확인
    if (lockedUntil && Date.now() < lockedUntil) {
      return false;
    }

    const [salt, storedHash, storedKey] = await Promise.all([
      getSecure(SECURE_KEYS.ENCRYPTION_SALT),
      getSecure(SECURE_KEYS.PASSWORD_HASH),
      getSecure(SECURE_KEYS.ENCRYPTION_KEY),
    ]);

    if (!salt || !storedHash) {
      return false;
    }

    const inputHash = hashPassword(password, salt);
    console.log('[DEBUG] 비밀번호 해시 비교 중');

    if (inputHash === storedHash) {
      console.log('[DEBUG] 비밀번호 일치');

      // 저장된 키가 있으면 바로 사용, 없으면 새로 생성 (기존 사용자 호환)
      let key = storedKey;
      if (!key) {
        console.log('[DEBUG] 저장된 키 없음, 새로 생성');
        key = deriveKey(password, salt);
        await saveSecure(SECURE_KEYS.ENCRYPTION_KEY, key);
      } else {
        console.log('[DEBUG] 저장된 키 사용 (빠른 로그인)');
      }

      set({
        isAuthenticated: true,
        encryptionKey: key,
        failedAttempts: 0,
        lockedUntil: null,
      });
      return true;
    }

    console.log('[DEBUG] 비밀번호 불일치');
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

  // 비밀번호 변경
  changePassword: async (currentPassword: string, newPassword: string) => {
    // 현재 비밀번호 확인
    const [salt, storedHash, oldKey] = await Promise.all([
      getSecure(SECURE_KEYS.ENCRYPTION_SALT),
      getSecure(SECURE_KEYS.PASSWORD_HASH),
      getSecure(SECURE_KEYS.ENCRYPTION_KEY),
    ]);

    if (!salt || !storedHash || !oldKey) {
      return false;
    }

    const inputHash = hashPassword(currentPassword, salt);
    if (inputHash !== storedHash) {
      return false; // 현재 비밀번호 불일치
    }

    // 새 비밀번호로 키 생성
    const newSalt = await generateSalt();
    const newHash = hashPassword(newPassword, newSalt);
    const newKey = deriveKey(newPassword, newSalt);

    // 모든 데이터를 새 키로 재암호화
    try {
      await reEncryptAllData(oldKey, newKey);
    } catch (error) {
      console.error('데이터 재암호화 실패:', error);
      return false;
    }

    // 새 인증 정보 저장
    await Promise.all([
      saveSecure(SECURE_KEYS.ENCRYPTION_SALT, newSalt),
      saveSecure(SECURE_KEYS.PASSWORD_HASH, newHash),
      saveSecure(SECURE_KEYS.ENCRYPTION_KEY, newKey),
    ]);

    set({ encryptionKey: newKey });
    return true;
  },

  // 생체인증
  authenticateWithBiometric: async () => {
    console.log('[DEBUG] authenticateWithBiometric 시작');
    try {
      console.log('[DEBUG] LocalAuthentication.authenticateAsync 호출');
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: i18n.t('auth.biometricPrompt'),
        fallbackLabel: i18n.t('auth.biometricFallback'),
        disableDeviceFallback: true,
      });
      console.log('[DEBUG] 생체인증 결과:', JSON.stringify(result));

      if (result.success) {
        console.log('[DEBUG] 생체인증 성공');
        // SecureStore에서 암호화 키 불러오기
        const storedKey = await getSecure(SECURE_KEYS.ENCRYPTION_KEY);
        if (storedKey) {
          console.log('[DEBUG] 저장된 암호화 키 로드 성공');
          set({
            isAuthenticated: true,
            encryptionKey: storedKey,
          });
          return true;
        } else {
          console.log('[DEBUG] 저장된 암호화 키 없음 - 비밀번호 로그인 필요');
        }
      } else {
        console.log('[DEBUG] 생체인증 실패 또는 취소:', result.error);
      }
      return false;
    } catch (error) {
      console.log('[DEBUG] 생체인증 에러:', error);
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
    set({
      isAuthenticated: false,
      encryptionKey: null,
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
