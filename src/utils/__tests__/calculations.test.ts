import {
  calculateElapsedMonths,
  getTotalMonths,
  calculateMonthlyPayment,
  calculateRemainingBalance,
  calculateKimchiPremium,
  krwToSats,
  satsToKrw,
} from '../calculations';

describe('krwToSats', () => {
  it('should convert KRW to sats correctly', () => {
    // BTC = 100,000,000 KRW → 1 KRW = 1 sat
    expect(krwToSats(100000, 100000000)).toBe(100000);
  });

  it('should return 0 when btcKrw is 0', () => {
    expect(krwToSats(50000, 0)).toBe(0);
  });

  it('should round to nearest sat', () => {
    // 50,000 KRW, BTC = 150,000,000 KRW
    // 50000 / 150000000 * 100000000 = 33333.33... → 33333
    expect(krwToSats(50000, 150000000)).toBe(33333);
  });
});

describe('satsToKrw', () => {
  it('should convert sats to KRW correctly', () => {
    // 100,000 sats, BTC = 100,000,000 KRW → 100,000 KRW
    expect(satsToKrw(100000, 100000000)).toBe(100000);
  });

  it('should round to nearest won', () => {
    expect(satsToKrw(33333, 150000000)).toBe(50000);
  });
});

describe('calculateKimchiPremium', () => {
  it('should calculate positive premium', () => {
    // KRW price is 5% higher than international
    const btcKrw = 105000000;
    const btcUsdt = 70000;
    const usdKrw = 1428.57; // 70000 * 1428.57 ≈ 100,000,000
    const premium = calculateKimchiPremium(btcKrw, btcUsdt, usdKrw);
    expect(premium).toBeCloseTo(5.0, 0);
  });

  it('should calculate negative premium (discount)', () => {
    const btcKrw = 95000000;
    const btcUsdt = 70000;
    const usdKrw = 1428.57;
    const premium = calculateKimchiPremium(btcKrw, btcUsdt, usdKrw);
    expect(premium).toBeLessThan(0);
  });

  it('should return 0 when prices match', () => {
    const btcKrw = 100000000;
    const btcUsdt = 70000;
    const usdKrw = 100000000 / 70000;
    const premium = calculateKimchiPremium(btcKrw, btcUsdt, usdKrw);
    expect(premium).toBeCloseTo(0, 1);
  });
});

describe('getTotalMonths', () => {
  it('should calculate months between dates', () => {
    expect(getTotalMonths('2026-01-01', '2027-01-01')).toBe(12);
    expect(getTotalMonths('2026-01-01', '2026-07-01')).toBe(6);
    expect(getTotalMonths('2026-03-15', '2026-03-15')).toBe(0);
  });
});

describe('calculateMonthlyPayment', () => {
  it('should calculate bullet loan (interest only)', () => {
    // 1000만원, 연 12%, 12개월 → 월 이자 = 100,000원
    const payment = calculateMonthlyPayment(10000000, 0.12, 12, 'bullet');
    expect(payment).toBe(100000);
  });

  it('should calculate equal principal+interest', () => {
    // 1000만원, 연 12%, 12개월
    const payment = calculateMonthlyPayment(10000000, 0.12, 12, 'equalPrincipalAndInterest');
    expect(payment).toBeGreaterThan(0);
    // 원리금균등: 약 888,488원
    expect(payment).toBeCloseTo(888488, -2);
  });

  it('should handle 0% interest for equal principal+interest', () => {
    const payment = calculateMonthlyPayment(1200000, 0, 12, 'equalPrincipalAndInterest');
    expect(payment).toBe(100000);
  });

  it('should calculate equal principal (first month)', () => {
    // 1200만원, 연 12%, 12개월 → 원금 100만 + 이자 12만 = 112만
    const payment = calculateMonthlyPayment(12000000, 0.12, 12, 'equalPrincipal');
    expect(payment).toBe(1120000);
  });
});

describe('calculateRemainingBalance', () => {
  it('should return full principal for bullet loan', () => {
    const balance = calculateRemainingBalance(10000000, 0.12, 12, 'bullet', 100000, 6);
    expect(balance).toBe(10000000);
  });

  it('should decrease for equal principal', () => {
    // 1200만원, 12개월, 6개월 납부 → 남은 원금 = 600만원
    const balance = calculateRemainingBalance(12000000, 0.12, 12, 'equalPrincipal', 1120000, 6);
    expect(balance).toBe(6000000);
  });

  it('should be 0 after all payments for equal principal', () => {
    const balance = calculateRemainingBalance(12000000, 0.12, 12, 'equalPrincipal', 1120000, 12);
    expect(balance).toBe(0);
  });
});
