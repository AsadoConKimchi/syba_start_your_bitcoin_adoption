export type SubscriptionStatus = 'none' | 'active' | 'grace_period' | 'expired';

export type SubscriptionTier = 'monthly' | 'annual' | 'lifetime';

export interface LocalSubscription {
  linkingKey: string | null;
  status: SubscriptionStatus;
  currentPeriodEnd: string | null;
  lastCheckedAt: string;
}

export interface ServerSubscription {
  id: string;
  user_id: string;
  status: SubscriptionStatus;
  tier: SubscriptionTier;
  is_lifetime: boolean;
  started_at: string;
  expires_at: string | null; // null = lifetime
  created_at: string;
}

export interface ServerPayment {
  id: string;
  user_id: string;
  amount_sats: number;
  tier: SubscriptionTier;
  original_price_sats: number | null;
  discount_code_id: string | null;
  discount_amount_sats: number;
  lightning_invoice: string;
  payment_hash: string | null;
  status: 'pending' | 'paid' | 'expired';
  paid_at: string | null;
  created_at: string;
}

export interface SubscriptionPrice {
  id: string;
  tier: SubscriptionTier;
  price_sats: number;         // 실제 표시/결제 가격 (= monthly price × base_multiplier)
  duration_days: number;      // -1 = lifetime
  max_quantity: number;       // -1 = unlimited
  current_sold: number;
  is_active: boolean;
  base_multiplier: number;    // monthly 가격 대비 배수 (monthly=1, annual=10, lifetime=60)
}

export interface DiscountCode {
  id: string;
  code: string;
  discount_type: 'percent' | 'fixed';
  discount_value: number;
  max_uses: number;
  current_uses: number;
  valid_from: string;
  valid_until: string;
  applicable_tiers: SubscriptionTier[];
  is_active: boolean;
}

export interface PriceCalculation {
  tier: SubscriptionTier;
  originalPrice: number;
  discountAmount: number;
  finalPrice: number;
  durationDays: number;
  discountCode: DiscountCode | null;
  isSoldOut: boolean;
}
