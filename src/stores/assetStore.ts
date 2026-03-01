import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { Asset, FiatAsset, BitcoinAsset, isFiatAsset, isBitcoinAsset } from '../types/asset';
import { loadEncrypted, saveEncrypted, FILE_PATHS } from '../utils/storage';

interface AssetState {
  assets: Asset[];
  isLoading: boolean;
}

interface AssetActions {
  // 초기화
  loadAssets: (encryptionKey: string) => Promise<void>;

  // 법정화폐 자산
  addFiatAsset: (
    data: {
      name: string;
      balance: number;
      // 마이너스통장 옵션
      isOverdraft?: boolean;
      creditLimit?: number;
      interestRate?: number;
    },
    encryptionKey: string
  ) => Promise<FiatAsset>;

  // 비트코인 자산
  addBitcoinAsset: (
    data: {
      name: string;
      balance: number; // sats
      walletType: 'onchain' | 'lightning';
    },
    encryptionKey: string
  ) => Promise<BitcoinAsset>;

  // 공통
  updateAsset: (
    id: string,
    data: Partial<Asset>,
    encryptionKey: string
  ) => Promise<void>;

  deleteAsset: (id: string, encryptionKey: string) => Promise<void>;

  // 잔액 조정 (지출/수입 연동용)
  adjustAssetBalance: (
    id: string,
    amount: number, // 양수: 증가, 음수: 감소
    encryptionKey: string
  ) => Promise<{ clamped: boolean; requested: number; actual: number; assetName: string }>;

  // ID로 자산 조회
  getAssetById: (id: string) => Asset | undefined;

  // 계산
  getTotalFiat: () => number;
  getTotalBitcoin: () => number; // sats
  getTotalAssetKrw: (btcKrw: number | null) => number;
  getBtcRatio: (btcKrw: number | null) => number;
}

export const useAssetStore = create<AssetState & AssetActions>((set, get) => ({
  assets: [],
  isLoading: true,

  // 데이터 로드
  loadAssets: async (encryptionKey: string) => {
    try {
      const assets = await loadEncrypted<Asset[]>(
        FILE_PATHS.ASSETS,
        encryptionKey,
        []
      );

      // 잔액 정상화: 비정상 데이터가 저장된 경우 보정
      let needsSave = false;
      const sanitized = assets.map((asset) => {
        if (!isFiatAsset(asset)) return asset;

        let balance = asset.balance;

        // 일반 계좌: 0 미만 방지
        if (!asset.isOverdraft && balance < 0) {
          console.warn(`[loadAssets] 일반 계좌 마이너스 보정: ${asset.name} (${balance} → 0)`);
          balance = 0;
          needsSave = true;
        }

        // 마이너스통장: 한도 초과 방지
        if (asset.isOverdraft && asset.creditLimit && balance < -asset.creditLimit) {
          console.warn(`[loadAssets] 마이너스 한도 초과 보정: ${asset.name} (${balance} → ${-asset.creditLimit})`);
          balance = -asset.creditLimit;
          needsSave = true;
        }

        if (balance !== asset.balance) {
          return { ...asset, balance, updatedAt: new Date().toISOString() };
        }
        return asset;
      });

      set({ assets: sanitized, isLoading: false });

      // 보정된 데이터가 있으면 저장
      if (needsSave) {
        await saveEncrypted(FILE_PATHS.ASSETS, sanitized, encryptionKey);
        console.log('[loadAssets] 보정된 자산 데이터 저장 완료');
      }
    } catch (error) {
      console.error('자산 데이터 로드 실패:', error);
      set({ isLoading: false });
    }
  },

  // 법정화폐 자산 추가
  addFiatAsset: async (data, encryptionKey) => {
    const now = new Date().toISOString();
    const newAsset: FiatAsset = {
      id: uuidv4(),
      type: 'fiat',
      name: data.name,
      balance: data.balance,
      currency: 'KRW',
      // 마이너스통장 옵션
      ...(data.isOverdraft ? {
        isOverdraft: true,
        creditLimit: data.creditLimit,
        interestRate: data.interestRate,
      } : {}),
      createdAt: now,
      updatedAt: now,
    };

    const updated = [...get().assets, newAsset];
    set({ assets: updated });

    await saveEncrypted(FILE_PATHS.ASSETS, updated, encryptionKey);
    return newAsset;
  },

  // 비트코인 자산 추가
  addBitcoinAsset: async (data, encryptionKey) => {
    const now = new Date().toISOString();
    const newAsset: BitcoinAsset = {
      id: uuidv4(),
      type: 'bitcoin',
      name: data.name,
      balance: data.balance,
      walletType: data.walletType,
      createdAt: now,
      updatedAt: now,
    };

    const updated = [...get().assets, newAsset];
    set({ assets: updated });

    await saveEncrypted(FILE_PATHS.ASSETS, updated, encryptionKey);
    return newAsset;
  },

  // 자산 수정
  updateAsset: async (id, data, encryptionKey) => {
    const assets = get().assets.map((asset) => {
      if (asset.id !== id) return asset;
      return {
        ...asset,
        ...data,
        updatedAt: new Date().toISOString(),
      } as Asset;
    });

    set({ assets });
    await saveEncrypted(FILE_PATHS.ASSETS, assets, encryptionKey);
  },

  // 자산 삭제
  deleteAsset: async (id, encryptionKey) => {
    const assets = get().assets.filter((asset) => asset.id !== id);
    set({ assets });
    await saveEncrypted(FILE_PATHS.ASSETS, assets, encryptionKey);
  },

  // 잔액 조정 (지출/수입 연동용)
  adjustAssetBalance: async (id, amount, encryptionKey) => {
    const asset = get().assets.find((a) => a.id === id);
    if (!asset) {
      console.error('[adjustAssetBalance] 자산을 찾을 수 없음:', id);
      return { clamped: false, requested: 0, actual: 0, assetName: '' };
    }

    const originalNewBalance = asset.balance + amount;
    let newBalance = originalNewBalance;

    // 일반 계좌 (마이너스통장 아님): 잔액 0 이하 방지
    if (isFiatAsset(asset) && !asset.isOverdraft && newBalance < 0) {
      console.warn(`[adjustAssetBalance] 잔액 부족, 0으로 제한: ${asset.name} (요청: ${newBalance})`);
      newBalance = 0;
    }

    // 마이너스통장: 한도까지만 허용
    if (isFiatAsset(asset) && asset.isOverdraft && asset.creditLimit) {
      const floor = -asset.creditLimit;
      if (newBalance < floor) {
        console.warn(`[adjustAssetBalance] 마이너스 한도 초과, 한도로 제한: ${asset.name} (요청: ${newBalance}, 한도: ${floor})`);
        newBalance = floor;
      }
    }

    const assets = get().assets.map((a) => {
      if (a.id !== id) return a;
      return {
        ...a,
        balance: newBalance,
        updatedAt: new Date().toISOString(),
      } as Asset;
    });

    set({ assets });
    await saveEncrypted(FILE_PATHS.ASSETS, assets, encryptionKey);
    if (__DEV__) { console.log(`[adjustAssetBalance] ${asset.name}: ${asset.balance} → ${newBalance} (${amount >= 0 ? '+' : ''}${amount})`); }

    const actualChange = newBalance - asset.balance;
    return {
      clamped: originalNewBalance !== newBalance,
      requested: Math.abs(amount),
      actual: Math.abs(actualChange),
      assetName: asset.name,
    };
  },

  // ID로 자산 조회
  getAssetById: (id) => {
    return get().assets.find((a) => a.id === id);
  },

  // 총 법정화폐 (KRW)
  getTotalFiat: () => {
    return get()
      .assets.filter(isFiatAsset)
      .reduce((sum, asset) => sum + asset.balance, 0);
  },

  // 총 비트코인 (sats)
  getTotalBitcoin: () => {
    return get()
      .assets.filter(isBitcoinAsset)
      .reduce((sum, asset) => sum + asset.balance, 0);
  },

  // 총 자산 (원화 환산)
  getTotalAssetKrw: (btcKrw: number | null) => {
    const fiatTotal = get().getTotalFiat();
    const btcTotal = get().getTotalBitcoin();

    if (!btcKrw || btcTotal === 0) {
      return fiatTotal;
    }

    // sats to KRW: sats * (btcKrw / 100,000,000)
    const btcKrwValue = btcTotal * (btcKrw / 100_000_000);
    return fiatTotal + btcKrwValue;
  },

  // BTC 비중 (%)
  getBtcRatio: (btcKrw: number | null) => {
    const totalKrw = get().getTotalAssetKrw(btcKrw);
    if (totalKrw === 0 || !btcKrw) return 0;

    const btcTotal = get().getTotalBitcoin();
    const btcKrwValue = btcTotal * (btcKrw / 100_000_000);

    return (btcKrwValue / totalKrw) * 100;
  },
}));
