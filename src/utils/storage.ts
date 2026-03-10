import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { encrypt, decrypt, getSecure, deleteSecure, SECURE_KEYS } from './encryption';

const DATA_DIR = FileSystem.documentDirectory + 'data/';

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
  RECURRING_TRANSFERS: DATA_DIR + 'recurring_transfers.enc',
  REPAYMENT_RECORDS: DATA_DIR + 'repayment_records.enc',
} as const;

// 디렉토리 초기화
export async function initializeStorage(): Promise<void> {
  if (__DEV__) { console.log('[DEBUG] initializeStorage 시작, DATA_DIR:', DATA_DIR); }
  try {
    const dirInfo = await FileSystem.getInfoAsync(DATA_DIR);
    if (__DEV__) { console.log('[DEBUG] dirInfo:', dirInfo); }
    if (!dirInfo.exists) {
      if (__DEV__) { console.log('[DEBUG] 디렉토리 생성 시도'); }
      await FileSystem.makeDirectoryAsync(DATA_DIR, { intermediates: true });
      if (__DEV__) { console.log('[DEBUG] 디렉토리 생성 완료'); }
    } else {
      if (__DEV__) { console.log('[DEBUG] 디렉토리 이미 존재'); }
    }
  } catch (error) {
    if (__DEV__) { console.log('[DEBUG] initializeStorage 에러:', error); }
    throw error;
  }
}

// 암호화된 데이터 저장
export async function saveEncrypted<T>(
  path: string,
  data: T,
  encryptionKey: string
): Promise<void> {
  if (__DEV__) { console.log('[DEBUG] saveEncrypted 시작, path:', path); }
  try {
    await initializeStorage();
    if (__DEV__) { console.log('[DEBUG] initializeStorage 완료'); }
    const encrypted = await encrypt(data, encryptionKey);
    if (__DEV__) { console.log('[DEBUG] 암호화 완료, 길이:', encrypted.length); }
    // 원자적 쓰기: tmp에 먼저 쓴 후 rename (POSIX rename = 원자적)
    const tmpPath = path + '.tmp';
    await FileSystem.writeAsStringAsync(tmpPath, encrypted);
    await FileSystem.moveAsync({ from: tmpPath, to: path });
    if (__DEV__) { console.log('[DEBUG] 파일 쓰기 완료 (atomic)'); }
  } catch (error) {
    if (__DEV__) { console.log('[DEBUG] saveEncrypted 에러:', error); }
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
// 파일 없음 → defaultValue 반환 (정상)
// 복호화 실패 → throw (빈 데이터로 덮어쓰기 방지)
export async function loadEncrypted<T>(
  path: string,
  encryptionKey: string,
  defaultValue: T
): Promise<T> {
  const result = await loadEncryptedSafe(path, encryptionKey, defaultValue);
  if (!result.success && result.error) {
    throw result.error;
  }
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
    FILE_PATHS.RECURRING_TRANSFERS,
    FILE_PATHS.REPAYMENT_RECORDS,
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
    recurringTransfers: await loadEncrypted(FILE_PATHS.RECURRING_TRANSFERS, encryptionKey, []),
    repaymentRecords: await loadEncrypted(FILE_PATHS.REPAYMENT_RECORDS, encryptionKey, []),
    deductionRecords: {
      lastCardDeduction: lastCardDeduction ? JSON.parse(lastCardDeduction) : null,
      lastLoanDeduction: lastLoanDeduction ? JSON.parse(lastLoanDeduction) : null,
      lastInstallmentDeduction: lastInstallmentDeduction ? JSON.parse(lastInstallmentDeduction) : null,
    },
    exportedAt: new Date().toISOString(),
    version: '1.1.0',
    salt,
  };

  // 암호화 후 원자적 저장 (솔트를 평문 헤더로 포함)
  const encrypted = await encrypt(backupData, encryptionKey);
  const fileContent = `SYBA_BACKUP:${salt}\n${encrypted}`;
  const tmpPath = backupPath + '.tmp';
  await FileSystem.writeAsStringAsync(tmpPath, fileContent);
  await FileSystem.moveAsync({ from: tmpPath, to: backupPath });

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
  recurringTransfers?: unknown[]; // 선택적 (v1.1.0+ 백업)
  repaymentRecords?: unknown[]; // 선택적 (v1.2.0+ 백업)
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
  if (__DEV__) { console.log('[DEBUG] restoreBackup 시작, path:', backupFilePath); }

  // 백업 파일 읽기
  const fileContent = await FileSystem.readAsStringAsync(backupFilePath);
  if (__DEV__) { console.log('[DEBUG] 백업 파일 읽기 완료'); }

  // 헤더에서 솔트 추출 (새 포맷: SYBA_BACKUP:<salt>\n<encrypted>)
  let encrypted: string;
  let embeddedSalt: string | undefined;

  if (fileContent.startsWith('SYBA_BACKUP:')) {
    const newlineIdx = fileContent.indexOf('\n');
    if (newlineIdx === -1) {
      throw new Error('Invalid backup file: missing header separator');
    }
    embeddedSalt = fileContent.substring('SYBA_BACKUP:'.length, newlineIdx);
    if (!embeddedSalt || embeddedSalt.length === 0) {
      throw new Error('Invalid backup file: empty salt in header');
    }
    encrypted = fileContent.substring(newlineIdx + 1);
    if (__DEV__) { console.log('[DEBUG] 백업 헤더에서 솔트 추출됨'); }
  } else {
    // 기존 포맷 (헤더 없음)
    encrypted = fileContent;
  }

  // 복호화
  const backupData = decrypt<BackupData>(encrypted, encryptionKey);
  if (__DEV__) { console.log('[DEBUG] 복호화 완료, version:', backupData.version); }

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
    // 정기이체가 있으면 복원 (v1.1.0+ 백업)
    ...(backupData.recurringTransfers ? [saveEncrypted(FILE_PATHS.RECURRING_TRANSFERS, backupData.recurringTransfers, encryptionKey)] : []),
    // 상환 기록이 있으면 복원 (v1.2.0+ 백업)
    ...(backupData.repaymentRecords ? [saveEncrypted(FILE_PATHS.REPAYMENT_RECORDS, backupData.repaymentRecords, encryptionKey)] : []),
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

  if (__DEV__) { console.log('[DEBUG] 모든 데이터 복원 완료'); }

  return { salt: embeddedSalt ?? backupData.salt, hasDeductionRecords: !!backupData.deductionRecords };
}

// reEncrypt 크래시 복구용 매니페스트
const REENCRYPT_MANIFEST = DATA_DIR + 'reencrypt_manifest.json';

/**
 * reEncryptAllData 크래시 복구
 * Phase 2(rename) 도중 크래시 시 매니페스트를 읽어 남은 rename 완료
 */
export async function recoverReEncryptIfNeeded(): Promise<boolean> {
  try {
    const info = await FileSystem.getInfoAsync(REENCRYPT_MANIFEST);
    if (!info.exists) return false;

    let manifest: { pendingRenames: { tmp: string; final: string }[] };
    try {
      const raw = await FileSystem.readAsStringAsync(REENCRYPT_MANIFEST);
      manifest = JSON.parse(raw);
    } catch {
      // 매니페스트 자체 손상 — 삭제하여 무한 재시도 방지
      await FileSystem.deleteAsync(REENCRYPT_MANIFEST, { idempotent: true }).catch(() => {});
      console.warn('[Recovery] reEncrypt 매니페스트 손상, 삭제됨');
      return false;
    }

    // 남은 .tmp 파일들을 rename하여 Phase 2 완료
    for (const { tmp, final } of manifest.pendingRenames) {
      const tmpInfo = await FileSystem.getInfoAsync(tmp);
      if (tmpInfo.exists) {
        await FileSystem.moveAsync({ from: tmp, to: final });
      }
    }

    // 매니페스트 삭제 (복구 완료)
    await FileSystem.deleteAsync(REENCRYPT_MANIFEST, { idempotent: true }).catch(() => {});
    console.log('[Recovery] reEncrypt 크래시 복구 완료');
    return true;
  } catch (error) {
    console.error('[Recovery] reEncrypt 복구 실패:', error);
    // 매니페스트 삭제하여 무한 재시도 방지
    await FileSystem.deleteAsync(REENCRYPT_MANIFEST, { idempotent: true }).catch(() => {});
    return false;
  }
}

export async function reEncryptAllData(
  oldKey: string,
  newKey: string,
  onProgress?: (progress: number) => void
): Promise<void> {
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
    { path: FILE_PATHS.RECURRING_TRANSFERS, default: [] },
    { path: FILE_PATHS.REPAYMENT_RECORDS, default: [] },
  ];

  // 존재하는 파일만 필터링
  const existingFiles: string[] = [];
  for (const { path } of filePaths) {
    const fileInfo = await FileSystem.getInfoAsync(path);
    if (fileInfo.exists) existingFiles.push(path);
  }

  const totalFiles = existingFiles.length;
  let processedFiles = 0;

  // Phase 1: Decrypt all and write to temp files
  const tempFiles: string[] = [];
  try {
    for (const path of existingFiles) {
      const encrypted = await FileSystem.readAsStringAsync(path);
      const data = decrypt(encrypted, oldKey);
      const reEncrypted = await encrypt(data, newKey);
      const tempPath = path + '.tmp';
      await FileSystem.writeAsStringAsync(tempPath, reEncrypted);
      tempFiles.push(tempPath);

      processedFiles++;
      // Phase 1이 전체의 90%, Phase 2(rename)가 10%
      onProgress?.(processedFiles / totalFiles * 0.9);
    }

    // Phase 2 시작 전 매니페스트 저장 (크래시 복구용)
    const pendingRenames = tempFiles.map((tmp) => ({
      tmp,
      final: tmp.replace(/\.tmp$/, ''),
    }));
    await FileSystem.writeAsStringAsync(
      REENCRYPT_MANIFEST,
      JSON.stringify({ pendingRenames })
    );

    // Phase 2: Rename all temp files to final paths (fast, near-atomic)
    for (const { tmp, final } of pendingRenames) {
      await FileSystem.moveAsync({ from: tmp, to: final });
    }

    // Phase 2 완료 — 매니페스트 삭제
    await FileSystem.deleteAsync(REENCRYPT_MANIFEST, { idempotent: true }).catch(() => {});
    onProgress?.(1);
  } catch (error) {
    // Cleanup temp files on failure
    for (const tempPath of tempFiles) {
      await FileSystem.deleteAsync(tempPath, { idempotent: true }).catch(() => {});
    }
    await FileSystem.deleteAsync(REENCRYPT_MANIFEST, { idempotent: true }).catch(() => {});
    throw error;
  }
}
