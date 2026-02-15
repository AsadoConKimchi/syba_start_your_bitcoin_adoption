import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { Installment, Loan, RepaymentType } from '../types/debt';
import {
  calculateInstallmentPayment,
  calculateLoanPayment,
  calculateEndDate,
  calculatePaidMonths,
} from '../utils/debtCalculator';
import { loadEncrypted, saveEncrypted, FILE_PATHS } from '../utils/storage';

interface DebtState {
  installments: Installment[];
  loans: Loan[];
  isLoading: boolean;
}

interface DebtActions {
  // 초기화
  loadDebts: (encryptionKey: string) => Promise<void>;

  // 할부
  addInstallment: (
    data: {
      cardId: string;
      expenseId?: string;
      storeName: string;
      totalAmount: number;
      months: number;
      isInterestFree: boolean;
      interestRate?: number;
      startDate: string;
      paidMonths?: number;
      memo?: string;
    },
    encryptionKey: string
  ) => Promise<Installment>;

  updateInstallment: (
    id: string,
    data: Partial<Installment>,
    encryptionKey: string
  ) => Promise<void>;

  deleteInstallment: (id: string, encryptionKey: string) => Promise<void>;

  // 대출
  addLoan: (
    data: {
      name: string;
      institution: string;
      principal: number;
      interestRate: number;
      repaymentType: RepaymentType;
      termMonths: number;
      startDate: string;
      paidMonths?: number;
      memo?: string;
      repaymentDay?: number;
      linkedAssetId?: string;
      interestPaymentDay?: number;
    },
    encryptionKey: string
  ) => Promise<Loan>;

  updateLoan: (
    id: string,
    data: Partial<Loan>,
    encryptionKey: string
  ) => Promise<void>;

  deleteLoan: (id: string, encryptionKey: string) => Promise<void>;

  // 헬퍼
  getInstallmentByExpenseId: (expenseId: string) => Installment | undefined;
  getActiveInstallments: () => Installment[];
  getActiveLoans: () => Loan[];
  getThisMonthDue: () => { installments: Installment[]; loans: Loan[] };
  getTotalDebt: () => number;
}

export const useDebtStore = create<DebtState & DebtActions>((set, get) => ({
  installments: [],
  loans: [],
  isLoading: true,

  // 데이터 로드
  loadDebts: async (encryptionKey: string) => {
    try {
      const [installmentsData, loansData] = await Promise.all([
        loadEncrypted<Installment[]>(FILE_PATHS.INSTALLMENTS, encryptionKey, []),
        loadEncrypted<Loan[]>(FILE_PATHS.LOANS, encryptionKey, []),
      ]);

      set({
        installments: installmentsData,
        loans: loansData,
        isLoading: false,
      });
    } catch (error) {
      console.error('부채 데이터 로드 실패:', error);
      set({ isLoading: false });
    }
  },

  // 할부 추가
  addInstallment: async (data, encryptionKey) => {
    const { monthlyPayment, totalInterest } = calculateInstallmentPayment(
      data.totalAmount,
      data.months,
      data.isInterestFree,
      data.interestRate || 0
    );

    const paidMonths = data.paidMonths ?? calculatePaidMonths(data.startDate);
    const remainingMonths = Math.max(0, data.months - paidMonths);

    // 잔액 계산: 원금에서 납부한 금액을 빼는 방식 (반올림 오차 방지)
    const paidAmount = monthlyPayment * paidMonths;
    const totalPayment = data.isInterestFree ? data.totalAmount : data.totalAmount + totalInterest;
    const remainingAmount = Math.max(0, totalPayment - paidAmount);

    const newInstallment: Installment = {
      id: uuidv4(),
      cardId: data.cardId,
      expenseId: data.expenseId || null,
      storeName: data.storeName,
      totalAmount: data.totalAmount,
      months: data.months,
      isInterestFree: data.isInterestFree,
      interestRate: data.interestRate || 0,
      monthlyPayment,
      totalInterest,
      startDate: data.startDate,
      endDate: calculateEndDate(data.startDate, data.months),
      paidMonths,
      remainingAmount,
      status: remainingMonths === 0 ? 'completed' : 'active',
      memo: data.memo || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const updated = [...get().installments, newInstallment];
    set({ installments: updated });

    await saveEncrypted(FILE_PATHS.INSTALLMENTS, updated, encryptionKey);
    return newInstallment;
  },

  // 할부 수정
  updateInstallment: async (id, data, encryptionKey) => {
    const installments = get().installments.map((item) => {
      if (item.id !== id) return item;

      const updated = { ...item, ...data, updatedAt: new Date().toISOString() };

      // 금액/개월 변경 시 재계산
      if (data.totalAmount !== undefined || data.months !== undefined || data.isInterestFree !== undefined) {
        const { monthlyPayment, totalInterest } = calculateInstallmentPayment(
          updated.totalAmount,
          updated.months,
          updated.isInterestFree,
          updated.interestRate
        );
        updated.monthlyPayment = monthlyPayment;
        updated.totalInterest = totalInterest;
        updated.endDate = calculateEndDate(updated.startDate, updated.months);

        const remainingMonths = Math.max(0, updated.months - updated.paidMonths);
        // 잔액 계산: 원금에서 납부한 금액을 빼는 방식 (반올림 오차 방지)
        const paidAmount = monthlyPayment * updated.paidMonths;
        const totalPayment = updated.isInterestFree ? updated.totalAmount : updated.totalAmount + totalInterest;
        updated.remainingAmount = Math.max(0, totalPayment - paidAmount);
        updated.status = remainingMonths === 0 ? 'completed' : 'active';
      }

      return updated;
    });

    set({ installments });
    await saveEncrypted(FILE_PATHS.INSTALLMENTS, installments, encryptionKey);
  },

  // 할부 삭제
  deleteInstallment: async (id, encryptionKey) => {
    const installments = get().installments.filter((item) => item.id !== id);
    set({ installments });
    await saveEncrypted(FILE_PATHS.INSTALLMENTS, installments, encryptionKey);
  },

  // 대출 추가
  addLoan: async (data, encryptionKey) => {
    const { monthlyPayment, totalInterest } = calculateLoanPayment(
      data.principal,
      data.interestRate,
      data.termMonths,
      data.repaymentType
    );

    const paidMonths = data.paidMonths ?? calculatePaidMonths(data.startDate);

    // 잔여 원금 계산 (원금균등/원리금균등의 경우)
    let remainingPrincipal = data.principal;
    if (data.repaymentType !== 'bullet' && paidMonths > 0) {
      const monthlyPrincipal = data.principal / data.termMonths;
      remainingPrincipal = Math.max(0, data.principal - monthlyPrincipal * paidMonths);
    }

    const newLoan: Loan = {
      id: uuidv4(),
      name: data.name,
      institution: data.institution,
      principal: data.principal,
      interestRate: data.interestRate,
      repaymentType: data.repaymentType,
      termMonths: data.termMonths,
      repaymentDay: data.repaymentDay,
      startDate: data.startDate,
      endDate: calculateEndDate(data.startDate, data.termMonths),
      monthlyPayment,
      totalInterest,
      paidMonths,
      remainingPrincipal: Math.ceil(remainingPrincipal),
      status: paidMonths >= data.termMonths ? 'completed' : 'active',
      linkedAssetId: data.linkedAssetId,
      interestPaymentDay: data.interestPaymentDay,
      memo: data.memo || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const updated = [...get().loans, newLoan];
    set({ loans: updated });

    await saveEncrypted(FILE_PATHS.LOANS, updated, encryptionKey);
    return newLoan;
  },

  // 대출 수정
  updateLoan: async (id, data, encryptionKey) => {
    const loans = get().loans.map((item) => {
      if (item.id !== id) return item;

      const updated = { ...item, ...data, updatedAt: new Date().toISOString() };

      // 조건 변경 시 재계산
      if (
        data.principal !== undefined ||
        data.interestRate !== undefined ||
        data.termMonths !== undefined ||
        data.repaymentType !== undefined
      ) {
        const { monthlyPayment, totalInterest } = calculateLoanPayment(
          updated.principal,
          updated.interestRate,
          updated.termMonths,
          updated.repaymentType
        );
        updated.monthlyPayment = monthlyPayment;
        updated.totalInterest = totalInterest;
        updated.endDate = calculateEndDate(updated.startDate, updated.termMonths);
      }

      return updated;
    });

    set({ loans });
    await saveEncrypted(FILE_PATHS.LOANS, loans, encryptionKey);
  },

  // 대출 삭제
  deleteLoan: async (id, encryptionKey) => {
    const loans = get().loans.filter((item) => item.id !== id);
    set({ loans });
    await saveEncrypted(FILE_PATHS.LOANS, loans, encryptionKey);
  },

  // 지출 기록 ID로 할부 조회
  getInstallmentByExpenseId: (expenseId: string) => {
    return get().installments.find((item) => item.expenseId === expenseId);
  },

  // 진행 중인 할부 조회
  getActiveInstallments: () => {
    return get().installments.filter((item) => item.status === 'active');
  },

  // 진행 중인 대출 조회
  getActiveLoans: () => {
    return get().loans.filter((item) => item.status === 'active');
  },

  // 이번 달 납부 예정
  getThisMonthDue: () => {
    const now = new Date();
    const thisMonth = now.getMonth();
    const thisYear = now.getFullYear();

    const installments = get().installments.filter((item) => {
      if (item.status !== 'active') return false;
      const start = new Date(item.startDate);
      const nextPaymentMonth = (start.getMonth() + item.paidMonths + 1) % 12;
      const nextPaymentYear =
        start.getFullYear() + Math.floor((start.getMonth() + item.paidMonths + 1) / 12);
      return nextPaymentMonth === thisMonth && nextPaymentYear === thisYear;
    });

    const loans = get().loans.filter((item) => {
      if (item.status !== 'active') return false;
      const start = new Date(item.startDate);
      const nextPaymentMonth = (start.getMonth() + item.paidMonths + 1) % 12;
      const nextPaymentYear =
        start.getFullYear() + Math.floor((start.getMonth() + item.paidMonths + 1) / 12);
      return nextPaymentMonth === thisMonth && nextPaymentYear === thisYear;
    });

    return { installments, loans };
  },

  // 총 부채 계산
  getTotalDebt: () => {
    const installmentTotal = get()
      .installments.filter((i) => i.status === 'active')
      .reduce((sum, i) => sum + i.remainingAmount, 0);

    const loanTotal = get()
      .loans.filter((l) => l.status === 'active')
      .reduce((sum, l) => sum + l.remainingPrincipal, 0);

    return installmentTotal + loanTotal;
  },
}));
