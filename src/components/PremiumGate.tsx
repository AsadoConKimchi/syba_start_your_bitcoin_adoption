import { useEffect } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSubscriptionStore } from '../stores/subscriptionStore';
import { useTheme } from '../hooks/useTheme';

interface PremiumGateProps {
  children?: React.ReactNode;
  feature?: string;
}

export function PremiumGate({ children, feature }: PremiumGateProps) {
  const { isSubscribed, availableTiers, loadTierPrices } = useSubscriptionStore();
  const { t } = useTranslation();
  const { theme } = useTheme();

  // 컴포넌트 마운트 시 가격 데이터 로딩 (아직 안 불러왔으면)
  useEffect(() => {
    if (availableTiers.length === 0) {
      loadTierPrices();
    }
  }, []);

  const displayFeature = feature || t('premium.feature');

  // v2: subscription_prices 테이블에서 monthly 가격 가져오기
  const monthlyTier = availableTiers.find(p => p.tier === 'monthly');
  const isLoadingPrice = availableTiers.length === 0;

  if (isSubscribed) {
    return <>{children}</>;
  }

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.background,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <View
        style={{
          backgroundColor: theme.warningBanner,
          borderRadius: 80,
          width: 160,
          height: 160,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 24,
        }}
      >
        <Text style={{ fontSize: 64 }}>👑</Text>
      </View>

      <Text
        style={{
          fontSize: 24,
          fontWeight: 'bold',
          color: theme.text,
          marginBottom: 12,
          textAlign: 'center',
        }}
      >
        {t('premium.feature')}
      </Text>

      <Text
        style={{
          fontSize: 16,
          color: theme.textSecondary,
          textAlign: 'center',
          marginBottom: 32,
          lineHeight: 24,
        }}
      >
        {t('premium.featureDescription', { feature: displayFeature })}
      </Text>

      <View
        style={{
          backgroundColor: theme.backgroundSecondary,
          borderRadius: 12,
          padding: 16,
          marginBottom: 32,
          width: '100%',
        }}
      >
        <Text style={{ fontSize: 14, fontWeight: '600', color: theme.text, marginBottom: 12 }}>
          {t('premium.benefits')}
        </Text>
        <View style={{ gap: 8 }}>
          <FeatureItem text={t('premium.unlimitedRecords')} />
          <FeatureItem text={t('premium.debtManagement')} />
          <FeatureItem text={t('premium.assetStatus')} />
          <FeatureItem text={t('premium.chartsStats')} />
          <FeatureItem text={t('premium.unlimitedCards')} />
          <FeatureItem text={t('premium.dataBackup')} />
        </View>
      </View>

      <TouchableOpacity
        style={{
          backgroundColor: theme.primary,
          paddingHorizontal: 32,
          paddingVertical: 16,
          borderRadius: 12,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
        }}
        onPress={() => router.push('/(modals)/subscription')}
      >
        <Ionicons name="diamond" size={20} color={theme.textInverse} />
        <Text style={{ fontSize: 16, fontWeight: '600', color: theme.textInverse }}>
          {t('premium.subscribe')}
        </Text>
      </TouchableOpacity>

      {isLoadingPrice ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 }}>
          <ActivityIndicator size="small" color={theme.primary} />
          <Text style={{ fontSize: 14, color: theme.textSecondary }}>...</Text>
        </View>
      ) : (
        <Text style={{ fontSize: 14, color: theme.primary, marginTop: 12, fontWeight: '600' }}>
          {t('premium.monthlyPrice', { price: monthlyTier!.price_sats.toLocaleString() })}
        </Text>
      )}
    </View>
  );
}

function FeatureItem({ text }: { text: string }) {
  const { theme } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Ionicons name="checkmark-circle" size={18} color={theme.success} />
      <Text style={{ fontSize: 14, color: theme.textSecondary }}>{text}</Text>
    </View>
  );
}

export function PremiumBanner({ feature }: { feature?: string }) {
  const { isSubscribed } = useSubscriptionStore();
  const { t } = useTranslation();
  const { theme } = useTheme();

  const displayFeature = feature || t('premium.feature');

  if (isSubscribed) {
    return null;
  }

  return (
    <TouchableOpacity
      style={{
        backgroundColor: theme.warningBanner,
        borderRadius: 12,
        padding: 16,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
      }}
      onPress={() => router.push('/(modals)/subscription')}
    >
      <View
        style={{
          backgroundColor: theme.primary,
          borderRadius: 20,
          width: 40,
          height: 40,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ fontSize: 20 }}>👑</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: '600', color: theme.warningBannerText }}>
          {t('premium.bannerFeature', { feature: displayFeature })}
        </Text>
        <Text style={{ fontSize: 12, color: theme.warningBannerSubtext }}>
          {t('premium.bannerHint')}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={theme.warningBannerText} />
    </TouchableOpacity>
  );
}
