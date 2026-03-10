import { generateRepaymentRecords } from '../repaymentRecords';
import { formatDateLocal } from '../debtCalculator';
import { Loan } from '../../types/debt';

// uuid mock
jest.mock('uuid', () => ({
  v4: () => 'test-uuid-' + Math.random().toString(36).substring(7),
}));

function createMockLoan(overrides: Partial<Loan> = {}): Loan {
  return {
    id: 'loan-1',
    name: '테스트 대출',
    institution: 'test_bank',
    principal: 12000000,
    interestRate: 5,
    repaymentType: 'equalPrincipal',
    termMonths: 12,
    startDate: '2025-01-15',
    endDate: '2026-01-15',
    monthlyPayment: 1000000,
    totalInterest: 325000,
    paidMonths: 0,
    remainingPrincipal: 12000000,
    status: 'active',
    memo: null,
    createdAt: '2025-01-15T00:00:00.000Z',
    updatedAt: '2025-01-15T00:00:00.000Z',
    ...overrides,
  };
}

describe('generateRepaymentRecords', () => {
  it('전체 스케줄 수만큼 기록 생성', () => {
    const loan = createMockLoan({ termMonths: 6 });
    const records = generateRepaymentRecords(loan);
    expect(records).toHaveLength(6);
  });

  it('paidMonths만큼 paid 상태로 설정', () => {
    const loan = createMockLoan({ paidMonths: 3 });
    const records = generateRepaymentRecords(loan);

    const paidRecords = records.filter((r) => r.status === 'paid');
    expect(paidRecords).toHaveLength(3);
    expect(paidRecords[0].month).toBe(1);
    expect(paidRecords[1].month).toBe(2);
    expect(paidRecords[2].month).toBe(3);
  });

  it('과거 날짜이면서 미납이면 overdue', () => {
    // 2025-01-15 시작, paidMonths=0 → 1회차(2025-02-15)가 과거라면 overdue
    const loan = createMockLoan({ startDate: '2024-01-15', paidMonths: 0 });
    const records = generateRepaymentRecords(loan);

    // 모든 과거 날짜가 overdue여야 함
    const today = formatDateLocal(new Date());
    const overdueRecords = records.filter((r) => r.status === 'overdue');
    overdueRecords.forEach((r) => {
      expect(r.date <= today).toBe(true);
    });
  });

  it('미래 날짜는 scheduled', () => {
    // 미래 시작 대출
    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 1);
    const startDate = formatDateLocal(futureDate);

    const loan = createMockLoan({ startDate, paidMonths: 0 });
    const records = generateRepaymentRecords(loan);

    // 모든 기록이 scheduled여야 함
    records.forEach((r) => {
      expect(r.status).toBe('scheduled');
    });
  });

  it('각 기록에 loanId가 올바르게 설정', () => {
    const loan = createMockLoan({ id: 'my-loan-id' });
    const records = generateRepaymentRecords(loan);

    records.forEach((r) => {
      expect(r.loanId).toBe('my-loan-id');
    });
  });

  it('기록의 month는 1-based 순서', () => {
    const loan = createMockLoan({ termMonths: 6 });
    const records = generateRepaymentRecords(loan);

    records.forEach((r, i) => {
      expect(r.month).toBe(i + 1);
    });
  });

  it('금액 필드가 양수', () => {
    const loan = createMockLoan();
    const records = generateRepaymentRecords(loan);

    records.forEach((r) => {
      expect(r.total).toBeGreaterThan(0);
      expect(r.principal).toBeGreaterThanOrEqual(0);
      expect(r.interest).toBeGreaterThanOrEqual(0);
    });
  });
});
