import { create } from 'zustand';
import {
  supabase,
  getSubscription,
  isSubscriptionActive,
  createPayment,
  updatePaymentStatus,
  activateSubscription,
  getSubscriptionPrices,
  calculatePrice,
  validateDiscountCode,
  Subscription,
  Payment,
} from '../services/supabase';
import {
  createLightningInvoice,
  checkPaymentStatus,
} from '../services/blinkProxy';
import {
  createLnurlAuthSession,
  checkAuthSession,
  getOrCreateUserByLinkingKey,
} from '../services/lnurlAuth';
import {
  requestNotificationPermissions,
  scheduleSubscriptionExpiryNotifications,
  cancelAllSubscriptionNotifications,
} from '../services/notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CONFIG } from '../constants/config';
import { getSecure, saveSecure } from '../utils/encryption';
import type { SubscriptionTier, SubscriptionPrice, PriceCalculation } from '../types/subscription';

const PENDING_INVOICE_KEY = 'SYBA_PENDING_INVOICE';

// 사용자 타입 (LNURL-auth 기반)
interface User {
  id: string;
  linking_key: string;
  created_at: string;
}

interface SubscriptionState {
  // 상태
  user: User | null;
  subscription: Subscription | null;
  isLoading: boolean;
  isSubscribed: boolean;
  pendingPayment: Payment | null;
  lightningInvoice: string | null;

  // LNURL-auth 상태
  authSessionId: string | null;
  authLnurl: string | null;
  authLnurlEncoded: string | null;
  authStatus: 'idle' | 'waiting' | 'authenticated' | 'error';

  // v2: 구독 티어
  availableTiers: SubscriptionPrice[];
  selectedTier: SubscriptionTier;
  discountCode: string;
  priceCalculation: PriceCalculation | null;
  isCalculatingPrice: boolean;
}

interface SubscriptionActions {
  // 초기화
  initialize: () => Promise<void>;

  // LNURL-auth 로그인
  startLnurlAuth: () => Promise<string | null>;
  checkLnurlAuthStatus: () => Promise<boolean>;
  cancelLnurlAuth: () => void;
  logout: () => Promise<void>;

  // 구독
  checkSubscription: () => Promise<boolean>;
  startPayment: () => Promise<string | null>;
  confirmPayment: () => Promise<boolean>;

  // 상태 업데이트
  refreshSubscription: () => Promise<void>;

  // v2: 티어 & 할인코드
  loadTierPrices: () => Promise<void>;
  selectTier: (tier: SubscriptionTier) => void;
  setDiscountCode: (code: string) => void;
  applyDiscountCode: () => Promise<{ valid: boolean; reason?: string }>;
  recalculatePrice: () => Promise<void>;
}

export const useSubscriptionStore = create<SubscriptionState & SubscriptionActions>((set, get) => ({
  // 초기 상태
  user: null,
  subscription: null,
  isLoading: true,
  isSubscribed: false,
  pendingPayment: null,
  lightningInvoice: null,
  authSessionId: null,
  authLnurl: null,
  authLnurlEncoded: null,
  authStatus: 'idle',

  // v2: 초기 상태
  availableTiers: [],
  selectedTier: 'monthly',
  discountCode: '',
  priceCalculation: null,
  isCalculatingPrice: false,

  // 초기화
  initialize: async () => {
    try {
      const savedUserId = await getSecure('SYBA_USER_ID');
      if (savedUserId) {
        const { data: user } = await supabase
          .from('users')
          .select('*')
          .eq('id', savedUserId)
          .single();

        if (user) {
          const subscription = await getSubscription(user.id);
          const isActive = subscription ? await isSubscriptionActive(user.id) : false;

          set({
            user,
            subscription,
            isSubscribed: isActive,
            isLoading: false,
          });

          // 활성 구독이 있으면 만료 알림 스케줄링 (lifetime 제외)
          if (isActive && subscription?.expires_at && !subscription.is_lifetime) {
            scheduleSubscriptionExpiryNotifications(new Date(subscription.expires_at));
          }

          // 미확인 인보이스 복구: 결제했는데 모달 닫힌 경우
          if (!isActive) {
            try {
              const saved = await AsyncStorage.getItem(PENDING_INVOICE_KEY);
              if (saved) {
                const { paymentId, invoice, paymentHash, tier } = JSON.parse(saved);
                if (__DEV__) { console.log('[Subscription] 미확인 인보이스 발견, 상태 확인...'); }
                const status = await checkPaymentStatus(invoice);
                if (status === 'PAID') {
                  if (__DEV__) { console.log('[Subscription] 미확인 결제 확인됨! 프리미엄 활성화'); }
                  await updatePaymentStatus(paymentId, 'paid', paymentHash);
                  const newSub = await activateSubscription(user.id, tier || 'monthly');
                  if (newSub) {
                    set({ subscription: newSub, isSubscribed: true });
                    if (newSub.expires_at && !newSub.is_lifetime) {
                      await requestNotificationPermissions();
                      await scheduleSubscriptionExpiryNotifications(new Date(newSub.expires_at));
                    }
                  }
                }
                await AsyncStorage.removeItem(PENDING_INVOICE_KEY);
              }
            } catch (e) {
              console.error('[Subscription] 미확인 인보이스 복구 실패:', e);
              await AsyncStorage.removeItem(PENDING_INVOICE_KEY);
            }
          }

          return;
        }
      }

      set({ isLoading: false });
    } catch (error) {
      console.error('구독 초기화 실패:', error);
      set({ isLoading: false });
    }
  },

  // LNURL-auth 시작
  startLnurlAuth: async () => {
    if (__DEV__) { console.log('[SubscriptionStore] startLnurlAuth 시작'); }
    try {
      set({ authStatus: 'waiting' });

      if (__DEV__) { console.log('[SubscriptionStore] createLnurlAuthSession 호출'); }
      const session = await createLnurlAuthSession();
      if (__DEV__) { console.log('[SubscriptionStore] createLnurlAuthSession 결과:', session ? 'success' : 'null'); }

      if (!session) {
        console.error('[SubscriptionStore] 세션 생성 실패');
        set({ authStatus: 'error' });
        return null;
      }

      if (__DEV__) { console.log('[SubscriptionStore] LNURL 생성 성공:', session.sessionId); }
      set({
        authSessionId: session.sessionId,
        authLnurl: session.lnurl,
        authLnurlEncoded: session.lnurlEncoded,
      });

      return session.lnurl;
    } catch (error) {
      console.error('[SubscriptionStore] LNURL-auth 시작 실패:', error);
      set({ authStatus: 'error' });
      return null;
    }
  },

  // LNURL-auth 상태 확인
  checkLnurlAuthStatus: async () => {
    const { authSessionId } = get();
    if (!authSessionId) return false;

    try {
      const session = await checkAuthSession(authSessionId);
      if (!session) return false;

      if (session.status === 'authenticated' && session.linking_key) {
        const user = await getOrCreateUserByLinkingKey(session.linking_key);
        if (!user) {
          set({ authStatus: 'error' });
          return false;
        }

        await saveSecure('SYBA_USER_ID', user.id);

        const subscription = await getSubscription(user.id);
        const isActive = subscription ? await isSubscriptionActive(user.id) : false;

        set({
          user,
          subscription,
          isSubscribed: isActive,
          authStatus: 'authenticated',
          authSessionId: null,
          authLnurl: null,
          authLnurlEncoded: null,
        });

        return true;
      }

      if (session.status === 'expired') {
        set({ authStatus: 'error' });
        return false;
      }

      return false;
    } catch (error) {
      console.error('LNURL-auth 상태 확인 실패:', error);
      return false;
    }
  },

  // LNURL-auth 취소
  cancelLnurlAuth: () => {
    set({
      authSessionId: null,
      authLnurl: null,
      authLnurlEncoded: null,
      authStatus: 'idle',
    });
  },

  // 로그아웃
  logout: async () => {
    try {
      await saveSecure('SYBA_USER_ID', '');
      await cancelAllSubscriptionNotifications();
      set({
        user: null,
        subscription: null,
        isSubscribed: false,
        pendingPayment: null,
        lightningInvoice: null,
        authStatus: 'idle',
        selectedTier: 'monthly',
        discountCode: '',
        priceCalculation: null,
      });
    } catch (error) {
      console.error('로그아웃 실패:', error);
    }
  },

  // 구독 상태 확인
  checkSubscription: async () => {
    const { user } = get();
    if (!user) return false;

    const isActive = await isSubscriptionActive(user.id);
    set({ isSubscribed: isActive });
    return isActive;
  },

  // 결제 시작 (v2: 선택된 티어 + 할인코드 적용)
  startPayment: async () => {
    const { user, selectedTier, priceCalculation } = get();
    if (!user) return null;

    try {
      // 가격 계산이 안 되어 있으면 다시 계산
      const price = priceCalculation ?? await calculatePrice(selectedTier, get().discountCode || undefined);

      // 매진 체크
      if (price.isSoldOut) {
        console.error('구독 티어 매진:', selectedTier);
        return null;
      }

      const tierLabel = selectedTier === 'monthly' ? '월간' : selectedTier === 'annual' ? '연간' : '평생';
      const invoice = await createLightningInvoice(
        price.finalPrice,
        `SYBA 프리미엄 ${tierLabel} 구독`
      );

      const payment = await createPayment(
        user.id,
        price.finalPrice,
        selectedTier,
        price.originalPrice,
        price.discountCode?.id,
        price.discountAmount
      );
      if (!payment) return null;

      await supabase
        .from('payments')
        .update({
          lightning_invoice: invoice.paymentRequest,
          payment_hash: invoice.paymentHash,
        })
        .eq('id', payment.id);

      set({
        pendingPayment: { ...payment, payment_hash: invoice.paymentHash },
        lightningInvoice: invoice.paymentRequest,
      });

      // 미확인 인보이스 복구용 저장 (tier 정보 포함)
      await AsyncStorage.setItem(PENDING_INVOICE_KEY, JSON.stringify({
        paymentId: payment.id,
        invoice: invoice.paymentRequest,
        paymentHash: invoice.paymentHash,
        tier: selectedTier,
        discountCodeId: price.discountCode?.id,
      }));

      return invoice.paymentRequest;
    } catch (error) {
      console.error('결제 시작 실패:', error);
      return null;
    }
  },

  // 결제 확인 (v2: tier 반영)
  confirmPayment: async () => {
    const { user, pendingPayment, lightningInvoice, selectedTier } = get();
    if (!user || !pendingPayment || !lightningInvoice) return false;

    try {
      const paymentUpdated = await updatePaymentStatus(
        pendingPayment.id,
        'paid',
        pendingPayment.payment_hash || undefined
      );
      if (!paymentUpdated) {
        console.error('[Subscription] payment 상태 업데이트 실패:', pendingPayment.id);
      }

      // 할인코드 사용 처리
      if (pendingPayment.discount_code_id) {
        // RPC로 atomic increment (이미 SQL function 정의됨)
      }

      const subscription = await activateSubscription(
        user.id,
        pendingPayment.tier || selectedTier,
        pendingPayment.discount_code_id || undefined
      );
      if (!subscription) return false;

      await AsyncStorage.removeItem(PENDING_INVOICE_KEY);

      set({
        subscription,
        isSubscribed: true,
        pendingPayment: null,
        lightningInvoice: null,
      });

      // 구독 만료 알림 스케줄링 (lifetime 제외)
      if (subscription.expires_at && !subscription.is_lifetime) {
        await requestNotificationPermissions();
        await scheduleSubscriptionExpiryNotifications(new Date(subscription.expires_at));
      }

      return true;
    } catch (error) {
      console.error('결제 확인 실패:', error);
      return false;
    }
  },

  // 구독 새로고침
  refreshSubscription: async () => {
    const { user } = get();
    if (!user) return;

    const subscription = await getSubscription(user.id);
    const isActive = subscription ? await isSubscriptionActive(user.id) : false;

    set({
      subscription,
      isSubscribed: isActive,
    });
  },

  // ============================================================
  // v2: 티어 & 할인코드
  // ============================================================

  // DB에서 티어별 가격 로드
  loadTierPrices: async () => {
    try {
      const prices = await getSubscriptionPrices();
      set({ availableTiers: prices });

      // 기본 선택 티어의 가격도 계산
      const calc = await calculatePrice('monthly');
      set({ priceCalculation: calc });
    } catch (error) {
      console.error('티어 가격 로드 실패:', error);
    }
  },

  // 티어 선택
  selectTier: (tier: SubscriptionTier) => {
    set({ selectedTier: tier, priceCalculation: null });
    // 가격 재계산
    get().recalculatePrice();
  },

  // 할인코드 입력 (아직 적용 전)
  setDiscountCode: (code: string) => {
    set({ discountCode: code });
  },

  // 할인코드 적용
  applyDiscountCode: async () => {
    const { discountCode, selectedTier } = get();
    if (!discountCode.trim()) {
      return { valid: false, reason: '할인코드를 입력해주세요' };
    }

    const result = await validateDiscountCode(discountCode.trim(), selectedTier);
    if (result.valid) {
      // 가격 재계산
      await get().recalculatePrice();
    }
    return result;
  },

  // 가격 재계산
  recalculatePrice: async () => {
    const { selectedTier, discountCode } = get();
    set({ isCalculatingPrice: true });

    try {
      const calc = await calculatePrice(
        selectedTier,
        discountCode.trim() || undefined
      );
      set({ priceCalculation: calc, isCalculatingPrice: false });
    } catch {
      set({ isCalculatingPrice: false });
    }
  },
}));
