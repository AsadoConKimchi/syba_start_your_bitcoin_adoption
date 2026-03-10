import {
  calculateInstallmentPayment,
  calculateLoanPayment,
  generateRepaymentSchedule,
  calculateEndDate,
  isDueThisMonth,
  formatDateLocal,
} from '../debtCalculator';

describe('calculateInstallmentPayment', () => {
  it('무이자 할부 월 납부액', () => {
    const result = calculateInstallmentPayment(120000, 12, true);
    expect(result.monthlyPayment).toBe(10000);
    expect(result.totalInterest).toBe(0);
  });

  it('유이자 할부 월 납부액', () => {
    const result = calculateInstallmentPayment(1000000, 12, false, 12);
    expect(result.monthlyPayment).toBeGreaterThan(0);
    expect(result.totalInterest).toBeGreaterThan(0);
  });
});

describe('calculateLoanPayment', () => {
  it('만기일시상환 (bullet)', () => {
    const result = calculateLoanPayment(10000000, 5, 12, 'bullet');
    // 매월 이자만 납부
    const expectedMonthlyInterest = Math.ceil(10000000 * 0.05 / 12);
    expect(result.monthlyPayment).toBe(expectedMonthlyInterest);
  });

  it('원리금균등상환', () => {
    const result = calculateLoanPayment(10000000, 5, 12, 'equalPrincipalAndInterest');
    expect(result.monthlyPayment).toBeGreaterThan(0);
    expect(result.totalInterest).toBeGreaterThan(0);
  });

  it('원금균등상환', () => {
    const result = calculateLoanPayment(10000000, 5, 12, 'equalPrincipal');
    expect(result.monthlyPayment).toBeGreaterThan(0);
    expect(result.totalInterest).toBeGreaterThan(0);
  });
});

describe('generateRepaymentSchedule - 월말 클램핑', () => {
  it('1월 31일 시작 대출의 스케줄이 월말을 올바르게 처리', () => {
    const schedule = generateRepaymentSchedule(
      12000000, 5, 12, 'equalPrincipal', '2026-01-31'
    );

    expect(schedule).toHaveLength(12);

    // 1회차: 2월 → 28일 (2026년은 평년)
    expect(schedule[0].date).toBe('2026-02-28');
    // 2회차: 3월 → 31일
    expect(schedule[1].date).toBe('2026-03-31');
    // 3회차: 4월 → 30일
    expect(schedule[2].date).toBe('2026-04-30');
    // 4회차: 5월 → 31일
    expect(schedule[3].date).toBe('2026-05-31');
    // 5회차: 6월 → 30일
    expect(schedule[4].date).toBe('2026-06-30');
  });

  it('2월 28일 시작 대출 — 28일 유지', () => {
    const schedule = generateRepaymentSchedule(
      6000000, 5, 6, 'equalPrincipal', '2026-02-28'
    );

    expect(schedule).toHaveLength(6);
    // 28일이 모든 달에 존재하므로 28일 유지
    expect(schedule[0].date).toBe('2026-03-28');
    expect(schedule[1].date).toBe('2026-04-28');
    expect(schedule[2].date).toBe('2026-05-28');
  });

  it('윤년 2월 처리 (2028-01-31)', () => {
    const schedule = generateRepaymentSchedule(
      3000000, 5, 3, 'equalPrincipal', '2028-01-31'
    );

    // 2028년은 윤년 → 2월 29일
    expect(schedule[0].date).toBe('2028-02-29');
    expect(schedule[1].date).toBe('2028-03-31');
    expect(schedule[2].date).toBe('2028-04-30');
  });

  it('만기일시상환 스케줄 — 마지막 회차에 원금 상환', () => {
    const schedule = generateRepaymentSchedule(
      10000000, 5, 3, 'bullet', '2026-01-15'
    );

    expect(schedule).toHaveLength(3);
    // 1~2회차: 원금 0
    expect(schedule[0].principal).toBe(0);
    expect(schedule[1].principal).toBe(0);
    // 마지막 회차: 원금 전액
    expect(schedule[2].principal).toBe(10000000);
    expect(schedule[2].remainingPrincipal).toBe(0);
  });
});

describe('calculateEndDate', () => {
  it('월말 클램핑 적용', () => {
    expect(calculateEndDate('2026-01-31', 1)).toBe('2026-02-28');
    expect(calculateEndDate('2026-01-31', 12)).toBe('2027-01-31');
  });

  it('일반 날짜', () => {
    expect(calculateEndDate('2026-03-15', 6)).toBe('2026-09-15');
  });
});

describe('isDueThisMonth', () => {
  it('이번 달 납부 예정이면 true', () => {
    const now = new Date();
    // startDate를 현재보다 1개월 전으로 설정, paidMonths = 0이면 이번 달이 1회차
    const startYear = now.getFullYear();
    const startMonth = now.getMonth(); // 0-indexed, 1개월 전
    const startDate = new Date(startYear, startMonth - 1, 15);
    const startDateStr = formatDateLocal(startDate);

    expect(isDueThisMonth(startDateStr, 0)).toBe(true);
  });

  it('이미 납부한 회차는 false', () => {
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth() - 1, 15);
    const startDateStr = formatDateLocal(startDate);

    // paidMonths = 1이면 다음 납부는 2회차 (2개월 후)
    expect(isDueThisMonth(startDateStr, 1)).toBe(false);
  });
});
