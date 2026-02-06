import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { LedgerRecord, Expense, Income } from '../types/ledger';
import { saveEncrypted, loadEncrypted, FILE_PATHS } from '../utils/storage';
import { useAuthStore } from './authStore';
import { useAssetStore } from './assetStore';
import { fetchHistoricalBtcPrice } from '../services/api/upbit';
import { krwToSats, satsToKrw } from '../utils/calculations';

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
    expense: Omit<Expense, 'id' | 'type' | 'createdAt' | 'updatedAt' | 'btcKrwAtTime' | 'satsEquivalent' | 'needsPriceSync'> & { installmentMonths?: number | null }
  ) => Promise<string>; // Returns expense ID
  addIncome: (
    income: Omit<Income, 'id' | 'type' | 'createdAt' | 'updatedAt' | 'btcKrwAtTime' | 'satsEquivalent' | 'needsPriceSync'>
  ) => Promise<string>; // Returns income ID
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
      set({ error: '인증 필요' });
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
      set({ error: '데이터 로드 실패', isLoading: false });
    }
  },

  // 파일에 저장
  saveRecords: async () => {
    console.log('[DEBUG] saveRecords 시작');
    const encryptionKey = useAuthStore.getState().encryptionKey;
    console.log('[DEBUG] encryptionKey:', encryptionKey ? '있음' : '없음 (null)');

    if (!encryptionKey) {
      console.log('[DEBUG] encryptionKey가 없어서 저장 중단');
      set({ error: '암호화 키 없음' });
      return;
    }

    try {
      console.log('[DEBUG] saveEncrypted 호출 시도');
      await saveEncrypted(FILE_PATHS.LEDGER, get().records, encryptionKey);
      console.log('[DEBUG] saveEncrypted 성공');
    } catch (error) {
      console.log('[DEBUG] saveEncrypted 실패:', error);
      set({ error: '저장 실패' });
    }
  },

  // 지출 추가
  addExpense: async (expenseData) => {
    console.log('[DEBUG] addExpense 시작', expenseData);
    try {
      const now = new Date().toISOString();
      let btcKrwAtTime: number | null = null;
      let satsEquivalent: number | null = null;
      let needsPriceSync = false;

      // 원화 기록 시 BTC 시세 조회하여 sats 환산
      if (expenseData.currency === 'KRW') {
        try {
          console.log('[DEBUG] BTC 시세 조회 시도');
          btcKrwAtTime = await fetchHistoricalBtcPrice(expenseData.date);
          satsEquivalent = krwToSats(expenseData.amount, btcKrwAtTime);
          console.log('[DEBUG] BTC 시세 조회 성공:', btcKrwAtTime);
        } catch (e) {
          console.log('[DEBUG] BTC 시세 조회 실패, 나중에 동기화:', e);
          needsPriceSync = true;
        }
      }
      // SATS 기록 시: amount가 sats 값, satsEquivalent에 그대로 저장
      else if (expenseData.currency === 'SATS') {
        satsEquivalent = expenseData.amount; // sats 값 그대로
        try {
          btcKrwAtTime = await fetchHistoricalBtcPrice(expenseData.date);
          console.log('[DEBUG] SATS 기록 - BTC 시세 조회 성공:', btcKrwAtTime);
        } catch (e) {
          console.log('[DEBUG] SATS 기록 - BTC 시세 조회 실패:', e);
          needsPriceSync = true;
        }
      }

      console.log('[DEBUG] UUID 생성 시도');
      const id = uuidv4();
      console.log('[DEBUG] UUID 생성 성공:', id);

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
      console.log('[DEBUG] expense 객체 생성 완료');

      set(state => ({ records: [...state.records, expense] }));
      console.log('[DEBUG] state 업데이트 완료');

      await get().saveRecords();
      console.log('[DEBUG] addExpense 완료');

      // 자산 연동: 즉시 차감 (계좌이체/Lightning/Onchain)
      const encryptionKey = useAuthStore.getState().encryptionKey;
      if (
        expenseData.linkedAssetId &&
        encryptionKey &&
        (expenseData.paymentMethod === 'bank' ||
          expenseData.paymentMethod === 'lightning' ||
          expenseData.paymentMethod === 'onchain')
      ) {
        console.log('[DEBUG] 자산 잔액 차감 시작:', expenseData.linkedAssetId);
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
        console.log('[DEBUG] 자산 잔액 차감 완료');
      }

      return id; // Return expense ID for linking
    } catch (error) {
      console.log('[DEBUG] addExpense 에러:', error);
      throw error;  // 에러를 다시 던져서 UI에서 처리
    }
  },

  // 수입 추가
  addIncome: async (incomeData) => {
    const now = new Date().toISOString();
    let btcKrwAtTime: number | null = null;
    let satsEquivalent: number | null = null;
    let needsPriceSync = false;

    // 원화 기록 시 BTC 시세 조회하여 sats 환산
    if (incomeData.currency === 'KRW') {
      try {
        btcKrwAtTime = await fetchHistoricalBtcPrice(incomeData.date);
        satsEquivalent = krwToSats(incomeData.amount, btcKrwAtTime);
      } catch (error) {
        console.log('[오프라인] BTC 시세 조회 실패, 나중에 동기화:', error);
        needsPriceSync = true;
      }
    }
    // SATS 기록 시: amount가 sats 값, satsEquivalent에 그대로 저장
    else if (incomeData.currency === 'SATS') {
      satsEquivalent = incomeData.amount; // sats 값 그대로
      try {
        btcKrwAtTime = await fetchHistoricalBtcPrice(incomeData.date);
        console.log('[DEBUG] SATS 수입 - BTC 시세 조회 성공:', btcKrwAtTime);
      } catch (error) {
        console.log('[DEBUG] SATS 수입 - BTC 시세 조회 실패:', error);
        needsPriceSync = true;
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
      console.log('[DEBUG] 수입 - 자산 잔액 증가 시작:', incomeData.linkedAssetId);

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
      console.log('[DEBUG] 수입 - 자산 잔액 증가 완료');
    }

    return id; // Return income ID
  },

  // 수정
  updateRecord: async (id, updates) => {
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
  },

  // 삭제
  deleteRecord: async (id) => {
    set(state => ({
      records: state.records.filter(record => record.id !== id),
    }));
    await get().saveRecords();
  },

  // 오프라인 기록 시세 동기화
  syncPendingPrices: async () => {
    const { records, updateRecord } = get();
    const pendingRecords = records.filter(r => r.needsPriceSync);

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
        console.log('[오프라인] 시세 동기화 실패, 다음에 재시도:', error);
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
    const today = new Date().toISOString().split('T')[0];
    const todayRecords = get().getRecordsByDate(today);

    let income = 0;
    let expense = 0;

    for (const record of todayRecords) {
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
    const expenses = monthRecords.filter(r => r.type === 'expense' && r.currency === 'KRW');

    // 카테고리별 합계
    const categoryTotals: Record<string, number> = {};
    let totalExpense = 0;

    for (const expense of expenses) {
      const category = expense.category || '미분류';
      categoryTotals[category] = (categoryTotals[category] || 0) + expense.amount;
      totalExpense += expense.amount;
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
        category: '기타',
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
