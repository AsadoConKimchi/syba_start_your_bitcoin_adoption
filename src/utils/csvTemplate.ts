import { Asset } from '../types/asset';
import { Card } from '../types/card';
import { Loan, Installment } from '../types/debt';

/**
 * Generate a CSV import template with user's registered assets/cards/loans/installments as comments.
 */
export function generateCSVTemplate(
  assets: Asset[],
  cards: Card[],
  loans: Loan[],
  installments: Installment[]
): string {
  const lines: string[] = [];

  lines.push('# SYBA Import Template v1');
  lines.push('# ===================================');

  // List registered items
  if (assets.length > 0) {
    lines.push(`# [계좌/Account] ${assets.map((a) => a.name).join(' | ')}`);
  } else {
    lines.push('# [계좌/Account] (없음/none)');
  }

  if (cards.length > 0) {
    lines.push(`# [카드/Card] ${cards.map((c) => c.name).join(' | ')}`);
  } else {
    lines.push('# [카드/Card] (없음/none)');
  }

  if (loans.length > 0) {
    lines.push(`# [대출/Loan] ${loans.map((l) => l.name).join(' | ')}`);
  } else {
    lines.push('# [대출/Loan] (없음/none)');
  }

  if (installments.length > 0) {
    lines.push(
      `# [할부 ID/Installment] ${installments
        .map((i) => `${i.id} (${i.storeName} ${i.months}개월)`)
        .join(' | ')}`
    );
  } else {
    lines.push('# [할부 ID/Installment] (없음/none)');
  }

  lines.push('# ===================================');
  lines.push('# type: expense / income');
  lines.push('# currency: KRW / SATS');
  lines.push('# payment_method: cash / card / bank / lightning / onchain');
  lines.push('# account_name: 위 [계좌] 중 하나 (bank/lightning/onchain)');
  lines.push('# card_name: 위 [카드] 중 하나 (card)');
  lines.push('# loan_name: 위 [대출] 중 하나 (대출 이자/원리금)');
  lines.push('# installment_id: 위 [할부 ID] 중 하나');
  lines.push('# ===================================');
  lines.push('date,type,amount,currency,category,payment_method,account_name,card_name,loan_name,installment_id,memo');
  lines.push('2026-02-01,expense,50000,KRW,식비,card,,신한카드,,,마트');
  lines.push('2026-02-05,income,3000000,KRW,급여,bank,신한 생활비,,,,2월 월급');
  lines.push('2026-02-10,expense,150000,KRW,금융,bank,신한 생활비,,전세대출,,이자 납부');

  return lines.join('\n') + '\n';
}
