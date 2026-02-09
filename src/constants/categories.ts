import i18n from '../i18n';

export const DEFAULT_EXPENSE_CATEGORIES = [
  { id: 'food', name: '식비', icon: '🍚', color: '#FF6B6B' },
  { id: 'transport', name: '교통', icon: '🚌', color: '#4ECDC4' },
  { id: 'shopping', name: '쇼핑', icon: '🛍️', color: '#A78BFA' },
  { id: 'living', name: '생활용품', icon: '🧴', color: '#F472B6' },
  { id: 'medical', name: '의료', icon: '🏥', color: '#60A5FA' },
  { id: 'education', name: '교육', icon: '📚', color: '#34D399' },
  { id: 'leisure', name: '여가·문화', icon: '🎮', color: '#FBBF24' },
  { id: 'telecom', name: '통신', icon: '📱', color: '#818CF8' },
  { id: 'subscription', name: '구독료', icon: '🔄', color: '#F87171' },
  { id: 'finance', name: '금융', icon: '💰', color: '#2DD4BF' },
  { id: 'etc', name: '기타', icon: '···', color: '#9CA3AF' },
] as const;

export const DEFAULT_INCOME_CATEGORIES = [
  { id: 'salary', name: '급여', icon: '💼', color: '#22C55E' },
  { id: 'side', name: '부수입', icon: '💵', color: '#10B981' },
  { id: 'interest', name: '이자', icon: '🏦', color: '#14B8A6' },
  { id: 'bitcoin', name: '비트코인', icon: '₿', color: '#F7931A' },
  { id: 'etc', name: '기타', icon: '···', color: '#9CA3AF' },
] as const;

export type ExpenseCategoryId = typeof DEFAULT_EXPENSE_CATEGORIES[number]['id'];
export type IncomeCategoryId = typeof DEFAULT_INCOME_CATEGORIES[number]['id'];

export function getCategoryName(id: string, type: 'expense' | 'income' = 'expense'): string {
  return i18n.t(`categories.${id}`, { defaultValue: id });
}
