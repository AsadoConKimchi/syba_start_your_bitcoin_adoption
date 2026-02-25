/**
 * 앱 설정 서비스
 * Supabase subscription_prices 테이블에서 가격을 가져옴
 * (구 app_config 테이블 대신 subscription_prices 단일 소스 사용)
 */

import { supabase } from './supabase';
import { CONFIG } from '../constants/config';

// 캐시 (앱 실행 중 반복 요청 방지)
let cachedSubscriptionPrice: number | null = null;
let cacheTimestamp: number = 0;
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5분

/**
 * 구독 가격 조회 — subscription_prices 테이블의 monthly 티어 가격 반환
 * 모든 가격의 단일 소스: subscription_prices 테이블
 */
export async function getSubscriptionPriceSats(): Promise<number> {
  // 캐시 확인
  if (cachedSubscriptionPrice && Date.now() - cacheTimestamp < CACHE_DURATION_MS) {
    return cachedSubscriptionPrice;
  }

  try {
    const { data, error } = await supabase
      .from('subscription_prices')
      .select('price_sats')
      .eq('tier', 'monthly')
      .eq('is_active', true)
      .single();

    if (error || !data) {
      console.log('[AppConfig] subscription_prices 조회 실패, 기본값 사용:', error?.message);
      return CONFIG.FALLBACK_MONTHLY_PRICE_SATS; // 폴백
    }

    const price = data.price_sats;
    if (!price || price <= 0) {
      console.log('[AppConfig] 잘못된 가격 값, 기본값 사용');
      return CONFIG.FALLBACK_MONTHLY_PRICE_SATS; // 폴백
    }

    // 캐시 업데이트
    cachedSubscriptionPrice = price;
    cacheTimestamp = Date.now();

    console.log('[AppConfig] 구독 가격 (monthly):', price, 'sats');
    return price;
  } catch (error) {
    console.error('[AppConfig] 에러:', error);
    return CONFIG.FALLBACK_MONTHLY_PRICE_SATS; // 폴백
  }
}

/**
 * 캐시 초기화 (설정 변경 후 즉시 반영 필요 시)
 */
export function clearConfigCache(): void {
  cachedSubscriptionPrice = null;
  cacheTimestamp = 0;
}
