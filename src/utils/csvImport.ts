import { Asset } from '../types/asset';
import { Card } from '../types/card';
import { Loan, Installment } from '../types/debt';
import { Expense, Income } from '../types/ledger';

export interface ParsedRow {
  date: string;
  type: 'expense' | 'income';
  amount: number;
  currency: 'KRW' | 'SATS';
  category: string;
  paymentMethod: string;
  accountName: string | null;
  cardName: string | null;
  loanName: string | null;
  installmentId: string | null;
  memo: string | null;
}

export interface ImportResult {
  rows: ParsedRow[];
  errors: { line: number; message: string }[];
}

const HEADER_COLUMNS = [
  'date', 'type', 'amount', 'currency', 'category', 'payment_method',
  'account_name', 'card_name', 'loan_name', 'installment_id', 'memo',
];

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        result.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
  }
  result.push(current);
  return result;
}

export function parseCSV(csvText: string): ImportResult {
  const rows: ParsedRow[] = [];
  const errors: { line: number; message: string }[] = [];
  const lines = csvText.split(/\r?\n/);
  let headerFound = false;

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const raw = lines[i].trim();

    // Skip empty lines and comments
    if (!raw || raw.startsWith('#')) continue;

    // Skip header row
    if (!headerFound && raw.toLowerCase().startsWith('date,')) {
      headerFound = true;
      continue;
    }

    if (!headerFound) continue;

    const cols = parseCSVLine(raw);
    if (cols.length < 6) {
      errors.push({ line: lineNum, message: `컬럼 수 부족 (${cols.length}/11)` });
      continue;
    }

    const [date, type, amountStr, currency, category, paymentMethod,
      accountName, cardName, loanName, installmentId, ...memoParts] = cols;

    // Validate date
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      errors.push({ line: lineNum, message: `잘못된 날짜: ${date}` });
      continue;
    }

    // Validate type
    if (type !== 'expense' && type !== 'income') {
      errors.push({ line: lineNum, message: `잘못된 타입: ${type}` });
      continue;
    }

    // Validate amount
    const amount = Number(amountStr);
    if (isNaN(amount) || amount <= 0) {
      errors.push({ line: lineNum, message: `잘못된 금액: ${amountStr}` });
      continue;
    }

    // Validate currency
    if (currency !== 'KRW' && currency !== 'SATS') {
      errors.push({ line: lineNum, message: `잘못된 통화: ${currency}` });
      continue;
    }

    if (!category) {
      errors.push({ line: lineNum, message: '카테고리 누락' });
      continue;
    }

    const validMethods = ['cash', 'card', 'bank', 'lightning', 'onchain'];
    if (!validMethods.includes(paymentMethod)) {
      errors.push({ line: lineNum, message: `잘못된 결제수단: ${paymentMethod}` });
      continue;
    }

    rows.push({
      date,
      type: type as 'expense' | 'income',
      amount,
      currency: currency as 'KRW' | 'SATS',
      category,
      paymentMethod,
      accountName: accountName || null,
      cardName: cardName || null,
      loanName: loanName || null,
      installmentId: installmentId || null,
      memo: memoParts.join(',').trim() || null,
    });
  }

  if (__DEV__) {
    console.log(`[CSV Import] Parsed ${rows.length} rows, ${errors.length} errors`);
  }

  return { rows, errors };
}

type AddExpenseFn = (
  expense: Omit<Expense, 'id' | 'type' | 'createdAt' | 'updatedAt' | 'btcKrwAtTime' | 'satsEquivalent' | 'needsPriceSync'>,
  overrideBtcKrw?: number | null
) => Promise<string>;

type AddIncomeFn = (
  income: Omit<Income, 'id' | 'type' | 'createdAt' | 'updatedAt' | 'btcKrwAtTime' | 'satsEquivalent' | 'needsPriceSync'>,
  overrideBtcKrw?: number | null
) => Promise<string>;

export async function executeImport(
  rows: ParsedRow[],
  assets: Asset[],
  cards: Card[],
  loans: Loan[],
  installments: Installment[],
  encryptionKey: string,
  btcKrw: number | undefined,
  addExpense: AddExpenseFn,
  addIncome: AddIncomeFn
): Promise<{ imported: number; skipped: number }> {
  let imported = 0;
  let skipped = 0;

  // Build lookup maps
  const assetByName = new Map(assets.map((a) => [a.name, a.id]));
  const cardByName = new Map(cards.map((c) => [c.name, c.id]));
  const loanByName = new Map(loans.map((l) => [l.name, l.id]));
  const installmentById = new Set(installments.map((i) => i.id));

  for (const row of rows) {
    try {
      // Resolve linked IDs
      let linkedAssetId: string | null = null;
      let cardId: string | null = null;
      let linkedLoanId: string | null = null;
      let resolvedInstallmentId: string | null = null;

      if (row.accountName) {
        const id = assetByName.get(row.accountName);
        if (!id) {
          if (__DEV__) console.log(`[CSV Import] Asset not found: ${row.accountName}`);
          skipped++;
          continue;
        }
        linkedAssetId = id;
      }

      if (row.cardName) {
        const id = cardByName.get(row.cardName);
        if (!id) {
          if (__DEV__) console.log(`[CSV Import] Card not found: ${row.cardName}`);
          skipped++;
          continue;
        }
        cardId = id;
      }

      if (row.loanName) {
        const id = loanByName.get(row.loanName);
        if (!id) {
          if (__DEV__) console.log(`[CSV Import] Loan not found: ${row.loanName}`);
          skipped++;
          continue;
        }
        linkedLoanId = id;
      }

      if (row.installmentId) {
        if (!installmentById.has(row.installmentId)) {
          if (__DEV__) console.log(`[CSV Import] Installment not found: ${row.installmentId}`);
          skipped++;
          continue;
        }
        resolvedInstallmentId = row.installmentId;
      }

      if (row.type === 'expense') {
        await addExpense(
          {
            date: row.date,
            amount: row.amount,
            currency: row.currency,
            category: row.category,
            paymentMethod: row.paymentMethod as Expense['paymentMethod'],
            cardId,
            installmentId: resolvedInstallmentId,
            installmentMonths: null,
            isInterestFree: null,
            memo: row.memo,
            linkedAssetId,
            linkedLoanId,
          },
          btcKrw
        );
      } else {
        await addIncome(
          {
            date: row.date,
            amount: row.amount,
            currency: row.currency,
            category: row.category,
            source: null,
            memo: row.memo,
            linkedAssetId,
          },
          btcKrw
        );
      }

      imported++;
    } catch (error) {
      if (__DEV__) console.log(`[CSV Import] Error importing row:`, error);
      skipped++;
    }
  }

  if (__DEV__) {
    console.log(`[CSV Import] Done: ${imported} imported, ${skipped} skipped`);
  }

  return { imported, skipped };
}
