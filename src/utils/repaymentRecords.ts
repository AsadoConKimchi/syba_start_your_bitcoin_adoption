import { v4 as uuidv4 } from 'uuid';
import { Loan } from '../types/debt';
import { RepaymentRecord } from '../types/repayment';
import { generateRepaymentSchedule } from './debtCalculator';

/**
 * 대출에 대한 전체 상환 기록 생성
 * - 기존 대출(마이그레이션): paidMonths 기반으로 paid/scheduled/overdue 분류
 * - 새 대출: 전체 scheduled로 생성
 */
export function generateRepaymentRecords(loan: Loan): RepaymentRecord[] {
  const schedule = generateRepaymentSchedule(
    loan.principal,
    loan.interestRate,
    loan.termMonths,
    loan.repaymentType,
    loan.startDate
  );

  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const d = String(today.getDate()).padStart(2, '0');
  const todayStr = `${y}-${m}-${d}`;

  return schedule.map((s) => {
    let status: RepaymentRecord['status'];
    if (s.month <= loan.paidMonths) {
      status = 'paid';
    } else if (s.date <= todayStr) {
      status = 'overdue';
    } else {
      status = 'scheduled';
    }

    return {
      id: uuidv4(),
      loanId: loan.id,
      month: s.month,
      date: s.date,
      principal: s.principal,
      interest: s.interest,
      total: s.total,
      remainingPrincipal: s.remainingPrincipal,
      status,
      // paidAt은 markRecordAsPaid에서만 설정 (실제 자동차감 시점)
    };
  });
}
