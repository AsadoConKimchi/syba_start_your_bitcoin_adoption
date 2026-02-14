import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Clipboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../src/hooks/useTheme';
import { useSubscriptionStore } from '../../src/stores/subscriptionStore';
import { CONFIG } from '../../src/constants/config';
import { waitForPaymentWs, PaymentStatus } from '../../src/services/blinkProxy';
import { getSubscriptionPriceSats } from '../../src/services/appConfigService';

export default function PaymentScreen() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const {
    lightningInvoice,
    pendingPayment,
    confirmPayment,
  } = useSubscriptionStore();

  const [status, setStatus] = useState<'waiting' | 'checking' | 'success' | 'expired' | 'error'>('waiting');
  const [copied, setCopied] = useState(false);
  const isCancelledRef = useRef(false);
  const [subscriptionPrice, setSubscriptionPrice] = useState<number>(CONFIG.SUBSCRIPTION_PRICE_SATS);

  // 구독 가격 조회
  useEffect(() => {
    getSubscriptionPriceSats().then(setSubscriptionPrice);
  }, []);

  // 폴링으로 결제 상태 확인
  useEffect(() => {
    if (!lightningInvoice) return;

    console.log('[Payment] 결제 상태 폴링 시작');
    isCancelledRef.current = false;

    const checkPayment = async () => {
      const paid = await waitForPaymentWs(
        lightningInvoice,
        (paymentStatus: PaymentStatus) => {
          if (isCancelledRef.current) return;
          console.log('[Payment] 상태 변경:', paymentStatus);

          if (paymentStatus === 'PENDING') {
            setStatus('waiting');
          } else if (paymentStatus === 'EXPIRED') {
            setStatus('expired');
          }
        },
        10 * 60 * 1000 // 10분
      );

      if (isCancelledRef.current) return;

      if (paid) {
        setStatus('checking');

        // 구독 활성화
        const confirmed = await confirmPayment();

        if (confirmed) {
          setStatus('success');
          Alert.alert(t('subscription.paymentComplete'), t('subscription.paymentDone'), [
            { text: t('common.confirm'), onPress: () => router.replace('/(tabs)/settings') },
          ]);
        } else {
          setStatus('error');
          Alert.alert(
            t('subscription.processingError'),
            t('subscription.activationFailed'),
            [{ text: t('common.confirm'), onPress: () => router.back() }]
          );
        }
      } else {
        if (!isCancelledRef.current) {
          setStatus('expired');
          Alert.alert(t('subscription.expired'), t('subscription.invoiceExpired'), [
            { text: t('common.confirm'), onPress: () => router.back() },
          ]);
        }
      }
    };

    checkPayment();

    // cleanup
    return () => {
      console.log('[Payment] 결제 폴링 취소');
      isCancelledRef.current = true;
    };
  }, [lightningInvoice]);

  const handleCopy = () => {
    if (lightningInvoice) {
      Clipboard.setString(lightningInvoice);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!lightningInvoice) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: theme.textSecondary }}>{t('common.processing')}</Text>
        <ActivityIndicator style={{ marginTop: 16 }} color={theme.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      {/* 헤더 */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: 20,
          borderBottomWidth: 1,
          borderBottomColor: theme.border,
        }}
      >
        <Text style={{ fontSize: 18, fontWeight: 'bold', color: theme.text }}>
          {t('subscription.lightningPayment')}
        </Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="close" size={24} color={theme.textSecondary} />
        </TouchableOpacity>
      </View>

      <View style={{ flex: 1, alignItems: 'center', padding: 20 }}>
        {/* 금액 */}
        <View style={{ marginBottom: 24, alignItems: 'center' }}>
          <Text style={{ fontSize: 14, color: theme.textSecondary, marginBottom: 4 }}>{t('subscription.paymentAmount')}</Text>
          <Text style={{ fontSize: 32, fontWeight: 'bold', color: theme.primary }}>
            {subscriptionPrice.toLocaleString()} sats
          </Text>
        </View>

        {/* QR 코드 */}
        <TouchableOpacity
          style={{
            backgroundColor: '#FFFFFF',
            padding: 20,
            borderRadius: 16,
            alignItems: 'center',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.1,
            shadowRadius: 8,
            elevation: 4,
            marginBottom: 24,
          }}
          onPress={handleCopy}
          activeOpacity={0.8}
        >
          <QRCode
            value={lightningInvoice}
            size={200}
            backgroundColor="#FFFFFF"
            color="#000000"
          />
          <Text style={{ marginTop: 12, fontSize: 12, color: copied ? theme.success : theme.textMuted }}>
            {copied ? t('common.copied') : t('subscription.tapToCopyInvoice')}
          </Text>
        </TouchableOpacity>

        {/* 상태 표시 */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            marginBottom: 24,
          }}
        >
          {status === 'waiting' && (
            <>
              <ActivityIndicator size="small" color={theme.primary} style={{ marginRight: 8 }} />
              <Text style={{ color: theme.textSecondary }}>{t('subscription.waitingPayment')}</Text>
            </>
          )}
          {status === 'checking' && (
            <>
              <ActivityIndicator size="small" color={theme.primary} style={{ marginRight: 8 }} />
              <Text style={{ color: theme.textSecondary }}>{t('subscription.activating')}</Text>
            </>
          )}
          {status === 'success' && (
            <>
              <Ionicons name="checkmark-circle" size={20} color={theme.success} style={{ marginRight: 8 }} />
              <Text style={{ color: theme.success, fontWeight: '600' }}>{t('subscription.paymentComplete')}</Text>
            </>
          )}
          {status === 'expired' && (
            <>
              <Ionicons name="close-circle" size={20} color={theme.error} style={{ marginRight: 8 }} />
              <Text style={{ color: theme.error }}>{t('subscription.expired')}</Text>
            </>
          )}
          {status === 'error' && (
            <>
              <Ionicons name="warning" size={20} color="#F59E0B" style={{ marginRight: 8 }} />
              <Text style={{ color: '#F59E0B' }}>{t('subscription.processingError')}</Text>
            </>
          )}
        </View>

        {/* Invoice 미리보기 */}
        <View
          style={{
            backgroundColor: theme.backgroundSecondary,
            padding: 12,
            borderRadius: 8,
            width: '100%',
          }}
        >
          <Text
            style={{ fontSize: 10, color: theme.textMuted, fontFamily: 'monospace' }}
            numberOfLines={3}
          >
            {lightningInvoice}
          </Text>
        </View>

        {/* 안내 문구 */}
        <View style={{ marginTop: 24, alignItems: 'center' }}>
          <Text style={{ fontSize: 12, color: theme.textMuted, textAlign: 'center' }}>
            {t('subscription.paymentInstructions')}
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}
