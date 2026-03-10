import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { Installment, Loan, RepaymentType } from '../types/debt';
import { RepaymentRecord } from '../types/repayment';
import {
  calculateInstallmentPayment,
  calculateLoanPayment,
  calculateEndDate,
  calculatePaidMonths,
  isDueThisMonth,
  generateRepaymentSchedule,
} from '../utils/debtCalculator';
import { loadEncrypted, saveEncrypted, FILE_PATHS } from '../utils/storage';
import { generateRepaymentRecords } from '../utils/repaymentRecords';

interface DebtState {
  installments: Installment[];
  loans: Loan[];
  repaymentRecords: RepaymentRecord[];
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

  deleteLoan: (id: string, encryptionKey: string, options?: {
    rollbackAsset?: boolean;
    deleteRecords?: boolean;
  }) => Promise<void>;

  // 상환 기록
  getRecordsForLoan: (loanId: string) => RepaymentRecord[];
  getAutoDeductedTotal: (loanId: string) => { total: number; count: number };
  markRecordAsPaid: (recordId: string, encryptionKey: string, fallback?: { loanId: string; month: number }) => Promise<void>;

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
  repaymentRecords: [],
  isLoading: true,

  // 데이터 로드
  loadDebts: async (encryptionKey: string) => {
    try {
      const results = await Promise.allSettled([
        loadEncrypted<Installment[]>(FILE_PATHS.INSTALLMENTS, encryptionKey, []),
        loadEncrypted<Loan[]>(FILE_PATHS.LOANS, encryptionKey, []),
        loadEncrypted<RepaymentRecord[]>(FILE_PATHS.REPAYMENT_RECORDS, encryptionKey, []),
      ]);

      const dataNames = ['installments', 'loans', 'repaymentRecords'] as const;
      results.forEach((r, i) => {
        if (r.status === 'rejected') {
          console.error(`부채 데이터 부분 로드 실패 (${dataNames[i]}):`, r.reason);
        }
      });

      const installmentsData = results[0].status === 'fulfilled' ? results[0].value : [];
      const loansData = results[1].status === 'fulfilled' ? results[1].value : [];
      const recordsData = results[2].status === 'fulfilled' ? results[2].value : [];

      // v1.1.x → v1.2.0 마이그레이션: 상환 기록이 없으면 기존 대출에서 생성
      let records = recordsData;
      if (records.length === 0 && loansData.length > 0) {
        const allRecords: RepaymentRecord[] = [];
        for (const loan of loansData) {
          if (loan.status === 'cancelled') continue;
          allRecords.push(...generateRepaymentRecords(loan));
        }
        if (allRecords.length > 0) {
          records = allRecords;
          await saveEncrypted(FILE_PATHS.REPAYMENT_RECORDS, records, encryptionKey);
          if (__DEV__) { console.log(`[DebtStore] 상환 기록 마이그레이션 완료: ${records.length}건`); }
        }
      }

      set({
        installments: installmentsData,
        loans: loansData,
        repaymentRecords: records,
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

      // 금액/개월/납부회차 변경 시 재계산
      if (data.totalAmount !== undefined || data.months !== undefined || data.isInterestFree !== undefined || data.paidMonths !== undefined) {
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

    // 잔여 원금 계산 (상환 방식에 따라 다름)
    let remainingPrincipal = data.principal;
    if (data.repaymentType !== 'bullet' && paidMonths > 0) {
      if (data.repaymentType === 'equalPrincipalAndInterest') {
        // 원리금균등: 스케줄에서 정확한 잔여원금 추출
        const schedule = generateRepaymentSchedule(
          data.principal, data.interestRate, data.termMonths,
          data.repaymentType, data.startDate
        );
        const targetEntry = schedule[Math.min(paidMonths, schedule.length) - 1];
        remainingPrincipal = targetEntry ? targetEntry.remainingPrincipal : 0;
      } else {
        // 원금균등: 단순 비례 계산
        const monthlyPrincipal = data.principal / data.termMonths;
        remainingPrincipal = Math.max(0, data.principal - monthlyPrincipal * paidMonths);
      }
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

    // 상환 기록 생성
    const newRecords = generateRepaymentRecords(newLoan);
    const allRecords = [...get().repaymentRecords, ...newRecords];

    set({ loans: updated, repaymentRecords: allRecords });

    await Promise.all([
      saveEncrypted(FILE_PATHS.LOANS, updated, encryptionKey),
      saveEncrypted(FILE_PATHS.REPAYMENT_RECORDS, allRecords, encryptionKey),
    ]);
    return newLoan;
  },

  // 대출 수정
  updateLoan: async (id, data, encryptionKey) => {
    const existingLoan = get().loans.find((item) => item.id === id);
    if (!existingLoan) return;

    // 호출자 객체 변이 방지를 위해 복사본 사용
    const safeData = { ...data };

    // 상환 방식 변경 차단 (삭제 후 재생성으로만 가능)
    if (safeData.repaymentType && safeData.repaymentType !== existingLoan.repaymentType) {
      delete safeData.repaymentType;
    }

    // 스케줄에 영향을 주는 필드 변경 감지
    const scheduleAffected =
      (safeData.principal !== undefined && safeData.principal !== existingLoan.principal) ||
      (safeData.interestRate !== undefined && safeData.interestRate !== existingLoan.interestRate) ||
      (safeData.termMonths !== undefined && safeData.termMonths !== existingLoan.termMonths) ||
      (safeData.startDate !== undefined && safeData.startDate !== existingLoan.startDate) ||
      (safeData.paidMonths !== undefined && safeData.paidMonths !== existingLoan.paidMonths);

    const loans = get().loans.map((item) => {
      if (item.id !== id) return item;

      const updated = { ...item, ...safeData, updatedAt: new Date().toISOString() };

      // 조건 변경 시 재계산
      if (
        data.principal !== undefined ||
        data.interestRate !== undefined ||
        data.termMonths !== undefined
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

    const updatedLoan = loans.find((l) => l.id === id)!;

    // 스케줄 영향 필드가 변경되면 상환 기록 재생성
    let repaymentRecords = get().repaymentRecords;
    if (scheduleAffected) {
      // 기존 기록에서 실제 납부(paidAt 있는) 기록 보존
      const existingRecords = repaymentRecords.filter((r) => r.loanId === id);
      const paidAtMap = new Map<number, string>();
      existingRecords.forEach((r) => {
        if (r.paidAt) paidAtMap.set(r.month, r.paidAt);
      });

      // 새 스케줄 생성
      const newRecords = generateRepaymentRecords(updatedLoan);

      // 실제 납부 기록의 paidAt 복원
      newRecords.forEach((r) => {
        const existingPaidAt = paidAtMap.get(r.month);
        if (existingPaidAt) {
          r.status = 'paid';
          r.paidAt = existingPaidAt;
        }
      });

      // 다른 대출의 기록은 유지, 현재 대출만 교체
      repaymentRecords = [
        ...repaymentRecords.filter((r) => r.loanId !== id),
        ...newRecords,
      ];
    }

    set({ loans, repaymentRecords });
    await Promise.all([
      saveEncrypted(FILE_PATHS.LOANS, loans, encryptionKey),
      ...(scheduleAffected
        ? [saveEncrypted(FILE_PATHS.REPAYMENT_RECORDS, repaymentRecords, encryptionKey)]
        : []),
    ]);
  },

  // 대출 삭제 (cascade 옵션 포함)
  deleteLoan: async (id, encryptionKey, options) => {
    const loan = get().loans.find((item) => item.id === id);
    const { rollbackAsset = false, deleteRecords = false } = options ?? {};

    // 롤백: 자동차감 금액을 연결 계좌에 복원
    if (rollbackAsset && loan?.linkedAssetId) {
      const { total } = get().getAutoDeductedTotal(id);
      if (total > 0) {
        const { useAssetStore } = require('./assetStore');
        await useAssetStore.getState().adjustAssetBalance(
          loan.linkedAssetId,
          total, // 양수: 잔액 증가 (복원)
          encryptionKey
        );
      }
    }

    // cascade: linkedLoanId로 연관 지출 기록 삭제
    if (deleteRecords) {
      const { useLedgerStore } = require('./ledgerStore');
      const { records, deleteRecord } = useLedgerStore.getState();
      const loanExpenses = records.filter(
        (r: { type: string; linkedLoanId?: string | null }) =>
          r.type === 'expense' && r.linkedLoanId === id
      );
      for (const record of loanExpenses) {
        await deleteRecord(record.id);
      }
    }

    try {
      const loans = get().loans.filter((item) => item.id !== id);
      const repaymentRecords = get().repaymentRecords.filter((r) => r.loanId !== id);
      set({ loans, repaymentRecords });
      await Promise.all([
        saveEncrypted(FILE_PATHS.LOANS, loans, encryptionKey),
        saveEncrypted(FILE_PATHS.REPAYMENT_RECORDS, repaymentRecords, encryptionKey),
      ]);
    } catch (error) {
      // 삭제 실패 시 롤백한 금액을 다시 차감하여 원복
      if (rollbackAsset && loan?.linkedAssetId) {
        const { total } = get().getAutoDeductedTotal(id);
        if (total > 0) {
          const { useAssetStore } = require('./assetStore');
          await useAssetStore.getState().adjustAssetBalance(
            loan.linkedAssetId,
            -total, // 음수: 롤백 취소 (재차감)
            encryptionKey
          ).catch(() => {});
        }
      }
      throw error;
    }
  },

  // 특정 대출의 상환 기록 조회
  getRecordsForLoan: (loanId: string) => {
    return get().repaymentRecords.filter((r) => r.loanId === loanId);
  },

  // 자동차감된 총액 조회 (paidAt이 설정된 기록 = 실제 자산 차감 발생)
  getAutoDeductedTotal: (loanId: string) => {
    const records = get().repaymentRecords.filter(
      (r) => r.loanId === loanId && r.paidAt !== undefined
    );
    return {
      total: records.reduce((sum, r) => sum + r.total, 0),
      count: records.length,
    };
  },

  // 상환 기록 납부 완료 처리
  markRecordAsPaid: async (recordId: string, encryptionKey: string, fallback?: { loanId: string; month: number }) => {
    const now = new Date().toISOString();
    let found = false;

    const repaymentRecords = get().repaymentRecords.map((r) => {
      if (r.id === recordId) {
        found = true;
        return { ...r, status: 'paid' as const, paidAt: now };
      }
      return r;
    });

    let finalRecords = repaymentRecords;
    if (!found && fallback) {
      // ID 불일치 시 loanId + month로 재검색 (레코드 재생성으로 UUID가 변경된 경우)
      let fallbackFound = false;
      finalRecords = repaymentRecords.map((r) => {
        if (!fallbackFound && r.loanId === fallback.loanId && r.month === fallback.month && !r.paidAt) {
          fallbackFound = true;
          return { ...r, status: 'paid' as const, paidAt: now };
        }
        return r;
      });
    }

    set({ repaymentRecords: finalRecords });
    await saveEncrypted(FILE_PATHS.REPAYMENT_RECORDS, finalRecords, encryptionKey);
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
    const installments = get().installments.filter((item) => {
      if (item.status !== 'active') return false;
      return isDueThisMonth(item.startDate, item.paidMonths);
    });

    const loans = get().loans.filter((item) => {
      if (item.status !== 'active') return false;
      return isDueThisMonth(item.startDate, item.paidMonths);
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
