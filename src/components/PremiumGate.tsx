import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSubscriptionStore } from '../stores/subscriptionStore';
import { getSubscriptionPriceSats } from '../services/appConfigService';
import { CONFIG } from '../constants/config';

interface PremiumGateProps {
  children: React.ReactNode;
  feature?: string; // 어떤 기능인지 설명 (예: "자산 관리", "차트 보기")
}

/**
 * 프리미엄 기능을 감싸는 게이트 컴포넌트
 * - isSubscribed가 true면 children을 렌더링
 * - false면 프리미엄 구독 안내 UI를 표시
 */
export function PremiumGate({ children, feature = '이 기능' }: PremiumGateProps) {
  const { isSubscribed } = useSubscriptionStore();
  const [subscriptionPrice, setSubscriptionPrice] = useState(CONFIG.SUBSCRIPTION_PRICE_SATS);

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
        프리미엄 기능
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
        {feature}은(는) 프리미엄 구독자만{'\n'}이용할 수 있습니다.
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
          프리미엄 기능
        </Text>
        <View style={{ gap: 8 }}>
          <FeatureItem text="무제한 과거 기록 보관/조회" />
          <FeatureItem text="할부/대출 관리" />
          <FeatureItem text="자산 현황" />
          <FeatureItem text="차트 및 통계" />
          <FeatureItem text="카드 무제한 등록" />
          <FeatureItem text="데이터 백업" />
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
          프리미엄 구독하기
        </Text>
      </TouchableOpacity>

      <Text style={{ fontSize: 14, color: '#F7931A', marginTop: 12, fontWeight: '600' }}>
        월 {subscriptionPrice.toLocaleString()} sats
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

/**
 * 프리미엄이 아닐 때 표시되는 인라인 배너 (차트 등에 사용)
 */
export function PremiumBanner({ feature = '이 기능' }: { feature?: string }) {
  const { isSubscribed } = useSubscriptionStore();

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
          {feature}
        </Text>
        <Text style={{ fontSize: 12, color: '#B45309' }}>
          프리미엄 구독으로 이용하세요
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color="#92400E" />
    </TouchableOpacity>
  );
}
