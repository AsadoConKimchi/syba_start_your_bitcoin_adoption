import { create } from 'zustand';
import i18n from '../i18n';
import { fetchAllPrices } from '../services/api/price';
import { PriceCache } from '../types/settings';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  connectWebSocket,
  disconnectWebSocket,
  isWebSocketConnected,
} from '../services/api/upbitWebSocket';

const PRICE_CACHE_KEY = 'price_cache';

interface PriceState {
  btcKrw: number | null;
  btcUsdt: number | null;
  usdKrw: number | null;
  kimchiPremium: number | null;
  lastUpdated: string | null;
  isLoading: boolean;
  error: string | null;
  isOffline: boolean;
  isWebSocketConnected: boolean;
  // WebSocket 구독 카운터 (자산탭, 부채탭 등 여러 화면에서 사용)
  wsSubscriberCount: number;
}

interface PriceActions {
  fetchPrices: () => Promise<void>;
  loadCachedPrices: () => Promise<void>;
  savePriceCache: () => Promise<void>;
  // WebSocket 관련
  subscribeRealTimePrice: () => void;
  unsubscribeRealTimePrice: () => void;
}

export const usePriceStore = create<PriceState & PriceActions>((set, get) => ({
  btcKrw: null,
  btcUsdt: null,
  usdKrw: null,
  kimchiPremium: null,
  lastUpdated: null,
  isLoading: false,
  error: null,
  isOffline: false,
  isWebSocketConnected: false,
  wsSubscriberCount: 0,

  // 시세 조회 (실패 시 캐시 사용)
  fetchPrices: async () => {
    set({ isLoading: true, error: null });

    try {
      const prices = await fetchAllPrices();
      set({
        btcKrw: prices.btcKrw,
        btcUsdt: prices.btcUsdt,
        usdKrw: prices.usdKrw,
        kimchiPremium: prices.kimchiPremium,
        lastUpdated: prices.updatedAt,
        isLoading: false,
        isOffline: false,
      });

      // 캐시 저장
      await get().savePriceCache();
    } catch (error) {
      console.error('시세 조회 실패, 캐시 사용:', error);

      // 실패 시 캐시된 데이터 로드
      const { btcKrw } = get();
      if (!btcKrw) {
        await get().loadCachedPrices();
      }

      set({
        error: i18n.t('errors.offlineUsingCache'),
        isLoading: false,
        isOffline: true,
      });
    }
  },

  // 캐시된 시세 로드 (앱 시작 시 호출)
  loadCachedPrices: async () => {
    try {
      const cached = await AsyncStorage.getItem(PRICE_CACHE_KEY);
      if (cached) {
        const prices: PriceCache = JSON.parse(cached);
        const currentState = get();

        if (!currentState.btcKrw || currentState.isOffline) {
          set({
            btcKrw: prices.btcKrw,
            btcUsdt: prices.btcUsdt,
            usdKrw: prices.usdKrw,
            kimchiPremium: prices.kimchiPremium,
            lastUpdated: prices.updatedAt,
            isOffline: true,
          });
        }
      }
    } catch (error) {
      console.error('캐시 로드 실패:', error);
    }
  },

  // 시세 캐시 저장
  savePriceCache: async () => {
    const { btcKrw, btcUsdt, usdKrw, kimchiPremium, lastUpdated } = get();

    if (!btcKrw || !btcUsdt || !usdKrw || !lastUpdated) return;

    const cache: PriceCache = {
      btcKrw,
      btcUsdt,
      usdKrw,
      kimchiPremium: kimchiPremium ?? 0,
      updatedAt: lastUpdated,
    };

    try {
      await AsyncStorage.setItem(PRICE_CACHE_KEY, JSON.stringify(cache));
    } catch (error) {
      console.error('캐시 저장 실패:', error);
    }
  },

  // WebSocket 실시간 시세 구독
  subscribeRealTimePrice: () => {
    const { wsSubscriberCount } = get();
    const newCount = wsSubscriberCount + 1;

    set({ wsSubscriberCount: newCount });

    // 첫 번째 구독자일 때만 연결
    if (newCount === 1) {
      console.log('[PriceStore] WebSocket 연결 시작');

      connectWebSocket((price: number) => {
        // 실시간 가격 업데이트
        set({
          btcKrw: price,
          lastUpdated: new Date().toISOString(),
          isOffline: false,
          isWebSocketConnected: true,
        });
      });

      set({ isWebSocketConnected: true });
    }
  },

  // WebSocket 실시간 시세 구독 해제
  unsubscribeRealTimePrice: () => {
    const { wsSubscriberCount } = get();
    const newCount = Math.max(0, wsSubscriberCount - 1);

    set({ wsSubscriberCount: newCount });

    // 마지막 구독자가 해제될 때만 연결 종료
    if (newCount === 0) {
      console.log('[PriceStore] WebSocket 연결 해제');
      disconnectWebSocket();
      set({ isWebSocketConnected: false });
    }
  },
}));
