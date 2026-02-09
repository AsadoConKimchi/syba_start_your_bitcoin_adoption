import { RegionConfig } from '../types';
import { CARD_COMPANY_BILLING_RULES } from '../../constants/billingPeriods';

const krRegion: RegionConfig = {
  id: 'kr',
  currency: 'KRW',
  currencySymbol: '₩',
  locale: 'ko-KR',

  banks: [
    { id: 'kb', nameKey: 'banks.kb' },
    { id: 'shinhan', nameKey: 'banks.shinhan' },
    { id: 'woori', nameKey: 'banks.woori' },
    { id: 'hana', nameKey: 'banks.hana' },
    { id: 'nh', nameKey: 'banks.nh' },
    { id: 'ibk', nameKey: 'banks.ibk' },
    { id: 'sc', nameKey: 'banks.sc' },
    { id: 'citi', nameKey: 'banks.citi' },
    { id: 'kdb', nameKey: 'banks.kdb' },
    { id: 'suhyup', nameKey: 'banks.suhyup' },
    { id: 'kfcc', nameKey: 'banks.kfcc' },
    { id: 'cu', nameKey: 'banks.cu' },
    { id: 'post', nameKey: 'banks.post' },
    { id: 'kakao', nameKey: 'banks.kakao' },
    { id: 'toss', nameKey: 'banks.toss' },
    { id: 'kbank', nameKey: 'banks.kbank' },
    { id: 'etc', nameKey: 'banks.etc' },
  ],

  cardCompanies: [
    { id: 'samsung', nameKey: 'cardCompanies.samsung', color: '#1428A0' },
    { id: 'shinhan', nameKey: 'cardCompanies.shinhan', color: '#E60012' },
    { id: 'kb', nameKey: 'cardCompanies.kb', color: '#FFBC00' },
    { id: 'hyundai', nameKey: 'cardCompanies.hyundai', color: '#000000' },
    { id: 'lotte', nameKey: 'cardCompanies.lotte', color: '#E60012' },
    { id: 'woori', nameKey: 'cardCompanies.woori', color: '#0066B3' },
    { id: 'hana', nameKey: 'cardCompanies.hana', color: '#009490' },
    { id: 'nh', nameKey: 'cardCompanies.nh', color: '#00A651' },
    { id: 'bc', nameKey: 'cardCompanies.bc', color: '#F15A22' },
    { id: 'kakao', nameKey: 'cardCompanies.kakao', color: '#FFCD00' },
    { id: 'toss', nameKey: 'cardCompanies.toss', color: '#0064FF' },
    { id: 'kbank', nameKey: 'cardCompanies.kbank', color: '#3182F6' },
    { id: 'etc', nameKey: 'cardCompanies.etc', color: '#9CA3AF' },
  ],

  billingRules: CARD_COMPANY_BILLING_RULES,

  priceSource: 'upbit',

  expenseCategories: [
    { id: 'food', nameKey: 'categories.food', icon: '🍚', color: '#FF6B6B' },
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

export default krRegion;
