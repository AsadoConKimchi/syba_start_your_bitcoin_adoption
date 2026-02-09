import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSubscriptionStore } from '../stores/subscriptionStore';
import { getSubscriptionPriceSats } from '../services/appConfigService';
import { CONFIG } from '../constants/config';

interface PremiumGateProps {
  children: React.ReactNode;
  feature?: string;
}

export function PremiumGate({ children, feature }: PremiumGateProps) {
  const { isSubscribed } = useSubscriptionStore();
  const { t } = useTranslation();
  const [subscriptionPrice, setSubscriptionPrice] = useState(CONFIG.SUBSCRIPTION_PRICE_SATS);

  const displayFeature = feature || t('premium.feature');

  useEffect(() => {
    getSubscriptionPriceSats().then(setSubscriptionPrice);
  }, []);

  if (isSubscribed) {
    return <>{children}</>;
  }

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: '#FFFFFF',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <View
        style={{
          backgroundColor: '#FEF3C7',
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
          color: '#1A1A1A',
          marginBottom: 12,
          textAlign: 'center',
        }}
      >
        {t('premium.feature')}
      </Text>

      <Text
        style={{
          fontSize: 16,
          color: '#666666',
          textAlign: 'center',
          marginBottom: 32,
          lineHeight: 24,
        }}
      >
        {t('premium.featureDescription', { feature: displayFeature })}
      </Text>

      <View
        style={{
          backgroundColor: '#F9FAFB',
          borderRadius: 12,
          padding: 16,
          marginBottom: 32,
          width: '100%',
        }}
      >
        <Text style={{ fontSize: 14, fontWeight: '600', color: '#1A1A1A', marginBottom: 12 }}>
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
          backgroundColor: '#F7931A',
          paddingHorizontal: 32,
          paddingVertical: 16,
          borderRadius: 12,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
        }}
        onPress={() => router.push('/(modals)/subscription')}
      >
        <Ionicons name="diamond" size={20} color="#FFFFFF" />
        <Text style={{ fontSize: 16, fontWeight: '600', color: '#FFFFFF' }}>
          {t('premium.subscribe')}
        </Text>
      </TouchableOpacity>

      <Text style={{ fontSize: 14, color: '#F7931A', marginTop: 12, fontWeight: '600' }}>
        {t('premium.monthlyPrice', { price: subscriptionPrice.toLocaleString() })}
      </Text>
    </View>
  );
}

function FeatureItem({ text }: { text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Ionicons name="checkmark-circle" size={18} color="#22C55E" />
      <Text style={{ fontSize: 14, color: '#666666' }}>{text}</Text>
    </View>
  );
}

export function PremiumBanner({ feature }: { feature?: string }) {
  const { isSubscribed } = useSubscriptionStore();
  const { t } = useTranslation();

  const displayFeature = feature || t('premium.feature');

  if (isSubscribed) {
    return null;
  }

  return (
    <TouchableOpacity
      style={{
        backgroundColor: '#FEF3C7',
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
          backgroundColor: '#F7931A',
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
        <Text style={{ fontSize: 14, fontWeight: '600', color: '#92400E' }}>
          {t('premium.bannerFeature', { feature: displayFeature })}
        </Text>
        <Text style={{ fontSize: 12, color: '#B45309' }}>
          {t('premium.bannerHint')}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color="#92400E" />
    </TouchableOpacity>
  );
}
