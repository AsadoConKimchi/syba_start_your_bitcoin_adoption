import { RegionConfig } from '../types';

const arRegion: RegionConfig = {
  id: 'ar',
  currency: 'ARS',
  currencySymbol: '$',
  locale: 'es-AR',

  banks: [
    { id: 'nacion', nameKey: 'banks.nacion' },
    { id: 'provincia', nameKey: 'banks.provincia' },
    { id: 'galicia', nameKey: 'banks.galicia' },
    { id: 'santander', nameKey: 'banks.santander' },
    { id: 'bbva', nameKey: 'banks.bbva' },
    { id: 'macro', nameKey: 'banks.macro' },
    { id: 'hsbc', nameKey: 'banks.hsbc' },
    { id: 'brubank', nameKey: 'banks.brubank' },
    { id: 'uala', nameKey: 'banks.uala' },
    { id: 'mercadopago', nameKey: 'banks.mercadopago' },
    { id: 'etc', nameKey: 'banks.etc' },
  ],

  cardCompanies: [
    { id: 'visa', nameKey: 'cardCompanies.visa', color: '#1A1F71' },
    { id: 'mastercard', nameKey: 'cardCompanies.mastercard', color: '#EB001B' },
    { id: 'amex', nameKey: 'cardCompanies.amex', color: '#006FCF' },
    { id: 'cabal', nameKey: 'cardCompanies.cabal', color: '#00529B' },
    { id: 'naranja', nameKey: 'cardCompanies.naranja', color: '#FF6600' },
    { id: 'etc', nameKey: 'cardCompanies.etc', color: '#9CA3AF' },
  ],

  billingRules: {},

  priceSource: 'okx',

  expenseCategories: [
    { id: 'food', nameKey: 'categories.food', icon: '🥩', color: '#FF6B6B' },
    { id: 'transport', nameKey: 'categories.transport', icon: '🚌', color: '#4ECDC4' },
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

export default arRegion;
