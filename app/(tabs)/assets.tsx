import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { useState, useCallback } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAssetStore } from '../../src/stores/assetStore';
import { usePriceStore } from '../../src/stores/priceStore';
import { useAuthStore } from '../../src/stores/authStore';
import { useSettingsStore } from '../../src/stores/settingsStore';
import { useSubscriptionStore } from '../../src/stores/subscriptionStore';
import { isFiatAsset, isBitcoinAsset } from '../../src/types/asset';
import { formatKrw, formatSats, formatTimeAgo } from '../../src/utils/formatters';
import { PremiumGate } from '../../src/components/PremiumGate';

export default function AssetsScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const { t } = useTranslation();

  const { encryptionKey } = useAuthStore();
  const { isSubscribed } = useSubscriptionStore();
  const {
    assets,
    loadAssets,
    getTotalFiat,
    getTotalBitcoin,
    getTotalAssetKrw,
    getBtcRatio,
  } = useAssetStore();
  const {
    btcKrw,
    kimchiPremium,
    lastUpdated,
    fetchPrices,
    isOffline,
    isWebSocketConnected,
    subscribeRealTimePrice,
    unsubscribeRealTimePrice,
  } = usePriceStore();

  useFocusEffect(
    useCallback(() => {
      subscribeRealTimePrice();
      return () => {
        unsubscribeRealTimePrice();
      };
    }, [])
  );
  const { settings } = useSettingsStore();

  const totalFiat = getTotalFiat();
  const totalBtc = getTotalBitcoin();
  const totalAssetKrw = getTotalAssetKrw(btcKrw);
  const btcRatio = getBtcRatio(btcKrw);

  const totalAssetSats = btcKrw ? Math.round(totalAssetKrw / (btcKrw / 100_000_000)) : 0;
  const totalFiatSats = btcKrw ? Math.round(totalFiat / (btcKrw / 100_000_000)) : 0;

  const fiatAssets = assets.filter(isFiatAsset);
  const btcAssets = assets.filter(isBitcoinAsset);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      encryptionKey ? loadAssets(encryptionKey) : Promise.resolve(),
      fetchPrices(),
    ]);
    setRefreshing(false);
  }, [encryptionKey]);

  if (!isSubscribed) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
        <PremiumGate feature={t('assets.management')} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: 20,
          borderBottomWidth: 1,
          borderBottomColor: '#E5E7EB',
        }}
      >
        <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#1A1A1A' }}>{t('assets.title')}</Text>
        <TouchableOpacity onPress={() => router.push('/(modals)/add-asset')}>
          <Ionicons name="add-circle" size={28} color="#22C55E" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#22C55E" />
        }
      >
        <View style={{ padding: 20 }}>
          <View
            style={{
              backgroundColor: '#F0FDF4',
              borderRadius: 16,
              padding: 24,
              marginBottom: 24,
            }}
          >
            <Text style={{ fontSize: 14, color: '#166534', marginBottom: 8 }}>{t('assets.totalAssets')}</Text>
            {settings.displayUnit === 'BTC' ? (
              <>
                <Text style={{ fontSize: 36, fontWeight: 'bold', color: '#F7931A', marginBottom: 4 }}>
                  {formatSats(totalAssetSats)}
                </Text>
                <Text style={{ fontSize: 14, color: '#9CA3AF', marginBottom: 16 }}>
                  {formatKrw(Math.round(totalAssetKrw))}
                </Text>
              </>
            ) : (
              <Text style={{ fontSize: 36, fontWeight: 'bold', color: '#22C55E', marginBottom: 16 }}>
                {formatKrw(Math.round(totalAssetKrw))}
              </Text>
            )}

            <View style={{ flexDirection: 'row', gap: 16 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, color: '#666666' }}>{t('assets.fiatAssets')}</Text>
                {settings.displayUnit === 'BTC' ? (
                  <>
                    <Text style={{ fontSize: 16, fontWeight: '600', color: '#1A1A1A' }}>
                      {formatSats(totalFiatSats)}
                    </Text>
                    <Text style={{ fontSize: 11, color: '#9CA3AF' }}>
                      {formatKrw(totalFiat)}
                    </Text>
                  </>
                ) : (
                  <Text style={{ fontSize: 16, fontWeight: '600', color: '#1A1A1A' }}>
                    {formatKrw(totalFiat)}
                  </Text>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, color: '#666666' }}>{t('assets.btcAssets')}</Text>
                <Text style={{ fontSize: 16, fontWeight: '600', color: '#F7931A' }}>
                  {formatSats(totalBtc)}
                </Text>
                {settings.displayUnit === 'KRW' && btcKrw && (
                  <Text style={{ fontSize: 11, color: '#9CA3AF' }}>
                    {formatKrw(Math.round(totalBtc * (btcKrw / 100_000_000)))}
                  </Text>
                )}
              </View>
            </View>

            {totalAssetKrw > 0 && (
              <View style={{ marginTop: 16 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                  <Text style={{ fontSize: 12, color: '#666666' }}>{t('assets.btcRatio')}</Text>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: '#F7931A' }}>
                    {btcRatio.toFixed(1)}%
                  </Text>
                </View>
                <View
                  style={{
                    height: 8,
                    backgroundColor: '#E5E7EB',
                    borderRadius: 4,
                    overflow: 'hidden',
                  }}
                >
                  <View
                    style={{
                      height: '100%',
                      width: `${Math.min(btcRatio, 100)}%`,
                      backgroundColor: '#F7931A',
                      borderRadius: 4,
                    }}
                  />
                </View>
              </View>
            )}
          </View>

          {/* Fiat assets */}
          <View style={{ marginBottom: 24 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text style={{ fontSize: 16, fontWeight: '600', color: '#1A1A1A' }}>
                {t('assets.fiatCount', { count: fiatAssets.length })}
              </Text>
              {settings.displayUnit === 'BTC' ? (
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 14, color: '#22C55E', fontWeight: '600' }}>
                    {formatSats(totalFiatSats)}
                  </Text>
                  <Text style={{ fontSize: 11, color: '#9CA3AF' }}>
                    {formatKrw(totalFiat)}
                  </Text>
                </View>
              ) : (
                <Text style={{ fontSize: 14, color: '#22C55E', fontWeight: '600' }}>
                  {formatKrw(totalFiat)}
                </Text>
              )}
            </View>

            {fiatAssets.length === 0 ? (
              <TouchableOpacity
                style={{
                  backgroundColor: '#F9FAFB',
                  borderRadius: 12,
                  padding: 24,
                  alignItems: 'center',
                  borderWidth: 1,
                  borderColor: '#E5E7EB',
                  borderStyle: 'dashed',
                }}
                onPress={() => router.push('/(modals)/add-asset')}
              >
                <Ionicons name="add-circle-outline" size={32} color="#9CA3AF" />
                <Text style={{ fontSize: 14, color: '#9CA3AF', marginTop: 8 }}>
                  {t('assets.addAccount')}
                </Text>
              </TouchableOpacity>
            ) : (
              fiatAssets.map((asset) => (
                <TouchableOpacity
                  key={asset.id}
                  style={{
                    backgroundColor: '#F9FAFB',
                    borderRadius: 12,
                    padding: 16,
                    marginBottom: 8,
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                  onPress={() => router.push(`/(modals)/asset-detail?id=${asset.id}`)}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <View
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 20,
                        backgroundColor: '#D1FAE5',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginRight: 12,
                      }}
                    >
                      <Text style={{ fontSize: 18 }}>🏦</Text>
                    </View>
                    <View>
                      <Text style={{ fontSize: 14, fontWeight: '600', color: '#1A1A1A' }}>
                        {asset.name}
                      </Text>
                      <Text style={{ fontSize: 11, color: '#9CA3AF' }}>
                        {formatTimeAgo(asset.updatedAt)}
                      </Text>
                    </View>
                  </View>
                  {settings.displayUnit === 'BTC' && btcKrw ? (
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#22C55E' }}>
                        {formatSats(Math.round(asset.balance / (btcKrw / 100_000_000)))}
                      </Text>
                      <Text style={{ fontSize: 11, color: '#9CA3AF' }}>
                        {formatKrw(asset.balance)}
                      </Text>
                    </View>
                  ) : (
                    <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#22C55E' }}>
                      {formatKrw(asset.balance)}
                    </Text>
                  )}
                </TouchableOpacity>
              ))
            )}
          </View>

          {/* Bitcoin assets */}
          <View style={{ marginBottom: 24 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text style={{ fontSize: 16, fontWeight: '600', color: '#1A1A1A' }}>
                {t('assets.btcCount', { count: btcAssets.length })}
              </Text>
              <Text style={{ fontSize: 14, color: '#F7931A', fontWeight: '600' }}>
                {formatSats(totalBtc)}
              </Text>
            </View>

            {btcAssets.length === 0 ? (
              <TouchableOpacity
                style={{
                  backgroundColor: '#FEF3C7',
                  borderRadius: 12,
                  padding: 24,
                  alignItems: 'center',
                  borderWidth: 1,
                  borderColor: '#FCD34D',
                  borderStyle: 'dashed',
                }}
                onPress={() => router.push('/(modals)/add-asset')}
              >
                <Text style={{ fontSize: 32 }}>₿</Text>
                <Text style={{ fontSize: 14, color: '#92400E', marginTop: 8 }}>
                  {t('assets.addBtcWallet')}
                </Text>
              </TouchableOpacity>
            ) : (
              btcAssets.map((asset) => (
                <TouchableOpacity
                  key={asset.id}
                  style={{
                    backgroundColor: '#FEF3C7',
                    borderRadius: 12,
                    padding: 16,
                    marginBottom: 8,
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                  onPress={() => router.push(`/(modals)/asset-detail?id=${asset.id}`)}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <View
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 20,
                        backgroundColor: '#FDE68A',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginRight: 12,
                      }}
                    >
                      <Text style={{ fontSize: 18 }}>
                        {asset.walletType === 'lightning' ? '⚡' : '₿'}
                      </Text>
                    </View>
                    <View>
                      <Text style={{ fontSize: 14, fontWeight: '600', color: '#1A1A1A' }}>
                        {asset.name}
                      </Text>
                      <Text style={{ fontSize: 11, color: '#92400E' }}>
                        {asset.walletType === 'onchain' ? t('assets.onchain') : t('assets.lightning')}
                      </Text>
                    </View>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#F7931A' }}>
                      {formatSats(asset.balance)}
                    </Text>
                    {btcKrw && (
                      <Text style={{ fontSize: 11, color: '#92400E' }}>
                        {formatKrw(Math.round(asset.balance * (btcKrw / 100_000_000)))}
                      </Text>
                    )}
                  </View>
                </TouchableOpacity>
              ))
            )}
          </View>

          {/* BTC price */}
          {btcKrw && (
            <View style={{ marginBottom: 24 }}>
              <View
                style={{
                  backgroundColor: isOffline ? '#FEE2E2' : '#FEF3C7',
                  borderRadius: 12,
                  padding: 16,
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <View>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={{ fontSize: 12, color: isOffline ? '#991B1B' : '#92400E' }}>
                      BTC/KRW
                    </Text>
                    {isWebSocketConnected && !isOffline && (
                      <View
                        style={{
                          backgroundColor: '#22C55E',
                          borderRadius: 4,
                          paddingHorizontal: 6,
                          paddingVertical: 2,
                          marginLeft: 8,
                          flexDirection: 'row',
                          alignItems: 'center',
                        }}
                      >
                        <View
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: 3,
                            backgroundColor: '#FFFFFF',
                            marginRight: 4,
                          }}
                        />
                        <Text style={{ fontSize: 10, color: '#FFFFFF', fontWeight: '600' }}>
                          LIVE
                        </Text>
                      </View>
                    )}
                    {isOffline && (
                      <View
                        style={{
                          backgroundColor: '#EF4444',
                          borderRadius: 4,
                          paddingHorizontal: 6,
                          paddingVertical: 2,
                          marginLeft: 8,
                        }}
                      >
                        <Text style={{ fontSize: 10, color: '#FFFFFF', fontWeight: '600' }}>
                          {t('common.offline')}
                        </Text>
                      </View>
                    )}
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                    <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#F7931A' }}>
                      {formatKrw(btcKrw)}
                    </Text>
                    {kimchiPremium !== null && (
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: '600',
                          color: kimchiPremium >= 0 ? '#22C55E' : '#EF4444',
                          marginLeft: 8,
                        }}
                      >
                        (P{kimchiPremium >= 0 ? '+' : ''}{kimchiPremium.toFixed(1)}%)
                      </Text>
                    )}
                  </View>
                  {lastUpdated && (
                    <Text style={{ fontSize: 11, color: isOffline ? '#991B1B' : '#92400E', marginTop: 2 }}>
                      {formatTimeAgo(lastUpdated)}
                    </Text>
                  )}
                </View>
                <Ionicons name="logo-bitcoin" size={32} color="#F7931A" />
              </View>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
