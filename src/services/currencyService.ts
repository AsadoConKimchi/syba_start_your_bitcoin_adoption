import { getCurrentRegion } from '../regions';
import { fetchCurrentBtcKrw } from './api/upbit';
import { fetchBtcUsdt } from './api/okx';
import i18n from '../i18n';

/**
 * Get the BTC price in the current region's local currency.
 * - KR: Uses Upbit (BTC/KRW)
 * - US/AR/JP: Uses OKX (BTC/USDT) as a base
 *
 * For US, USDT ≈ USD so we use it directly.
 * For AR/JP, a more precise implementation would need ARS/USD or JPY/USD rates.
 * For now, we use BTC/USDT as a reasonable approximation for non-KR regions.
 */
export async function fetchBtcLocalPrice(): Promise<number> {
  const region = getCurrentRegion();

  if (region.priceSource === 'upbit') {
    return fetchCurrentBtcKrw();
  }

  // For OKX-based regions, use BTC/USDT
  return fetchBtcUsdt();
}

/**
 * Format an amount in the current region's local currency.
 */
export function formatLocalCurrency(amount: number): string {
  const region = getCurrentRegion();

  return new Intl.NumberFormat(region.locale, {
    style: 'currency',
    currency: region.currency,
    maximumFractionDigits: region.currency === 'KRW' || region.currency === 'JPY' ? 0 : 2,
  }).format(amount);
}

/**
 * Format an amount in the current region's local currency (no symbol).
 */
export function formatLocalCurrencyPlain(amount: number): string {
  const region = getCurrentRegion();

  return new Intl.NumberFormat(region.locale, {
    maximumFractionDigits: region.currency === 'KRW' || region.currency === 'JPY' ? 0 : 2,
  }).format(amount);
}

/**
 * Get the currency symbol for the current region.
 */
export function getCurrencySymbol(): string {
  return getCurrentRegion().currencySymbol;
}

/**
 * Get the currency code for the current region.
 */
export function getCurrencyCode(): string {
  return getCurrentRegion().currency;
}

/**
 * Convert sats to local currency.
 */
export function satsToLocal(sats: number, btcLocalPrice: number): number {
  return (sats / 100_000_000) * btcLocalPrice;
}

/**
 * Convert local currency to sats.
 */
export function localToSats(amount: number, btcLocalPrice: number): number {
  if (btcLocalPrice <= 0) return 0;
  return Math.round((amount / btcLocalPrice) * 100_000_000);
}

/**
 * Format sats amount for display.
 */
export function formatSatsAmount(sats: number): string {
  const region = getCurrentRegion();
  return new Intl.NumberFormat(region.locale).format(sats) + ' sats';
}
