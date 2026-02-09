import { CardCompanyBillingRules } from '../constants/billingPeriods';

export type RegionId = 'kr' | 'us' | 'ar' | 'jp';

export interface BankInfo {
  id: string;
  nameKey: string; // i18n key e.g. 'banks.kb'
}

export interface CardCompanyInfo {
  id: string;
  nameKey: string; // i18n key e.g. 'cardCompanies.samsung'
  color: string;
}

export interface CategoryInfo {
  id: string;
  nameKey: string; // i18n key e.g. 'categories.food'
  icon: string;
  color: string;
}

export interface RegionConfig {
  id: RegionId;
  currency: string; // 'KRW', 'USD', 'ARS', 'JPY'
  currencySymbol: string; // '₩', '$', '$', '¥'
  locale: string; // 'ko-KR', 'en-US', 'es-AR', 'ja-JP'

  // Financial institutions
  banks: BankInfo[];
  cardCompanies: CardCompanyInfo[];

  // Billing period rules (card company billing cycles)
  billingRules: Record<string, CardCompanyBillingRules>;

  // Price API source
  priceSource: 'upbit' | 'okx';

  // Categories
  expenseCategories: CategoryInfo[];
  incomeCategories: CategoryInfo[];
}
