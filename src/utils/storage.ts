import * as FileSystem from 'expo-file-system/legacy';
import { encrypt, decrypt } from './encryption';

console.log('[DEBUG] FileSystem.documentDirectory:', FileSystem.documentDirectory);
const DATA_DIR = FileSystem.documentDirectory + 'data/';
console.log('[DEBUG] DATA_DIR:', DATA_DIR);

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

// 암호화된 데이터 로드
export async function loadEncrypted<T>(
  path: string,
  encryptionKey: string,
  defaultValue: T
): Promise<T> {
  try {
    const fileInfo = await FileSystem.getInfoAsync(path);
    if (!fileInfo.exists) {
      return defaultValue;
    }

    const encrypted = await FileSystem.readAsStringAsync(path);
    return decrypt<T>(encrypted, encryptionKey);
  } catch (error) {
    console.error('파일 로드 실패:', path, error);
    return defaultValue;
  }
}

// 파일 존재 여부
export async function fileExists(path: string): Promise<boolean> {
  const info = await FileSystem.getInfoAsync(path);
  return info.exists;
}

// 모든 데이터 삭제
export async function clearAllData(): Promise<void> {
  const dirInfo = await FileSystem.getInfoAsync(DATA_DIR);
  if (dirInfo.exists) {
    await FileSystem.deleteAsync(DATA_DIR, { idempotent: true });
  }
}

// 백업 파일 생성
export async function createBackup(
  encryptionKey: string
): Promise<{ path: string; filename: string }> {
  const timestamp = new Date().toISOString().split('T')[0];
  const filename = `syba_backup_${timestamp}.enc`;
  const backupPath = FileSystem.cacheDirectory + filename;

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
    exportedAt: new Date().toISOString(),
    version: '1.0.0',
  };

  // 암호화 후 저장
  const encrypted = await encrypt(backupData, encryptionKey);
  await FileSystem.writeAsStringAsync(backupPath, encrypted);

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
  exportedAt: string;
  version: string;
}

// 백업 파일 복원
export async function restoreBackup(
  backupFilePath: string,
  encryptionKey: string
): Promise<void> {
  console.log('[DEBUG] restoreBackup 시작, path:', backupFilePath);

  // 백업 파일 읽기
  const encrypted = await FileSystem.readAsStringAsync(backupFilePath);
  console.log('[DEBUG] 백업 파일 읽기 완료');

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
  ]);

  console.log('[DEBUG] 모든 데이터 복원 완료');
}
