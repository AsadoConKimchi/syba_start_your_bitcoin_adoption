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
  deleteRecurringTransfer: (id: string, encryptionKey: string) => Promise<void>;
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

  deleteRecurringTransfer: async (id, encryptionKey) => {
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

    const activeItems = get().getActiveRecurringTransfers();

    for (const item of activeItems) {
      try {
        if (item.endDate && item.endDate < todayStr) {
          await get().updateRecurringTransfer(item.id, { isActive: false }, encryptionKey);
          continue;
        }

        const dueDates = getOverdueDates(item, today);

        for (const dueDate of dueDates) {
          await useLedgerStore.getState().addTransfer({
            date: dueDate,
            amount: item.amount,
            currency: item.currency,
            fromAssetId: item.fromAssetId,
            toAssetId: item.toAssetId || null,
            toCardId: item.toCardId || null,
            memo: item.memo
              ? `[${i18n.t('recurring.auto')}] ${item.memo}`
              : `[${i18n.t('recurring.auto')}] ${item.name}`,
          });

          executed.push({
            name: item.name,
            amount: item.amount,
            date: dueDate,
          });
        }

        if (dueDates.length > 0) {
          await get().updateRecurringTransfer(
            item.id,
            { lastExecutedDate: dueDates[dueDates.length - 1] },
            encryptionKey
          );
        }
      } catch (error) {
        errors.push(`${item.name}: ${error}`);
      }
    }

    return { executed, errors };
  },
}));

function getOverdueDates(item: RecurringTransfer, today: Date): string[] {
  const dates: string[] = [];
  const startDate = new Date(item.startDate);
  const lastExecuted = item.lastExecutedDate ? new Date(item.lastExecutedDate) : null;

  if (item.frequency === 'monthly') {
    let cursorYear = startDate.getFullYear();
    let cursorMonth = startDate.getMonth();

    if (lastExecuted) {
      cursorYear = lastExecuted.getFullYear();
      cursorMonth = lastExecuted.getMonth() + 1;
    }

    const MAX_ITERATIONS = 120;
    let iterations = 0;
    while (iterations++ < MAX_ITERATIONS) {
      const lastDay = new Date(cursorYear, cursorMonth + 1, 0).getDate();
      const day = Math.min(Math.max(item.dayOfMonth, 1), lastDay);
      const cursorDate = new Date(cursorYear, cursorMonth, day);

      if (cursorDate > today) break;

      const year = cursorDate.getFullYear();
      const month = cursorDate.getMonth();
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

      if (dateStr >= item.startDate) {
        if (!item.endDate || dateStr <= item.endDate) {
          dates.push(dateStr);
        }
      }

      cursorMonth++;
      if (cursorMonth > 11) {
        cursorMonth = 0;
        cursorYear++;
      }
    }
  } else if (item.frequency === 'yearly') {
    const monthOfYear = (item.monthOfYear ?? 1) - 1;
    let year = startDate.getFullYear();

    if (lastExecuted) {
      year = lastExecuted.getFullYear() + 1;
    }

    while (true) {
      const cursor = new Date(year, monthOfYear, item.dayOfMonth);
      if (cursor > today) break;

      const lastDay = new Date(year, monthOfYear + 1, 0).getDate();
      const day = Math.min(item.dayOfMonth, lastDay);
      const dateStr = `${year}-${String(monthOfYear + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

      if (dateStr >= item.startDate) {
        if (!item.endDate || dateStr <= item.endDate) {
          dates.push(dateStr);
        }
      }

      year++;
      if (year > today.getFullYear() + 10) break; // Safety
    }
  }

  return dates;
}
