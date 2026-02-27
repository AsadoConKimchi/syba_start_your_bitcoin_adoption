import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { RecurringExpense } from '../types/recurring';
import { saveEncrypted, loadEncrypted, FILE_PATHS } from '../utils/storage';
import { useAuthStore } from './authStore';
import { useLedgerStore } from './ledgerStore';
import { getTodayString } from '../utils/formatters';
import i18n from '../i18n';

interface RecurringState {
  recurrings: RecurringExpense[];
  isLoading: boolean;
  error: string | null;
}

interface RecurringActions {
  loadRecurrings: (encryptionKey: string) => Promise<void>;
  saveRecurrings: (encryptionKey: string) => Promise<void>;
  addRecurring: (
    data: Omit<RecurringExpense, 'id' | 'createdAt' | 'updatedAt'>,
    encryptionKey: string
  ) => Promise<void>;
  updateRecurring: (
    id: string,
    updates: Partial<RecurringExpense>,
    encryptionKey: string
  ) => Promise<void>;
  deleteRecurring: (id: string, encryptionKey: string) => Promise<void>;
  getActiveRecurrings: () => RecurringExpense[];
  getMonthlyTotal: () => number;
  executeOverdueRecurrings: () => Promise<{
    executed: Array<{ name: string; amount: number; date: string }>;
    errors: string[];
  }>;
}

export const useRecurringStore = create<RecurringState & RecurringActions>((set, get) => ({
  recurrings: [],
  isLoading: false,
  error: null,

  loadRecurrings: async (encryptionKey) => {
    set({ isLoading: true });
    try {
      const recurrings = await loadEncrypted<RecurringExpense[]>(
        FILE_PATHS.RECURRING,
        encryptionKey,
        []
      );
      set({ recurrings, isLoading: false, error: null });
    } catch (error) {
      set({ error: i18n.t('errors.dataLoadFailed'), isLoading: false });
    }
  },

  saveRecurrings: async (encryptionKey) => {
    try {
      await saveEncrypted(FILE_PATHS.RECURRING, get().recurrings, encryptionKey);
    } catch (error) {
      set({ error: i18n.t('errors.saveFailed') });
    }
  },

  addRecurring: async (data, encryptionKey) => {
    const now = new Date().toISOString();
    const recurring: RecurringExpense = {
      ...data,
      id: uuidv4(),
      createdAt: now,
      updatedAt: now,
    };
    set(state => ({ recurrings: [...state.recurrings, recurring] }));
    await get().saveRecurrings(encryptionKey);
  },

  updateRecurring: async (id, updates, encryptionKey) => {
    set(state => ({
      recurrings: state.recurrings.map(r =>
        r.id === id ? { ...r, ...updates, updatedAt: new Date().toISOString() } : r
      ),
    }));
    await get().saveRecurrings(encryptionKey);
  },

  deleteRecurring: async (id, encryptionKey) => {
    set(state => ({
      recurrings: state.recurrings.filter(r => r.id !== id),
    }));
    await get().saveRecurrings(encryptionKey);
  },

  getActiveRecurrings: () => {
    return get().recurrings.filter(r => r.isActive);
  },

  getMonthlyTotal: () => {
    return get().recurrings
      .filter(r => r.isActive && r.frequency === 'monthly')
      .reduce((sum, r) => sum + r.amount, 0);
  },

  /**
   * 밀린 고정비용 자동 실행
   * 앱 시작 시 호출 — lastExecutedDate 이후 빠진 월 건별로 지출 기록 생성
   */
  executeOverdueRecurrings: async () => {
    const encryptionKey = useAuthStore.getState().getEncryptionKey();
    if (!encryptionKey) return { executed: [], errors: [] };

    const today = new Date();
    const todayStr = getTodayString();
    const executed: Array<{ name: string; amount: number; date: string }> = [];
    const errors: string[] = [];

    const activeRecurrings = get().getActiveRecurrings();

    for (const recurring of activeRecurrings) {
      try {
        // endDate 체크
        if (recurring.endDate && recurring.endDate < todayStr) {
          continue;
        }

        const dueDates = getOverdueDates(recurring, today);

        for (const dueDate of dueDates) {
          // 지출 기록 생성
          await useLedgerStore.getState().addExpense({
            date: dueDate,
            amount: recurring.amount,
            currency: recurring.currency,
            category: recurring.category,
            paymentMethod: recurring.paymentMethod,
            cardId: recurring.cardId || null,
            installmentMonths: null,
            isInterestFree: null,
            installmentId: null,
            memo: recurring.memo ? `[${i18n.t('recurring.auto')}] ${recurring.memo}` : `[${i18n.t('recurring.auto')}] ${recurring.name}`,
            linkedAssetId: recurring.linkedAssetId || null,
          });

          executed.push({
            name: recurring.name,
            amount: recurring.amount,
            date: dueDate,
          });
        }

        // lastExecutedDate 업데이트
        if (dueDates.length > 0) {
          await get().updateRecurring(
            recurring.id,
            { lastExecutedDate: dueDates[dueDates.length - 1] },
            encryptionKey
          );
        }
      } catch (error) {
        errors.push(`${recurring.name}: ${error}`);
      }
    }

    return { executed, errors };
  },
}));

/**
 * 미실행 날짜들을 반환
 */
function getOverdueDates(recurring: RecurringExpense, today: Date): string[] {
  const dates: string[] = [];
  const startDate = new Date(recurring.startDate);
  const lastExecuted = recurring.lastExecutedDate ? new Date(recurring.lastExecutedDate) : null;

  if (recurring.frequency === 'monthly') {
    // startDate부터 오늘까지 매월 dayOfMonth에 해당하는 날짜
    let cursor = new Date(startDate.getFullYear(), startDate.getMonth(), recurring.dayOfMonth);

    // lastExecutedDate 이후부터 시작
    if (lastExecuted) {
      cursor = new Date(lastExecuted.getFullYear(), lastExecuted.getMonth() + 1, recurring.dayOfMonth);
    }

    while (cursor <= today) {
      const year = cursor.getFullYear();
      const month = cursor.getMonth();
      const lastDay = new Date(year, month + 1, 0).getDate();
      const day = Math.min(recurring.dayOfMonth, lastDay);
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

      // startDate 이전은 건너뜀
      if (dateStr >= recurring.startDate) {
        // endDate 체크
        if (!recurring.endDate || dateStr <= recurring.endDate) {
          dates.push(dateStr);
        }
      }

      cursor = new Date(year, month + 1, recurring.dayOfMonth);
    }
  } else if (recurring.frequency === 'yearly') {
    const monthOfYear = (recurring.monthOfYear ?? 1) - 1; // 0-based
    let year = startDate.getFullYear();

    if (lastExecuted) {
      year = lastExecuted.getFullYear() + 1;
    }

    while (true) {
      const cursor = new Date(year, monthOfYear, recurring.dayOfMonth);
      if (cursor > today) break;

      const lastDay = new Date(year, monthOfYear + 1, 0).getDate();
      const day = Math.min(recurring.dayOfMonth, lastDay);
      const dateStr = `${year}-${String(monthOfYear + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

      if (dateStr >= recurring.startDate) {
        if (!recurring.endDate || dateStr <= recurring.endDate) {
          dates.push(dateStr);
        }
      }

      year++;
    }
  }

  return dates;
}
