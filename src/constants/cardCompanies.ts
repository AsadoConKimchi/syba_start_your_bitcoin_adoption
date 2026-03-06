import i18n from '../i18n';
import { getCurrentRegion } from '../regions';

// Legacy Korean card companies (kept for type backward compatibility)
export const CARD_COMPANIES = [
  { id: 'samsung', name: '삼성카드', color: '#1428A0' },
  { id: 'shinhan', name: '신한카드', color: '#E60012' },
  { id: 'kb', name: 'KB국민카드', color: '#FFBC00' },
  { id: 'hyundai', name: '현대카드', color: '#000000' },
  { id: 'lotte', name: '롯데카드', color: '#E60012' },
  { id: 'woori', name: '우리카드', color: '#0066B3' },
  { id: 'hana', name: '하나카드', color: '#009490' },
  { id: 'nh', name: 'NH농협카드', color: '#00A651' },
  { id: 'bc', name: 'BC카드', color: '#F15A22' },
  { id: 'kakao', name: '카카오뱅크', color: '#FFCD00' },
  { id: 'toss', name: '토스뱅크', color: '#0064FF' },
  { id: 'kbank', name: '케이뱅크', color: '#3182F6' },
  { id: 'etc', name: '기타', color: '#9CA3AF' },
] as const;

export type CardCompanyId = string;

export function getCardCompanyById(id: string) {
  // Search in current region first, then fall back to all regions
  const region = getCurrentRegion();
  return region.cardCompanies.find(c => c.id === id);
}

export function getCardCompanyColor(id: string): string {
  const region = getCurrentRegion();
  const found = region.cardCompanies.find(c => c.id === id);
  if (found) return found.color;
  // Fallback: search legacy Korean data
  const legacy = CARD_COMPANIES.find(c => c.id === id);
  return legacy?.color ?? '#9CA3AF';
}

export function getCardCompanyName(id: string): string {
  return i18n.t(`cardCompanies.${id}`, { defaultValue: id });
}

/**
 * Card company default installment interest rates (annual %, as of 2025)
 * Rates by installment months — used as fallback when user doesn't enter a rate.
 * Source: publicly announced rates from each card company (updated yearly)
 */
const DEFAULT_INSTALLMENT_RATES: Record<string, Record<number, number>> = {
  samsung:  { 2: 14.5, 3: 14.5, 6: 15.0, 10: 15.5, 12: 16.0 },
  shinhan:  { 2: 14.0, 3: 14.5, 6: 15.0, 10: 15.5, 12: 16.0 },
  kb:       { 2: 14.0, 3: 14.5, 6: 15.0, 10: 15.5, 12: 16.0 },
  hyundai:  { 2: 13.5, 3: 14.0, 6: 14.5, 10: 15.0, 12: 15.5 },
  lotte:    { 2: 14.5, 3: 15.0, 6: 15.5, 10: 16.0, 12: 16.5 },
  woori:    { 2: 14.0, 3: 14.5, 6: 15.0, 10: 15.5, 12: 16.0 },
  hana:     { 2: 14.0, 3: 14.5, 6: 15.0, 10: 15.5, 12: 16.0 },
  nh:       { 2: 13.5, 3: 14.0, 6: 14.5, 10: 15.0, 12: 15.5 },
  bc:       { 2: 14.0, 3: 14.5, 6: 15.0, 10: 15.5, 12: 16.0 },
};
const FALLBACK_RATE = 15.0;

// Remote rates fetched from Supabase (overrides local defaults)
let _remoteRates: Record<string, Record<number, number>> | null = null;
let _remoteRatesFetchedAt = 0;
const REMOTE_RATES_CACHE_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Fetch installment rates from Supabase and cache locally.
 * Called on app startup; falls back to bundled defaults if unavailable.
 */
export async function fetchRemoteInstallmentRates(): Promise<void> {
  // Skip if recently fetched
  if (_remoteRates && Date.now() - _remoteRatesFetchedAt < REMOTE_RATES_CACHE_MS) return;

  try {
    const { supabase } = await import('../services/supabase');
    if (!supabase) return;

    const { data, error } = await supabase
      .from('installment_rates')
      .select('company_id, months, rate')
      .eq('is_active', true);

    if (error || !data || data.length === 0) return;

    const rates: Record<string, Record<number, number>> = {};
    for (const row of data) {
      if (!rates[row.company_id]) rates[row.company_id] = {};
      rates[row.company_id][row.months] = row.rate;
    }

    _remoteRates = rates;
    _remoteRatesFetchedAt = Date.now();
  } catch (error) {
    if (__DEV__) console.warn('[InstallmentRates] Remote fetch failed, using defaults:', error);
  }
}

/**
 * Get default installment rate for a card company and number of months.
 * Uses remote rates if available, otherwise falls back to bundled defaults.
 */
export function getDefaultInstallmentRate(companyId: string, months: number): number {
  const source = _remoteRates ?? DEFAULT_INSTALLMENT_RATES;
  const rates = source[companyId];
  if (!rates) return FALLBACK_RATE;

  // Exact match
  if (rates[months] !== undefined) return rates[months];

  // Find closest tier (next higher month count)
  const tiers = Object.keys(rates).map(Number).sort((a, b) => a - b);
  for (const tier of tiers) {
    if (tier >= months) return rates[tier];
  }

  // Beyond max tier, use highest available rate
  return rates[tiers[tiers.length - 1]];
}
