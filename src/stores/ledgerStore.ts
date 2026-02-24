import { create } from 'zustand';
import i18n from '../i18n';
import { v4 as uuidv4 } from 'uuid';
import { LedgerRecord, Expense, Income, Transfer } from '../types/ledger';
import { saveEncrypted, loadEncrypted, FILE_PATHS } from '../utils/storage';
import { useAuthStore } from './authStore';
import { useAssetStore } from './assetStore';
import { useCardStore } from './cardStore';
import { fetchHistoricalBtcPrice } from '../services/api/upbit';
import { krwToSats, satsToKrw } from '../utils/calculations';
import { getTodayString } from '../utils/formatters';

interface LedgerState {
  records: LedgerRecord[];
  isLoading: boolean;
  error: string | null;
}

interface CategoryBreakdown {
  category: string;
  amount: number;
  percentage: number;
  color: string;
}

interface MonthlyTotals {
  month: string; // 'YYYY-MM' or '1월' 형식
  year: number;
  monthNum: number;
  income: number;
  expense: number;
  incomeSats: number;
  expenseSats: number;
}

interface LedgerActions {
  loadRecords: () => Promise<void>;
  saveRecords: () => Promise<void>;
  addExpense: (
    expense: Omit<Expense, 'id' | 'type' | 'createdAt' | 'updatedAt' | 'btcKrwAtTime' | 'satsEquivalent' | 'needsPriceSync'> & { installmentMonths?: number | null },
    overrideBtcKrw?: number | null
  ) => Promise<string>; // Returns expense ID
  addIncome: (
    income: Omit<Income, 'id' | 'type' | 'createdAt' | 'updatedAt' | 'btcKrwAtTime' | 'satsEquivalent' | 'needsPriceSync'>,
    overrideBtcKrw?: number | null
  ) => Promise<string>; // Returns income ID
  addTransfer: (
    transfer: Omit<Transfer, 'id' | 'type' | 'createdAt' | 'updatedAt'>
  ) => Promise<void>;
  updateRecord: (id: string, updates: Partial<LedgerRecord>) => Promise<void>;
  deleteRecord: (id: string) => Promise<void>;
  syncPendingPrices: () => Promise<void>;
  getRecordsByDate: (date: string) => LedgerRecord[];
  getRecordsByMonth: (year: number, month: number) => LedgerRecord[];
  getMonthlyTotal: (year: number, month: number) => { income: number; expense: number; incomeSats: number; expenseSats: number };
  getTodayTotal: () => { income: number; expense: number };
  getCategoryBreakdown: (year: number, month: number) => CategoryBreakdown[];
  getMultiMonthTotals: (monthsBack: number) => MonthlyTotals[];
}

export const useLedgerStore = create<LedgerState & LedgerActions>((set, get) => ({
  records: [],
  isLoading: false,
  error: null,

  // 파일에서 로드
  loadRecords: async () => {
    const encryptionKey = useAuthStore.getState().encryptionKey;
    if (!encryptionKey) {
      set({ error: i18n.t('errors.authRequired') });
      return;
    }

    set({ isLoading: true });

    try {
      const records = await loadEncrypted<LedgerRecord[]>(
        FILE_PATHS.LEDGER,
        encryptionKey,
        []
      );
      set({ records, isLoading: false, error: null });
    } catch (error) {
      set({ error: i18n.t('errors.dataLoadFailed'), isLoading: false });
    }
  },

  // 파일에 저장
  saveRecords: async () => {
    if (__DEV__) { console.log('[DEBUG] saveRecords 시작'); }
    const encryptionKey = useAuthStore.getState().encryptionKey;
    if (__DEV__) { console.log('[DEBUG] encryptionKey:', encryptionKey ? '있음' : '없음 (null)'); }

    if (!encryptionKey) {
      if (__DEV__) { console.log('[DEBUG] encryptionKey가 없어서 저장 중단'); }
      set({ error: i18n.t('errors.noEncryptionKey') });
      return;
    }

    try {
      if (__DEV__) { console.log('[DEBUG] saveEncrypted 호출 시도'); }
      await saveEncrypted(FILE_PATHS.LEDGER, get().records, encryptionKey);
      if (__DEV__) { console.log('[DEBUG] saveEncrypted 성공'); }
    } catch (error) {
      if (__DEV__) { console.log('[DEBUG] saveEncrypted 실패:', error); }
      set({ error: i18n.t('errors.saveFailed') });
    }
  },

  // 지출 추가
  addExpense: async (expenseData, overrideBtcKrw) => {
    if (__DEV__) { console.log('[DEBUG] addExpense 시작', expenseData); }
    try {
      const now = new Date().toISOString();
      let btcKrwAtTime: number | null = overrideBtcKrw ?? null;
      let satsEquivalent: number | null = null;
      let needsPriceSync = false;

      // 원화 기록 시 BTC 시세 조회하여 sats 환산
      if (expenseData.currency === 'KRW') {
        if (!btcKrwAtTime) {
          try {
            if (__DEV__) { console.log('[DEBUG] BTC 시세 조회 시도'); }
            btcKrwAtTime = await fetchHistoricalBtcPrice(expenseData.date);
            if (__DEV__) { console.log('[DEBUG] BTC 시세 조회 성공:', btcKrwAtTime); }
          } catch (e) {
            if (__DEV__) { console.log('[DEBUG] BTC 시세 조회 실패, 나중에 동기화:', e); }
            needsPriceSync = true;
          }
        }
        if (btcKrwAtTime) {
          satsEquivalent = krwToSats(expenseData.amount, btcKrwAtTime);
        }
      }
      // SATS 기록 시: amount가 sats 값, satsEquivalent에 그대로 저장
      else if (expenseData.currency === 'SATS') {
        satsEquivalent = expenseData.amount; // sats 값 그대로
        if (!btcKrwAtTime) {
          try {
            btcKrwAtTime = await fetchHistoricalBtcPrice(expenseData.date);
            if (__DEV__) { console.log('[DEBUG] SATS 기록 - BTC 시세 조회 성공:', btcKrwAtTime); }
          } catch (e) {
            if (__DEV__) { console.log('[DEBUG] SATS 기록 - BTC 시세 조회 실패:', e); }
            needsPriceSync = true;
          }
        }
      }

      if (__DEV__) { console.log('[DEBUG] UUID 생성 시도'); }
      const id = uuidv4();
      if (__DEV__) { console.log('[DEBUG] UUID 생성 성공:', id); }

      const expense: Expense = {
        ...expenseData,
        id,
        type: 'expense',
        btcKrwAtTime,
        satsEquivalent,
        installmentMonths: expenseData.installmentMonths ?? null,
        isInterestFree: expenseData.isInterestFree ?? null,
        needsPriceSync,
        createdAt: now,
        updatedAt: now,
      };
      if (__DEV__) { console.log('[DEBUG] expense 객체 생성 완료'); }

      set(state => ({ records: [...state.records, expense] }));
      if (__DEV__) { console.log('[DEBUG] state 업데이트 완료'); }

      await get().saveRecords();
      if (__DEV__) { console.log('[DEBUG] addExpense 완료'); }

      // 자산 연동: 즉시 차감 (계좌이체/Lightning/Onchain)
      const encryptionKey = useAuthStore.getState().encryptionKey;
      if (
        expenseData.linkedAssetId &&
        encryptionKey &&
        (expenseData.paymentMethod === 'bank' ||
          expenseData.paymentMethod === 'lightning' ||
          expenseData.paymentMethod === 'onchain')
      ) {
        if (__DEV__) { console.log('[DEBUG] 자산 잔액 차감 시작:', expenseData.linkedAssetId); }
        // SATS 기록 또는 비트코인 결제: sats로 차감
        // KRW 기록 + 계좌이체: KRW로 차감
        let deductAmount: number;
        if (expenseData.currency === 'SATS') {
          deductAmount = expenseData.amount; // sats 값 그대로
        } else if (expenseData.paymentMethod === 'lightning' || expenseData.paymentMethod === 'onchain') {
          deductAmount = satsEquivalent ?? expenseData.amount;
        } else {
          deductAmount = expenseData.amount; // KRW
        }

        await useAssetStore.getState().adjustAssetBalance(
          expenseData.linkedAssetId,
          -deductAmount, // 지출이므로 마이너스
          encryptionKey
        );
        if (__DEV__) { console.log('[DEBUG] 자산 잔액 차감 완료'); }
      }

      return id; // Return expense ID for linking
    } catch (error) {
      if (__DEV__) { console.log('[DEBUG] addExpense 에러:', error); }
      throw error;  // 에러를 다시 던져서 UI에서 처리
    }
  },

  // 수입 추가
  addIncome: async (incomeData, overrideBtcKrw) => {
    const now = new Date().toISOString();
    let btcKrwAtTime: number | null = overrideBtcKrw ?? null;
    let satsEquivalent: number | null = null;
    let needsPriceSync = false;

    // 원화 기록 시 BTC 시세 조회하여 sats 환산
    if (incomeData.currency === 'KRW') {
      if (!btcKrwAtTime) {
        try {
          btcKrwAtTime = await fetchHistoricalBtcPrice(incomeData.date);
        } catch (error) {
          if (__DEV__) { console.log('[오프라인] BTC 시세 조회 실패, 나중에 동기화:', error); }
          needsPriceSync = true;
        }
      }
      if (btcKrwAtTime) {
        satsEquivalent = krwToSats(incomeData.amount, btcKrwAtTime);
      }
    }
    // SATS 기록 시: amount가 sats 값, satsEquivalent에 그대로 저장
    else if (incomeData.currency === 'SATS') {
      satsEquivalent = incomeData.amount; // sats 값 그대로
      if (!btcKrwAtTime) {
        try {
          btcKrwAtTime = await fetchHistoricalBtcPrice(incomeData.date);
          if (__DEV__) { console.log('[DEBUG] SATS 수입 - BTC 시세 조회 성공:', btcKrwAtTime); }
        } catch (error) {
          if (__DEV__) { console.log('[DEBUG] SATS 수입 - BTC 시세 조회 실패:', error); }
          needsPriceSync = true;
        }
      }
    }

    const id = uuidv4();
    const income: Income = {
      ...incomeData,
      id,
      type: 'income',
      btcKrwAtTime,
      satsEquivalent,
      needsPriceSync,
      createdAt: now,
      updatedAt: now,
    };

    set(state => ({ records: [...state.records, income] }));
    await get().saveRecords();

    // 자산 연동: 수입 시 자산 증가
    const encryptionKey = useAuthStore.getState().encryptionKey;
    if (incomeData.linkedAssetId && encryptionKey) {
      if (__DEV__) { console.log('[DEBUG] 수입 - 자산 잔액 증가 시작:', incomeData.linkedAssetId); }

      // SATS 기록: sats 값 그대로 증가
      // KRW 기록 + 비트코인 자산: sats 환산값으로 증가
      // KRW 기록 + 법정화폐 자산: KRW 그대로 증가
      const asset = useAssetStore.getState().getAssetById(incomeData.linkedAssetId);
      let addAmount: number;
      if (incomeData.currency === 'SATS') {
        addAmount = incomeData.amount; // sats 값 그대로
      } else if (asset?.type === 'bitcoin') {
        addAmount = satsEquivalent ?? incomeData.amount;
      } else {
        addAmount = incomeData.amount; // KRW
      }

      await useAssetStore.getState().adjustAssetBalance(
        incomeData.linkedAssetId,
        addAmount, // 수입이므로 플러스
        encryptionKey
      );
      if (__DEV__) { console.log('[DEBUG] 수입 - 자산 잔액 증가 완료'); }
    }

    return id; // Return income ID
  },

  // 이체 추가 (계좌→계좌 또는 계좌→선불카드)
  addTransfer: async (transferData) => {
    const encryptionKey = useAuthStore.getState().encryptionKey;
    if (!encryptionKey) throw new Error('No encryption key');

    const id = uuidv4();
    const now = new Date().toISOString();
    const newRecord: Transfer = {
      id,
      type: 'transfer',
      ...transferData,
      createdAt: now,
      updatedAt: now,
    };

    if (__DEV__) { console.log('[DEBUG] addTransfer 시작:', newRecord); }

    // 1. 기록 저장
    set(state => ({ records: [...state.records, newRecord] }));
    await get().saveRecords();

    try {
      // 2. 출금 자산 잔액 차감
      await useAssetStore.getState().adjustAssetBalance(
        transferData.fromAssetId,
        -transferData.amount,
        encryptionKey
      );
      if (__DEV__) { console.log('[DEBUG] addTransfer - 출금 완료'); }

      try {
        // 3a. 계좌→계좌
        if (transferData.toAssetId) {
          await useAssetStore.getState().adjustAssetBalance(
            transferData.toAssetId,
            transferData.amount,
            encryptionKey
          );
          if (__DEV__) { console.log('[DEBUG] addTransfer - 입금(계좌) 완료'); }
        }
        // 3b. 계좌→선불카드
        else if (transferData.toCardId) {
          await useCardStore.getState().updateCardBalance(
            transferData.toCardId,
            transferData.amount
          );
          if (__DEV__) { console.log('[DEBUG] addTransfer - 충전(카드) 완료'); }
        }
      } catch (error) {
        // 3 실패 시 2번 롤백 (출금 복원)
        if (__DEV__) { console.log('[DEBUG] addTransfer - 입금 실패, 출금 롤백:', error); }
        await useAssetStore.getState().adjustAssetBalance(
          transferData.fromAssetId,
          transferData.amount,
          encryptionKey
        );
        // 기록도 삭제
        set(state => ({ records: state.records.filter(r => r.id !== id) }));
        await get().saveRecords();
        throw error;
      }
    } catch (error) {
      // 2 실패 시 기록 삭제
      if (get().records.find(r => r.id === id)) {
        set(state => ({ records: state.records.filter(r => r.id !== id) }));
        await get().saveRecords();
      }
      throw error;
    }
  },

  // 수정 (자산 차액 반영 포함)
  // 테스트 케이스:
  // 1. 지출 10만원(bank, linkedAsset) → 5만원으로 수정 → 자산 +5만원 복원
  // 2. 수입 10만원(linkedAsset) → 15만원으로 수정 → 자산 +5만원 추가
  // 3. linkedAssetId A → B로 변경 → A 복원 + B 차감
  // 4. SATS 지출 수정 → sats 단위로 차액 조정
  // 5. paymentMethod card→bank 변경 → 자산 연동 시작 (새로 차감)
  // 6. paymentMethod bank→card 변경 → 자산 연동 해제 (복원)
  updateRecord: async (id, updates) => {
    const oldRecord = get().records.find(r => r.id === id);

    set(state => ({
      records: state.records.map(record => {
        if (record.id !== id) return record;
        return {
          ...record,
          ...updates,
          updatedAt: new Date().toISOString(),
        } as LedgerRecord;
      }),
    }));
    await get().saveRecords();

    // 자산 차액 반영
    const encryptionKey = useAuthStore.getState().encryptionKey;
    if (!oldRecord || !encryptionKey) return;

    const newRecord = get().records.find(r => r.id === id);
    if (!newRecord) return;

    // 자산 연동 대상인지 판별하는 헬퍼
    const isAssetLinked = (record: LedgerRecord): boolean => {
      if (record.type === 'transfer') return false;
      if (!record.linkedAssetId) return false;
      if (record.type === 'income') return true;
      // expense는 bank/lightning/onchain만 자산 연동
      return (
        record.type === 'expense' &&
        (record.paymentMethod === 'bank' ||
          record.paymentMethod === 'lightning' ||
          record.paymentMethod === 'onchain')
      );
    };

    // 자산에 적용된 금액을 계산하는 헬퍼 (부호 포함)
    // Transfer는 isAssetLinked에서 이미 제외됨
    const getAssetDelta = (record: Expense | Income): number => {
      let amount: number;
      if (record.type === 'expense') {
        if (record.currency === 'SATS') {
          amount = record.amount;
        } else if (record.paymentMethod === 'lightning' || record.paymentMethod === 'onchain') {
          amount = record.satsEquivalent ?? record.amount;
        } else {
          amount = record.amount; // KRW
        }
        return -amount; // 지출은 마이너스
      } else {
        // income
        const asset = useAssetStore.getState().getAssetById(record.linkedAssetId!);
        if (record.currency === 'SATS') {
          amount = record.amount;
        } else if (asset?.type === 'bitcoin') {
          amount = record.satsEquivalent ?? record.amount;
        } else {
          amount = record.amount; // KRW
        }
        return amount; // 수입은 플러스
      }
    };

    const oldLinked = isAssetLinked(oldRecord);
    const newLinked = isAssetLinked(newRecord);

    // Case 1: 이전에 자산 연동 → 이전 자산 역복원
    if (oldLinked && oldRecord.type !== 'transfer') {
      const oldDelta = getAssetDelta(oldRecord);
      await useAssetStore.getState().adjustAssetBalance(
        oldRecord.linkedAssetId!,
        -oldDelta, // 역복원
        encryptionKey
      );
      if (__DEV__) { console.log('[DEBUG] updateRecord - 이전 자산 역복원:', oldRecord.linkedAssetId, -oldDelta); }
    }

    // Case 2: 새로운 자산 연동 → 새 자산 반영
    if (newLinked && newRecord.type !== 'transfer') {
      const newDelta = getAssetDelta(newRecord);
      await useAssetStore.getState().adjustAssetBalance(
        newRecord.linkedAssetId!,
        newDelta,
        encryptionKey
      );
      if (__DEV__) { console.log('[DEBUG] updateRecord - 새 자산 반영:', newRecord.linkedAssetId, newDelta); }
    }
  },

  // 삭제 (자산 역복원 포함)
  // 테스트 케이스:
  // 1. 지출 10만원(bank, linkedAsset) 삭제 → 자산 +10만원 복원
  // 2. 수입 10만원(linkedAsset) 삭제 → 자산 -10만원 차감
  // 3. SATS 지출(lightning) 삭제 → sats 단위로 복원
  // 4. 카드 지출(linkedAsset 있지만 card) 삭제 → 자산 변동 없음
  // 5. linkedAssetId 없는 기록 삭제 → 자산 변동 없음
  deleteRecord: async (id) => {
    const record = get().records.find(r => r.id === id);

    // 자산 역복원 (삭제 전에 처리)
    const encryptionKey = useAuthStore.getState().encryptionKey;
    if (record && encryptionKey && record.type !== 'transfer' && record.linkedAssetId) {
      let shouldRestore = false;
      let restoreAmount = 0;

      if (record.type === 'expense') {
        // expense는 bank/lightning/onchain만 자산 연동되었음
        if (
          record.paymentMethod === 'bank' ||
          record.paymentMethod === 'lightning' ||
          record.paymentMethod === 'onchain'
        ) {
          shouldRestore = true;
          // 원래 차감된 금액 복원 (addExpense 로직 역순)
          if (record.currency === 'SATS') {
            restoreAmount = record.amount; // sats 그대로
          } else if (record.paymentMethod === 'lightning' || record.paymentMethod === 'onchain') {
            restoreAmount = record.satsEquivalent ?? record.amount;
          } else {
            restoreAmount = record.amount; // KRW
          }
        }
      } else if (record.type === 'income') {
        // income은 linkedAssetId가 있으면 항상 자산 연동되었음
        shouldRestore = true;
        const asset = useAssetStore.getState().getAssetById(record.linkedAssetId);
        if (record.currency === 'SATS') {
          restoreAmount = -record.amount; // 수입 삭제 → 차감
        } else if (asset?.type === 'bitcoin') {
          restoreAmount = -(record.satsEquivalent ?? record.amount);
        } else {
          restoreAmount = -record.amount; // KRW 차감
        }
      }

      if (shouldRestore) {
        await useAssetStore.getState().adjustAssetBalance(
          record.linkedAssetId,
          record.type === 'expense' ? restoreAmount : restoreAmount, // expense: +복원, income: -차감
          encryptionKey
        );
        if (__DEV__) { console.log('[DEBUG] deleteRecord - 자산 역복원:', record.linkedAssetId, restoreAmount); }
      }
    }

    set(state => ({
      records: state.records.filter(record => record.id !== id),
    }));
    await get().saveRecords();
  },

  // 오프라인 기록 시세 동기화
  syncPendingPrices: async () => {
    const { records, updateRecord } = get();
    const pendingRecords = records.filter(r => r.type !== 'transfer' && r.needsPriceSync);

    for (const record of pendingRecords) {
      try {
        const btcKrwAtTime = await fetchHistoricalBtcPrice(record.date);
        const satsEquivalent = krwToSats(record.amount, btcKrwAtTime);

        await updateRecord(record.id, {
          btcKrwAtTime,
          satsEquivalent,
          needsPriceSync: false,
        });
      } catch (error) {
        if (__DEV__) { console.log('[오프라인] 시세 동기화 실패, 다음에 재시도:', error); }
      }
    }
  },

  // 특정 날짜 기록 조회
  getRecordsByDate: (date) => {
    return get().records.filter(r => r.date === date);
  },

  // 특정 월 기록 조회
  getRecordsByMonth: (year, month) => {
    const prefix = `${year}-${String(month).padStart(2, '0')}`;
    return get().records.filter(r => r.date.startsWith(prefix));
  },

  // 월간 합계
  getMonthlyTotal: (year, month) => {
    const monthRecords = get().getRecordsByMonth(year, month);

    let income = 0;
    let expense = 0;
    let incomeSats = 0;
    let expenseSats = 0;

    for (const record of monthRecords) {
      // Transfer 기록은 수입/지출 합계에서 제외
      if (record.type === 'transfer') continue;

      // KRW 기록: amount가 원화, satsEquivalent가 sats
      // SATS 기록: amount가 sats, btcKrwAtTime으로 원화 환산
      let krwAmount: number;
      let sats: number;

      if (record.currency === 'KRW') {
        krwAmount = record.amount;
        sats = record.satsEquivalent ?? 0;
      } else {
        // SATS 기록
        sats = record.amount;
        // 원화 환산 (기록 당시 시세)
        krwAmount = record.btcKrwAtTime
          ? satsToKrw(record.amount, record.btcKrwAtTime)
          : 0;
      }

      if (record.type === 'income') {
        income += krwAmount;
        incomeSats += sats;
      } else {
        expense += krwAmount;
        expenseSats += sats;
      }
    }

    return { income, expense, incomeSats, expenseSats };
  },

  // 오늘 합계
  getTodayTotal: () => {
    const today = getTodayString();
    const todayRecords = get().getRecordsByDate(today);

    let income = 0;
    let expense = 0;

    for (const record of todayRecords) {
      // Transfer 기록은 수입/지출 합계에서 제외
      if (record.type === 'transfer') continue;

      // KRW 기록: amount가 원화
      // SATS 기록: btcKrwAtTime으로 원화 환산
      let krwAmount: number;
      if (record.currency === 'KRW') {
        krwAmount = record.amount;
      } else {
        krwAmount = record.btcKrwAtTime
          ? satsToKrw(record.amount, record.btcKrwAtTime)
          : 0;
      }

      if (record.type === 'income') {
        income += krwAmount;
      } else {
        expense += krwAmount;
      }
    }

    return { income, expense };
  },

  // 카테고리별 지출 분류 (상위 5개 + 기타)
  getCategoryBreakdown: (year, month) => {
    const monthRecords = get().getRecordsByMonth(year, month);
    const expenses = monthRecords.filter(r => r.type === 'expense');

    // 카테고리별 합계 (SATS → KRW 환산 포함)
    const categoryTotals: Record<string, number> = {};
    let totalExpense = 0;

    for (const expense of expenses) {
      const category = expense.category || i18n.t('categories.uncategorized');
      let krwAmount: number;
      if (expense.currency === 'SATS' && 'btcKrwAtTime' in expense && expense.btcKrwAtTime) {
        krwAmount = satsToKrw(expense.amount, expense.btcKrwAtTime);
      } else {
        krwAmount = expense.amount;
      }
      categoryTotals[category] = (categoryTotals[category] || 0) + krwAmount;
      totalExpense += krwAmount;
    }

    if (totalExpense === 0) return [];

    // 정렬하여 상위 5개 추출
    const sorted = Object.entries(categoryTotals)
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount);

    const CHART_COLORS = [
      '#3B82F6', // 파랑
      '#22C55E', // 초록
      '#F7931A', // 오렌지
      '#EF4444', // 빨강
      '#8B5CF6', // 보라
      '#9CA3AF', // 회색 (기타)
    ];

    const top5 = sorted.slice(0, 5);
    const others = sorted.slice(5);
    const othersTotal = others.reduce((sum, item) => sum + item.amount, 0);

    const result: CategoryBreakdown[] = top5.map((item, index) => ({
      category: item.category,
      amount: item.amount,
      percentage: Math.round((item.amount / totalExpense) * 100),
      color: CHART_COLORS[index],
    }));

    if (othersTotal > 0) {
      result.push({
        category: i18n.t('categories.etc'),
        amount: othersTotal,
        percentage: Math.round((othersTotal / totalExpense) * 100),
        color: CHART_COLORS[5],
      });
    }

    return result;
  },

  // 최근 N개월 월별 합계
  getMultiMonthTotals: (monthsBack) => {
    const result: MonthlyTotals[] = [];
    const today = new Date();

    for (let i = monthsBack - 1; i >= 0; i--) {
      const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const year = date.getFullYear();
      const monthNum = date.getMonth() + 1;
      const totals = get().getMonthlyTotal(year, monthNum);

      result.push({
        month: `${monthNum}월`,
        year,
        monthNum,
        ...totals,
      });
    }

    return result;
  },
}));
