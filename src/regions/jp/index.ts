import { RegionConfig } from '../types';

const jpRegion: RegionConfig = {
  id: 'jp',
  currency: 'JPY',
  currencySymbol: '¥',
  locale: 'ja-JP',

  banks: [
    { id: 'mufg', nameKey: 'banks.mufg' },
    { id: 'smbc', nameKey: 'banks.smbc' },
    { id: 'mizuho', nameKey: 'banks.mizuho' },
    { id: 'resona', nameKey: 'banks.resona' },
    { id: 'yucho', nameKey: 'banks.yucho' },
    { id: 'rakuten', nameKey: 'banks.rakuten' },
    { id: 'aeon', nameKey: 'banks.aeon' },
    { id: 'sbi', nameKey: 'banks.sbi' },
    { id: 'paypay', nameKey: 'banks.paypay' },
    { id: 'etc', nameKey: 'banks.etc' },
  ],

  cardCompanies: [
    { id: 'visa', nameKey: 'cardCompanies.visa', color: '#1A1F71' },
    { id: 'mastercard', nameKey: 'cardCompanies.mastercard', color: '#EB001B' },
    { id: 'jcb', nameKey: 'cardCompanies.jcb', color: '#0B4EA2' },
    { id: 'amex', nameKey: 'cardCompanies.amex', color: '#006FCF' },
    { id: 'diners', nameKey: 'cardCompanies.diners', color: '#004B87' },
    { id: 'etc', nameKey: 'cardCompanies.etc', color: '#9CA3AF' },
  ],

  billingRules: {},

  priceSource: 'okx',

  expenseCategories: [
    { id: 'food', nameKey: 'categories.food', icon: '🍱', color: '#FF6B6B' },
    { id: 'transport', nameKey: 'categories.transport', icon: '🚃', color: '#4ECDC4' },
    { id: 'shopping', nameKey: 'categories.shopping', icon: '🛍️', color: '#A78BFA' },
    { id: 'living', nameKey: 'categories.living', icon: '🧴', color: '#F472B6' },
    { id: 'medical', nameKey: 'categories.medical', icon: '🏥', color: '#60A5FA' },
    { id: 'education', nameKey: 'categories.education', icon: '📚', color: '#34D399' },
    { id: 'leisure', nameKey: 'categories.leisure', icon: '🎮', color: '#FBBF24' },
    { id: 'telecom', nameKey: 'categories.telecom', icon: '📱', color: '#818CF8' },
    { id: 'subscription', nameKey: 'categories.subscription', icon: '🔄', color: '#F87171' },
    { id: 'finance', nameKey: 'categories.finance', icon: '💰', color: '#2DD4BF' },
    { id: 'etc', nameKey: 'categories.etc', icon: '···', color: '#9CA3AF' },
  ],

  incomeCategories: [
    { id: 'salary', nameKey: 'categories.salary', icon: '💼', color: '#22C55E' },
    { id: 'side', nameKey: 'categories.sideIncome', icon: '💵', color: '#10B981' },
    { id: 'interest', nameKey: 'categories.interest', icon: '🏦', color: '#14B8A6' },
    { id: 'bitcoin', nameKey: 'categories.bitcoinIncome', icon: '₿', color: '#F7931A' },
    { id: 'etc', nameKey: 'categories.etc', icon: '···', color: '#9CA3AF' },
  ],
};

export default jpRegion;
