import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { encrypt, decrypt, getSecure, deleteSecure, SECURE_KEYS } from './encryption';

console.log('[DEBUG] FileSystem.documentDirectory:', FileSystem.documentDirectory);
const DATA_DIR = FileSystem.documentDirectory + 'data/';
console.log('[DEBUG] DATA_DIR:', DATA_DIR);

// 파일 손상 에러 클래스
export class FileCorruptionError extends Error {
  public readonly filePath: string;
  public readonly originalError: unknown;

  constructor(filePath: string, originalError: unknown) {
    super(`파일이 손상되었거나 복호화할 수 없습니다: ${filePath}`);
    this.name = 'FileCorruptionError';
    this.filePath = filePath;
    this.originalError = originalError;
  }
}

// 로드 결과 타입
export interface LoadResult<T> {
  success: boolean;
  data: T;
  error?: FileCorruptionError;
}

// 파일 경로
export const FILE_PATHS = {
  LEDGER: DATA_DIR + 'ledger.enc',
  CARDS: DATA_DIR + 'cards.enc',
  INSTALLMENTS: DATA_DIR + 'installments.enc',
  LOANS: DATA_DIR + 'loans.enc',
  ASSETS: DATA_DIR + 'assets.enc',
  CATEGORIES: DATA_DIR + 'categories.enc',
  SUBSCRIPTION: DATA_DIR + 'subscription.enc',
  SNAPSHOTS: DATA_DIR + 'snapshots.enc',
  RECURRING: DATA_DIR + 'recurring.enc',
} as const;

// 디렉토리 초기화
export async function initializeStorage(): Promise<void> {
  console.log('[DEBUG] initializeStorage 시작, DATA_DIR:', DATA_DIR);
  try {
    const dirInfo = await FileSystem.getInfoAsync(DATA_DIR);
    console.log('[DEBUG] dirInfo:', dirInfo);
    if (!dirInfo.exists) {
      console.log('[DEBUG] 디렉토리 생성 시도');
      await FileSystem.makeDirectoryAsync(DATA_DIR, { intermediates: true });
      console.log('[DEBUG] 디렉토리 생성 완료');
    } else {
      console.log('[DEBUG] 디렉토리 이미 존재');
    }
  } catch (error) {
    console.log('[DEBUG] initializeStorage 에러:', error);
    throw error;
  }
}

// 암호화된 데이터 저장
export async function saveEncrypted<T>(
  path: string,
  data: T,
  encryptionKey: string
): Promise<void> {
  console.log('[DEBUG] saveEncrypted 시작, path:', path);
  try {
    await initializeStorage();
    console.log('[DEBUG] initializeStorage 완료');
    const encrypted = await encrypt(data, encryptionKey);
    console.log('[DEBUG] 암호화 완료, 길이:', encrypted.length);
    await FileSystem.writeAsStringAsync(path, encrypted);
    console.log('[DEBUG] 파일 쓰기 완료');
  } catch (error) {
    console.log('[DEBUG] saveEncrypted 에러:', error);
    throw error;
  }
}

// 암호화된 데이터 로드 (안전 버전 - 에러 정보 포함)
export async function loadEncryptedSafe<T>(
  path: string,
  encryptionKey: string,
  defaultValue: T
): Promise<LoadResult<T>> {
  try {
    const fileInfo = await FileSystem.getInfoAsync(path);
    if (!fileInfo.exists) {
      return { success: true, data: defaultValue };
    }

    const encrypted = await FileSystem.readAsStringAsync(path);
    const data = decrypt<T>(encrypted, encryptionKey);
    return { success: true, data };
  } catch (error) {
    console.error('파일 로드 실패:', path, error);
    return {
      success: false,
      data: defaultValue,
      error: new FileCorruptionError(path, error),
    };
  }
}

// 암호화된 데이터 로드 (기존 호환용)
export async function loadEncrypted<T>(
  path: string,
  encryptionKey: string,
  defaultValue: T
): Promise<T> {
  const result = await loadEncryptedSafe(path, encryptionKey, defaultValue);
  return result.data;
}

// 파일 존재 여부
export async function fileExists(path: string): Promise<boolean> {
  const info = await FileSystem.getInfoAsync(path);
  return info.exists;
}

// 데이터 무결성 검사 (앱 시작 시 호출)
export async function checkDataIntegrity(
  encryptionKey: string
): Promise<{ isHealthy: boolean; corruptedFiles: string[] }> {
  const corruptedFiles: string[] = [];

  const filesToCheck = [
    FILE_PATHS.LEDGER,
    FILE_PATHS.CARDS,
    FILE_PATHS.INSTALLMENTS,
    FILE_PATHS.LOANS,
    FILE_PATHS.ASSETS,
    FILE_PATHS.CATEGORIES,
    FILE_PATHS.SNAPSHOTS,
    FILE_PATHS.RECURRING,
  ];

  for (const path of filesToCheck) {
    const fileInfo = await FileSystem.getInfoAsync(path);
    if (!fileInfo.exists) {
      continue; // 파일이 없으면 스킵 (정상)
    }

    try {
      const encrypted = await FileSystem.readAsStringAsync(path);
      decrypt(encrypted, encryptionKey);
    } catch (error) {
      console.error('[무결성 검사] 손상된 파일:', path);
      corruptedFiles.push(path);
    }
  }

  return {
    isHealthy: corruptedFiles.length === 0,
    corruptedFiles,
  };
}

// 손상된 파일 삭제 (사용자 동의 후)
export async function deleteCorruptedFiles(filePaths: string[]): Promise<void> {
  for (const path of filePaths) {
    try {
      await FileSystem.deleteAsync(path, { idempotent: true });
      console.log('[삭제 완료]', path);
    } catch (error) {
      console.error('[삭제 실패]', path, error);
    }
  }
}

// 모든 데이터 삭제
export async function clearAllData(): Promise<void> {
  const dirInfo = await FileSystem.getInfoAsync(DATA_DIR);
  if (dirInfo.exists) {
    await FileSystem.deleteAsync(DATA_DIR, { idempotent: true });
  }
  // Clear subscription/lightning data
  await deleteSecure('SYBA_USER_ID').catch(() => {});
  await AsyncStorage.removeItem('SYBA_PENDING_INVOICE').catch(() => {});
}

// 백업 파일 생성
export async function createBackup(
  encryptionKey: string
): Promise<{ path: string; filename: string }> {
  const timestamp = new Date().toISOString().split('T')[0];
  const filename = `syba_backup_${timestamp}.enc`;
  const backupPath = FileSystem.cacheDirectory + filename;

  // 솔트 가져오기 (복원 시 키 파생에 필요)
  const salt = await getSecure(SECURE_KEYS.ENCRYPTION_SALT);
  if (!salt) {
    throw new Error('Encryption salt not found');
  }

  // 자동차감 기록 수집
  const [lastCardDeduction, lastLoanDeduction, lastInstallmentDeduction] = await Promise.all([
    AsyncStorage.getItem('lastCardDeduction'),
    AsyncStorage.getItem('lastLoanDeduction'),
    AsyncStorage.getItem('lastInstallmentDeduction'),
  ]);

  // 모든 데이터 수집
  const backupData = {
    ledger: await loadEncrypted(FILE_PATHS.LEDGER, encryptionKey, []),
    cards: await loadEncrypted(FILE_PATHS.CARDS, encryptionKey, []),
    installments: await loadEncrypted(FILE_PATHS.INSTALLMENTS, encryptionKey, []),
    loans: await loadEncrypted(FILE_PATHS.LOANS, encryptionKey, []),
    assets: await loadEncrypted(FILE_PATHS.ASSETS, encryptionKey, []),
    categories: await loadEncrypted(FILE_PATHS.CATEGORIES, encryptionKey, {
      expense: [],
      income: [],
    }),
    snapshots: await loadEncrypted(FILE_PATHS.SNAPSHOTS, encryptionKey, []),
    recurring: await loadEncrypted(FILE_PATHS.RECURRING, encryptionKey, []),
    deductionRecords: {
      lastCardDeduction: lastCardDeduction ? JSON.parse(lastCardDeduction) : null,
      lastLoanDeduction: lastLoanDeduction ? JSON.parse(lastLoanDeduction) : null,
      lastInstallmentDeduction: lastInstallmentDeduction ? JSON.parse(lastInstallmentDeduction) : null,
    },
    exportedAt: new Date().toISOString(),
    version: '1.0.0',
    salt,
  };

  // 암호화 후 저장 (솔트를 평문 헤더로 포함)
  const encrypted = await encrypt(backupData, encryptionKey);
  const fileContent = `SYBA_BACKUP:${salt}\n${encrypted}`;
  await FileSystem.writeAsStringAsync(backupPath, fileContent);

  return { path: backupPath, filename };
}

// 백업 데이터 타입
interface BackupData {
  ledger: unknown[];
  cards: unknown[];
  installments: unknown[];
  loans: unknown[];
  assets: unknown[];
  categories: { expense: unknown[]; income: unknown[] };
  snapshots?: unknown[]; // 선택적 (기존 백업 호환)
  recurring?: unknown[]; // 선택적 (기존 백업 호환)
  deductionRecords?: {
    lastCardDeduction: Record<string, string> | null;
    lastLoanDeduction: Record<string, string> | null;
    lastInstallmentDeduction: Record<string, string> | null;
  };
  exportedAt: string;
  version: string;
  salt?: string; // v1.0.0+ 백업에 포함된 솔트
}

// 백업 파일 복원
export async function restoreBackup(
  backupFilePath: string,
  encryptionKey: string
): Promise<{ salt?: string; hasDeductionRecords: boolean }> {
  console.log('[DEBUG] restoreBackup 시작, path:', backupFilePath);

  // 백업 파일 읽기
  const fileContent = await FileSystem.readAsStringAsync(backupFilePath);
  console.log('[DEBUG] 백업 파일 읽기 완료');

  // 헤더에서 솔트 추출 (새 포맷: SYBA_BACKUP:<salt>\n<encrypted>)
  let encrypted: string;
  let embeddedSalt: string | undefined;

  if (fileContent.startsWith('SYBA_BACKUP:')) {
    const newlineIdx = fileContent.indexOf('\n');
    embeddedSalt = fileContent.substring('SYBA_BACKUP:'.length, newlineIdx);
    encrypted = fileContent.substring(newlineIdx + 1);
    console.log('[DEBUG] 백업 헤더에서 솔트 추출됨');
  } else {
    // 기존 포맷 (헤더 없음)
    encrypted = fileContent;
  }

  // 복호화
  const backupData = decrypt<BackupData>(encrypted, encryptionKey);
  console.log('[DEBUG] 복호화 완료, version:', backupData.version);

  // 각 데이터를 개별 파일에 저장
  await initializeStorage();

  await Promise.all([
    saveEncrypted(FILE_PATHS.LEDGER, backupData.ledger, encryptionKey),
    saveEncrypted(FILE_PATHS.CARDS, backupData.cards, encryptionKey),
    saveEncrypted(FILE_PATHS.INSTALLMENTS, backupData.installments, encryptionKey),
    saveEncrypted(FILE_PATHS.LOANS, backupData.loans, encryptionKey),
    saveEncrypted(FILE_PATHS.ASSETS, backupData.assets, encryptionKey),
    saveEncrypted(FILE_PATHS.CATEGORIES, backupData.categories, encryptionKey),
    // 스냅샷이 있으면 복원 (기존 백업 호환)
    ...(backupData.snapshots ? [saveEncrypted(FILE_PATHS.SNAPSHOTS, backupData.snapshots, encryptionKey)] : []),
    // 고정비용이 있으면 복원 (기존 백업 호환)
    ...(backupData.recurring ? [saveEncrypted(FILE_PATHS.RECURRING, backupData.recurring, encryptionKey)] : []),
  ]);

  // 자동차감 기록 복원
  if (backupData.deductionRecords) {
    const { lastCardDeduction, lastLoanDeduction, lastInstallmentDeduction } = backupData.deductionRecords;
    const pairs: [string, string][] = [];
    if (lastCardDeduction) pairs.push(['lastCardDeduction', JSON.stringify(lastCardDeduction)]);
    if (lastLoanDeduction) pairs.push(['lastLoanDeduction', JSON.stringify(lastLoanDeduction)]);
    if (lastInstallmentDeduction) pairs.push(['lastInstallmentDeduction', JSON.stringify(lastInstallmentDeduction)]);
    if (pairs.length > 0) await AsyncStorage.multiSet(pairs);
  }

  console.log('[DEBUG] 모든 데이터 복원 완료');

  return { salt: embeddedSalt ?? backupData.salt, hasDeductionRecords: !!backupData.deductionRecords };
}

// 모든 데이터를 새 키로 재암호화 (비밀번호 변경 시 사용)
export async function reEncryptAllData(
  oldKey: string,
  newKey: string
): Promise<void> {
  console.log('[DEBUG] reEncryptAllData 시작');

  // 모든 파일 경로
  const filePaths = [
    { path: FILE_PATHS.LEDGER, default: [] },
    { path: FILE_PATHS.CARDS, default: [] },
    { path: FILE_PATHS.INSTALLMENTS, default: [] },
    { path: FILE_PATHS.LOANS, default: [] },
    { path: FILE_PATHS.ASSETS, default: [] },
    { path: FILE_PATHS.CATEGORIES, default: { expense: [], income: [] } },
    { path: FILE_PATHS.SUBSCRIPTION, default: null },
    { path: FILE_PATHS.SNAPSHOTS, default: [] },
    { path: FILE_PATHS.RECURRING, default: [] },
  ];

  for (const { path, default: defaultValue } of filePaths) {
    try {
      const fileInfo = await FileSystem.getInfoAsync(path);
      if (!fileInfo.exists) {
        console.log('[DEBUG] 파일 없음, 스킵:', path);
        continue;
      }

      // 구 키로 복호화
      const encrypted = await FileSystem.readAsStringAsync(path);
      const data = decrypt(encrypted, oldKey);
      console.log('[DEBUG] 복호화 완료:', path);

      // 새 키로 재암호화
      const reEncrypted = await encrypt(data, newKey);
      await FileSystem.writeAsStringAsync(path, reEncrypted);
      console.log('[DEBUG] 재암호화 완료:', path);
    } catch (error) {
      console.error('[DEBUG] 재암호화 실패:', path, error);
      // 파일이 존재하지만 복호화 실패 시 에러 던지기
      throw new Error(`파일 재암호화 실패: ${path}`);
    }
  }

  console.log('[DEBUG] 모든 데이터 재암호화 완료');
}
