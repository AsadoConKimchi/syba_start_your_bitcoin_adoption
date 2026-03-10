import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { RecurringTransfer } from '../types/recurringTransfer';
import { saveEncrypted, loadEncrypted, FILE_PATHS } from '../utils/storage';
import { useAuthStore } from './authStore';
import { useLedgerStore } from './ledgerStore';
import { getTodayString } from '../utils/formatters';
import i18n from '../i18n';

interface RecurringTransferState {
  recurringTransfers: RecurringTransfer[];
  isLoading: boolean;
  error: string | null;
}

interface RecurringTransferActions {
  loadRecurringTransfers: (encryptionKey: string) => Promise<void>;
  saveRecurringTransfers: (encryptionKey: string) => Promise<void>;
  addRecurringTransfer: (
    data: Omit<RecurringTransfer, 'id' | 'createdAt' | 'updatedAt'>,
    encryptionKey: string
  ) => Promise<void>;
  updateRecurringTransfer: (
    id: string,
    updates: Partial<RecurringTransfer>,
    encryptionKey: string
  ) => Promise<void>;
  deleteRecurringTransfer: (id: string, encryptionKey: string, options?: {
    deleteRecords?: boolean;
  }) => Promise<void>;
  getActiveRecurringTransfers: () => RecurringTransfer[];
  getMonthlyTotal: () => number;
  executeOverdueRecurringTransfers: () => Promise<{
    executed: Array<{ name: string; amount: number; date: string }>;
    errors: string[];
  }>;
}

export const useRecurringTransferStore = create<RecurringTransferState & RecurringTransferActions>((set, get) => ({
  recurringTransfers: [],
  isLoading: false,
  error: null,

  loadRecurringTransfers: async (encryptionKey) => {
    set({ isLoading: true });
    try {
      const recurringTransfers = await loadEncrypted<RecurringTransfer[]>(
        FILE_PATHS.RECURRING_TRANSFERS,
        encryptionKey,
        []
      );
      set({ recurringTransfers, isLoading: false, error: null });
    } catch {
      set({ error: i18n.t('errors.dataLoadFailed'), isLoading: false });
    }
  },

  saveRecurringTransfers: async (encryptionKey) => {
    try {
      await saveEncrypted(FILE_PATHS.RECURRING_TRANSFERS, get().recurringTransfers, encryptionKey);
    } catch {
      set({ error: i18n.t('errors.saveFailed') });
    }
  },

  addRecurringTransfer: async (data, encryptionKey) => {
    const now = new Date().toISOString();
    const item: RecurringTransfer = {
      ...data,
      id: uuidv4(),
      createdAt: now,
      updatedAt: now,
    };
    set(state => ({ recurringTransfers: [...state.recurringTransfers, item] }));
    await get().saveRecurringTransfers(encryptionKey);
  },

  updateRecurringTransfer: async (id, updates, encryptionKey) => {
    set(state => ({
      recurringTransfers: state.recurringTransfers.map(r =>
        r.id === id ? { ...r, ...updates, updatedAt: new Date().toISOString() } : r
      ),
    }));
    await get().saveRecurringTransfers(encryptionKey);
  },

  deleteRecurringTransfer: async (id, encryptionKey, options) => {
    const { deleteRecords = false } = options ?? {};

    // cascade: 연관 자동생성 이체 기록 삭제 + 자산 잔고 되돌리기
    if (deleteRecords) {
      const transfer = get().recurringTransfers.find(r => r.id === id);
      if (transfer) {
        const { records, deleteRecord } = useLedgerStore.getState();
        const autoPrefix = `[${i18n.t('recurring.auto')}]`;
        const matchingRecords = records.filter(
          (r) =>
            r.type === 'transfer' &&
            r.memo?.startsWith(autoPrefix) &&
            (r.memo?.includes(transfer.name) || (transfer.memo && r.memo?.includes(transfer.memo)))
        );

        const { useAssetStore } = require('./assetStore');

        for (const record of matchingRecords) {
          // 이체 되돌리기: fromAssetId에 금액 복원, toAssetId에서 금액 차감
          if ('fromAssetId' in record && record.fromAssetId) {
            await useAssetStore.getState().adjustAssetBalance(
              record.fromAssetId,
              record.amount, // 양수: 잔액 복원
              encryptionKey
            );
          }
          if ('toAssetId' in record && record.toAssetId) {
            await useAssetStore.getState().adjustAssetBalance(
              record.toAssetId,
              -record.amount, // 음수: 잔액 차감
              encryptionKey
            );
          }
          await deleteRecord(record.id);
        }
      }
    }

    set(state => ({
      recurringTransfers: state.recurringTransfers.filter(r => r.id !== id),
    }));
    await get().saveRecurringTransfers(encryptionKey);
  },

  getActiveRecurringTransfers: () => {
    return get().recurringTransfers.filter(r => r.isActive);
  },

  getMonthlyTotal: () => {
    return get().recurringTransfers
      .filter(r => r.isActive && r.frequency === 'monthly')
      .reduce((sum, r) => sum + r.amount, 0);
  },

  executeOverdueRecurringTransfers: async () => {
    const encryptionKey = useAuthStore.getState().getEncryptionKey();
    if (!encryptionKey) return { executed: [], errors: [] };

    const today = new Date();
    const todayStr = getTodayString();
    const executed: Array<{ name: string; amount: number; date: string }> = [];
    const errors: string[] = [];

    // 스냅샷 캡처: 루프 중 상태 변경으로 인한 인덱스 밀림 방지
    const activeItems = [...get().getActiveRecurringTransfers()];

    for (const item of activeItems) {
      try {
        if (item.endDate && item.endDate < todayStr) {
          await get().updateRecurringTransfer(item.id, { isActive: false }, encryptionKey);
          continue;
        }

        const dueDates = getOverdueDates(item, today);

        for (const dueDate of dueDates) {
          const expectedMemo = item.memo
            ? `[${i18n.t('recurring.auto')}] ${item.memo}`
            : `[${i18n.t('recurring.auto')}] ${item.name}`;

          // 중복 검사 (크래시 복구: addTransfer 후 lastExecutedDate 갱신 전 크래시 시 재실행 방지)
          const currentRecords = useLedgerStore.getState().records;
          const isDuplicate = currentRecords.some(
            (r) =>
              r.type === 'transfer' &&
              r.date === dueDate &&
              r.memo === expectedMemo &&
              r.amount === item.amount
          );

          if (!isDuplicate) {
            await useLedgerStore.getState().addTransfer({
              date: dueDate,
              amount: item.amount,
              currency: item.currency,
              fromAssetId: item.fromAssetId,
              toAssetId: item.toAssetId || null,
              toCardId: item.toCardId || null,
              memo: expectedMemo,
            });
          }

          // 각 dueDate 처리 후 즉시 lastExecutedDate 갱신 (중복이어도 전진)
          await get().updateRecurringTransfer(
            item.id,
            { lastExecutedDate: dueDate },
            encryptionKey
          );

          if (!isDuplicate) {
            executed.push({
              name: item.name,
              amount: item.amount,
              date: dueDate,
            });
          }
        }
      } catch (error) {
        errors.push(`${item.name}: ${error}`);
      }
    }

    return { executed, errors };
  },
}));

/**
 * YYYY-MM-DD 포맷 문자열 생성 (날짜 포맷 일관성 보장)
 */
function formatDateStr(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * lastExecutedDate 문자열에서 연/월 파싱 (timezone 이슈 방지를 위해 문자열 직접 파싱)
 */
function parseYearMonth(dateStr: string): { year: number; month: number } {
  const [y, m] = dateStr.split('-').map(Number);
  return { year: y, month: m };
}

function getOverdueDates(item: RecurringTransfer, today: Date): string[] {
  const dates: string[] = [];
  const startParsed = parseYearMonth(item.startDate);
  let cursorYear = startParsed.year;
  let cursorMonth = startParsed.month; // 1-based

  if (item.frequency === 'monthly') {
    if (item.lastExecutedDate) {
      const last = parseYearMonth(item.lastExecutedDate);
      cursorYear = last.year;
      cursorMonth = last.month + 1; // 다음 달부터
      if (cursorMonth > 12) {
        cursorMonth = 1;
        cursorYear++;
      }
    }

    const dayOfMonth = Math.max(item.dayOfMonth, 1);
    const MAX_ITERATIONS = 120;
    let iterations = 0;
    while (iterations++ < MAX_ITERATIONS) {
      const lastDay = new Date(cursorYear, cursorMonth, 0).getDate(); // cursorMonth is 1-based
      const day = Math.min(dayOfMonth, lastDay);
      const cursorDate = new Date(cursorYear, cursorMonth - 1, day);

      if (cursorDate > today) break;

      const dateStr = formatDateStr(cursorYear, cursorMonth, day);

      if (dateStr >= item.startDate) {
        if (!item.endDate || dateStr <= item.endDate) {
          dates.push(dateStr);
        }
      }

      cursorMonth++;
      if (cursorMonth > 12) {
        cursorMonth = 1;
        cursorYear++;
      }
    }
  } else if (item.frequency === 'yearly') {
    const monthOfYear = Math.max(1, Math.min(12, item.monthOfYear ?? 1));
    let year = startParsed.year;

    if (item.lastExecutedDate) {
      const last = parseYearMonth(item.lastExecutedDate);
      year = last.year + 1;
    }

    const MAX_YEARS = 120;
    let iterations = 0;
    while (iterations++ < MAX_YEARS) {
      const lastDay = new Date(year, monthOfYear, 0).getDate();
      const day = Math.min(item.dayOfMonth, lastDay);
      const cursor = new Date(year, monthOfYear - 1, day);
      if (cursor > today) break;

      const dateStr = formatDateStr(year, monthOfYear, day);

      if (dateStr >= item.startDate) {
        if (!item.endDate || dateStr <= item.endDate) {
          dates.push(dateStr);
        }
      }

      year++;
    }
  }

  return dates;
}
