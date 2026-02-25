import { createClient } from '@supabase/supabase-js';
import { SUPABASE_CONFIG } from '../constants/supabase';
import { CONFIG } from '../constants/config';
import type { SubscriptionTier, SubscriptionPrice, DiscountCode, PriceCalculation } from '../types/subscription';

// Supabase 클라이언트 생성
export const supabase = createClient(
  SUPABASE_CONFIG.URL,
  SUPABASE_CONFIG.ANON_KEY
);

// 타입 정의
export interface User {
  id: string;
  linking_key: string;
  created_at: string;
}

export interface Subscription {
  id: string;
  user_id: string;
  status: 'active' | 'expired' | 'cancelled';
  tier: SubscriptionTier;
  is_lifetime: boolean;
  started_at: string | null;
  expires_at: string | null; // null = lifetime
  created_at: string;
}

export interface Payment {
  id: string;
  user_id: string;
  amount_sats: number;
  tier: SubscriptionTier;
  original_price_sats: number | null;
  discount_code_id: string | null;
  discount_amount_sats: number;
  lightning_invoice: string | null;
  payment_hash: string | null;
  status: 'pending' | 'paid' | 'expired';
  created_at: string;
  paid_at: string | null;
}

// ============================================================
// 구독 가격 조회
// ============================================================

/** DB에서 티어별 가격 정보 조회 (폴백: config.ts 상수)
 *  가격은 monthly의 price_sats × 각 티어의 base_multiplier로 계산됨
 *  → monthly 가격만 바꾸면 전체 가격이 연동됨
 */
export async function getSubscriptionPrices(): Promise<SubscriptionPrice[]> {
  const fallbackMultipliers: Record<string, number> = { monthly: 1, annual: 10, lifetime: 60 };

  try {
    const { data, error } = await supabase
      .from('subscription_prices')
      .select('*')
      .eq('is_active', true)
      .order('base_multiplier', { ascending: true });

    if (error || !data || data.length === 0) {
      // 폴백: config.ts 상수에서 가져오기
      return Object.entries(CONFIG.SUBSCRIPTION_TIERS).map(([tier, info]) => ({
        id: tier,
        tier: tier as SubscriptionTier,
        price_sats: info.price,
        duration_days: info.durationDays,
        max_quantity: tier === 'lifetime' ? 50 : -1,
        current_sold: 0,
        is_active: true,
        base_multiplier: fallbackMultipliers[tier] ?? 1,
      }));
    }

    // monthly의 price_sats를 기준 가격으로 사용
    const monthlyTier = data.find(p => p.tier === 'monthly');
    const basePrice = monthlyTier?.price_sats ?? CONFIG.SUBSCRIPTION_TIERS.monthly.price;

    // 각 티어의 실제 가격 = basePrice × base_multiplier
    return data.map(p => ({
      ...p,
      base_multiplier: p.base_multiplier ?? fallbackMultipliers[p.tier] ?? 1,
      price_sats: basePrice * (p.base_multiplier ?? fallbackMultipliers[p.tier] ?? 1),
    }));
  } catch {
    return Object.entries(CONFIG.SUBSCRIPTION_TIERS).map(([tier, info]) => ({
      id: tier,
      tier: tier as SubscriptionTier,
      price_sats: info.price,
      duration_days: info.durationDays,
      max_quantity: tier === 'lifetime' ? 50 : -1,
      current_sold: 0,
      is_active: true,
      base_multiplier: fallbackMultipliers[tier] ?? 1,
    }));
  }
}

/** 특정 티어 가격 조회 */
export async function getTierPrice(tier: SubscriptionTier): Promise<SubscriptionPrice | null> {
  const prices = await getSubscriptionPrices();
  return prices.find(p => p.tier === tier) || null;
}

// ============================================================
// 할인코드
// ============================================================

/** 할인코드 검증 */
export async function validateDiscountCode(
  code: string,
  tier: SubscriptionTier
): Promise<{ valid: boolean; discount?: DiscountCode; reason?: string }> {
  try {
    const { data, error } = await supabase
      .from('discount_codes')
      .select('*')
      .ilike('code', code)
      .eq('is_active', true)
      .single();

    if (error || !data) {
      return { valid: false, reason: '존재하지 않는 할인코드입니다' };
    }

    if (new Date(data.valid_until) < new Date()) {
      return { valid: false, reason: '만료된 할인코드입니다' };
    }

    if (new Date(data.valid_from) > new Date()) {
      return { valid: false, reason: '아직 사용할 수 없는 할인코드입니다' };
    }

    if (data.max_uses !== -1 && data.current_uses >= data.max_uses) {
      return { valid: false, reason: '사용 한도가 초과된 할인코드입니다' };
    }

    if (!data.applicable_tiers.includes(tier)) {
      return { valid: false, reason: '이 구독 플랜에 적용할 수 없는 할인코드입니다' };
    }

    return { valid: true, discount: data };
  } catch {
    return { valid: false, reason: '할인코드 확인 중 오류가 발생했습니다' };
  }
}

/** 최종 가격 계산 */
export async function calculatePrice(
  tier: SubscriptionTier,
  discountCode?: string
): Promise<PriceCalculation> {
  const tierPrice = await getTierPrice(tier);
  const basePrice = tierPrice?.price_sats ?? CONFIG.SUBSCRIPTION_TIERS[tier].price;
  const durationDays = tierPrice?.duration_days ?? CONFIG.SUBSCRIPTION_TIERS[tier].durationDays;
  const isSoldOut = tierPrice
    ? tierPrice.max_quantity !== -1 && tierPrice.current_sold >= tierPrice.max_quantity
    : false;

  let discountAmount = 0;
  let discountData: DiscountCode | null = null;

  if (discountCode) {
    const result = await validateDiscountCode(discountCode, tier);
    if (result.valid && result.discount) {
      discountData = result.discount;
      if (result.discount.discount_type === 'percent') {
        discountAmount = Math.floor(basePrice * result.discount.discount_value / 100);
      } else {
        discountAmount = Math.min(result.discount.discount_value, basePrice - 1);
      }
    }
  }

  return {
    tier,
    originalPrice: basePrice,
    discountAmount,
    finalPrice: Math.max(basePrice - discountAmount, 1), // 최소 1 sat
    durationDays,
    discountCode: discountData,
    isSoldOut,
  };
}

// ============================================================
// 구독 상태 조회
// ============================================================

export async function getSubscription(userId: string): Promise<Subscription | null> {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error) {
    return null;
  }

  return data;
}

export async function isSubscriptionActive(userId: string): Promise<boolean> {
  const subscription = await getSubscription(userId);
  if (!subscription) return false;

  if (subscription.status !== 'active') return false;

  // lifetime 구독은 만료 없음
  if (subscription.is_lifetime) return true;

  if (subscription.expires_at) {
    return new Date(subscription.expires_at) > new Date();
  }

  return true;
}

// ============================================================
// 결제 생성
// ============================================================

export async function createPayment(
  userId: string,
  amountSats: number,
  tier: SubscriptionTier = 'monthly',
  originalPrice?: number,
  discountCodeId?: string,
  discountAmount?: number
): Promise<Payment | null> {
  const { data, error } = await supabase
    .from('payments')
    .insert({
      user_id: userId,
      amount_sats: amountSats,
      tier,
      original_price_sats: originalPrice ?? amountSats,
      discount_code_id: discountCodeId ?? null,
      discount_amount_sats: discountAmount ?? 0,
      status: 'pending',
    })
    .select()
    .single();

  if (error) {
    console.error('결제 생성 실패:', error);
    return null;
  }

  return data;
}

// 결제 상태 업데이트
export async function updatePaymentStatus(
  paymentId: string,
  status: 'paid' | 'expired',
  paymentHash?: string
): Promise<boolean> {
  const updateData: Record<string, unknown> = { status };
  if (status === 'paid') {
    updateData.paid_at = new Date().toISOString();
    if (paymentHash) {
      updateData.payment_hash = paymentHash;
    }
  }

  const { error } = await supabase
    .from('payments')
    .update(updateData)
    .eq('id', paymentId);

  return !error;
}

// ============================================================
// 구독 활성화 (v2: tier 지원)
// ============================================================

export async function activateSubscription(
  userId: string,
  tier: SubscriptionTier = 'monthly',
  discountCodeId?: string
): Promise<Subscription | null> {
  const now = new Date();

  // 티어별 duration 조회
  const tierPrice = await getTierPrice(tier);
  const durationDays = tierPrice?.duration_days ?? CONFIG.SUBSCRIPTION_TIERS[tier].durationDays;
  const isLifetime = durationDays === -1;

  // 수량 제한 체크 (lifetime 등)
  if (tierPrice && tierPrice.max_quantity !== -1) {
    const { data: result } = await supabase.rpc('increment_tier_sold', { p_tier: tier });
    if (!result) {
      console.error('구독 티어 매진:', tier);
      return null;
    }
  }

  // 할인코드 사용 처리
  if (discountCodeId) {
    // discount code의 current_uses는 이미 edge function 또는 validateDiscountCode에서 증가됨
    // 여기서는 별도 처리 불필요 (RPC 사용 시 여기서 호출)
  }

  // 기존 활성 구독 확인
  const existing = await getSubscription(userId);

  if (existing && existing.status === 'active') {
    // lifetime 업그레이드
    if (isLifetime) {
      const { data, error } = await supabase
        .from('subscriptions')
        .update({
          tier: 'lifetime',
          is_lifetime: true,
          expires_at: null, // 만료 없음
        })
        .eq('id', existing.id)
        .select()
        .single();

      return error ? null : data;
    }

    // 기존 구독이 아직 유효하면 만료일 연장
    if (existing.expires_at) {
      const currentExpiry = new Date(existing.expires_at);
      if (currentExpiry > now) {
        const newExpiry = new Date(currentExpiry);
        newExpiry.setDate(newExpiry.getDate() + durationDays);

        const { data, error } = await supabase
          .from('subscriptions')
          .update({
            tier,
            expires_at: newExpiry.toISOString(),
          })
          .eq('id', existing.id)
          .select()
          .single();

        return error ? null : data;
      }
    }
  }

  // 새 구독 생성
  const expiresAt = isLifetime ? null : new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('subscriptions')
    .insert({
      user_id: userId,
      status: 'active',
      tier,
      is_lifetime: isLifetime,
      started_at: now.toISOString(),
      expires_at: expiresAt,
    })
    .select()
    .single();

  if (error) {
    console.error('구독 활성화 실패:', error);
    return null;
  }

  return data;
}
