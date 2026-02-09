import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
  Clipboard,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import { useTranslation } from 'react-i18next';
import { useSubscriptionStore } from '../../src/stores/subscriptionStore';
import { CONFIG } from '../../src/constants/config';
import { getSubscriptionPriceSats } from '../../src/services/appConfigService';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { waitForPayment, PaymentStatus } from '../../src/services/blinkProxy';
import { lastLnurlError } from '../../src/services/lnurlAuth';

export default function SubscriptionScreen() {
  const { t } = useTranslation();
  const {
    user,
    subscription,
    isLoading,
    isSubscribed,
    authLnurl,
    authLnurlEncoded,
    authStatus,
    lightningInvoice,
    initialize,
    startLnurlAuth,
    checkLnurlAuthStatus,
    cancelLnurlAuth,
    logout,
    startPayment,
    confirmPayment,
    refreshSubscription,
  } = useSubscriptionStore();

  const [isStartingAuth, setIsStartingAuth] = useState(false);
  const [isStartingPayment, setIsStartingPayment] = useState(false);
  const [copied, setCopied] = useState(false);
  const [invoiceCopied, setInvoiceCopied] = useState(false);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [subscriptionPrice, setSubscriptionPrice] = useState(CONFIG.SUBSCRIPTION_PRICE_SATS);

  // 결제 모달 상태
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<'waiting' | 'checking' | 'success' | 'expired' | 'error'>('waiting');
  const paymentCancelledRef = useRef(false);
  const isProcessingRef = useRef(false);

  const handleCopyLnurl = () => {
    if (authLnurlEncoded) {
      Clipboard.setString(authLnurlEncoded);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleCopyInvoice = () => {
    if (lightningInvoice) {
      Clipboard.setString(lightningInvoice);
      setInvoiceCopied(true);
      setTimeout(() => setInvoiceCopied(false), 2000);
    }
  };

  useEffect(() => {
    initialize();
    // 구독 가격 조회
    getSubscriptionPriceSats().then(setSubscriptionPrice);
  }, []);

  // LNURL-auth 폴링
  useEffect(() => {
    if (authStatus === 'waiting' && authLnurl) {
      pollIntervalRef.current = setInterval(async () => {
        const authenticated = await checkLnurlAuthStatus();
        if (authenticated) {
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
          }
        }
      }, 2000);
    }

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [authStatus, authLnurl]);

  const handleStartAuth = async () => {
    console.log('[Subscription] handleStartAuth 시작');
    setIsStartingAuth(true);
    try {
      const result = await startLnurlAuth();
      console.log('[Subscription] startLnurlAuth 결과:', result);
      if (!result) {
        // 상세 에러 메시지 표시
        const errorDetail = lastLnurlError || t('common.error');
        Alert.alert(
          t('subscription.lnurlFailed'),
          `${errorDetail}\n\n${t('subscription.lnurlFailedDetail')}`
        );
      }
    } catch (error) {
      console.error('[Subscription] handleStartAuth 에러:', error);
      Alert.alert(t('common.error'), `${t('subscription.loginFailed')}: ${error}`);
    } finally {
      setIsStartingAuth(false);
    }
  };

  const handleCancelAuth = () => {
    cancelLnurlAuth();
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }
  };

  const handleLogout = () => {
    Alert.alert(t('subscription.logout'), t('subscription.logoutConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('subscription.logout'),
        style: 'destructive',
        onPress: logout,
      },
    ]);
  };

  const handleSubscribe = async () => {
    setIsStartingPayment(true);
    try {
      const invoice = await startPayment();
      if (invoice) {
        // 결제 모달 열기
        setPaymentStatus('waiting');
        isProcessingRef.current = false;
        setShowPaymentModal(true);
      } else {
        Alert.alert(t('common.error'), t('subscription.paymentFailed'));
      }
    } catch (error) {
      Alert.alert(t('common.error'), t('subscription.paymentStartFailed'));
    } finally {
      setIsStartingPayment(false);
    }
  };

  const handleClosePaymentModal = () => {
    paymentCancelledRef.current = true;
    setShowPaymentModal(false);
    setPaymentStatus('waiting');
  };

  // 결제 모달이 열리면 폴링 시작
  useEffect(() => {
    if (!showPaymentModal || !lightningInvoice) return;

    console.log('[Subscription] 결제 폴링 시작');
    paymentCancelledRef.current = false;

    const checkPayment = async () => {
      const paid = await waitForPayment(
        lightningInvoice,
        (status: PaymentStatus) => {
          if (paymentCancelledRef.current) return;
          console.log('[Subscription] 결제 상태:', status);

          if (status === 'PENDING') {
            setPaymentStatus('waiting');
          } else if (status === 'EXPIRED') {
            setPaymentStatus('expired');
          }
        },
        10 * 60 * 1000, // 10분
        3000 // 3초 간격
      );

      if (paymentCancelledRef.current) return;

      if (paid) {
        setPaymentStatus('checking');

        const confirmed = await confirmPayment();
        if (confirmed) {
          setPaymentStatus('success');
          await refreshSubscription();

          setTimeout(() => {
            setShowPaymentModal(false);
            Alert.alert(t('subscription.paymentComplete'), t('subscription.paymentDone'));
          }, 1500);
        } else {
          setPaymentStatus('error');
          Alert.alert(
            t('subscription.processingError'),
            t('subscription.activationFailed')
          );
        }
      } else {
        if (!paymentCancelledRef.current) {
          setPaymentStatus('expired');
          Alert.alert(t('subscription.expired'), t('subscription.invoiceExpired'), [
            { text: t('common.confirm'), onPress: handleClosePaymentModal },
          ]);
        }
      }
    };

    checkPayment();

    return () => {
      console.log('[Subscription] 결제 폴링 취소');
      paymentCancelledRef.current = true;
    };
  }, [showPaymentModal, lightningInvoice]);

  if (isLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#F7931A" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      {/* 헤더 */}
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
        <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#1A1A1A' }}>
          {t('subscription.title')}
        </Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="close" size={24} color="#666666" />
        </TouchableOpacity>
      </View>

      <ScrollView style={{ flex: 1 }}>
        {/* 프리미엄 헤더 + 가격 (컴팩트) */}
        <View style={{ padding: 20 }}>
          <View
            style={{
              backgroundColor: '#FEF3C7',
              borderRadius: 16,
              padding: 16,
              flexDirection: 'row',
              alignItems: 'center',
              marginBottom: 16,
            }}
          >
            <View
              style={{
                width: 48,
                height: 48,
                borderRadius: 24,
                backgroundColor: '#F7931A',
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 12,
              }}
            >
              <Ionicons name="diamond" size={24} color="#FFFFFF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#1A1A1A' }}>
                {t('subscription.sybaPremium')}
              </Text>
              <Text style={{ fontSize: 12, color: '#666666' }}>
                {t('subscription.unlockAll')}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#F7931A' }}>
                {subscriptionPrice.toLocaleString()}
              </Text>
              <Text style={{ fontSize: 11, color: '#666666' }}>{t('subscription.pricePerMonth')}</Text>
            </View>
          </View>

          {/* 혜택 목록 */}
          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 16, fontWeight: '600', color: '#1A1A1A', marginBottom: 12 }}>
              {t('subscription.benefits')}
            </Text>
            {[
              { icon: 'card', text: t('subscription.unlimitedCards') },
              { icon: 'analytics', text: t('subscription.detailedStats') },
              { icon: 'notifications', text: t('subscription.premiumAlert') },
              { icon: 'cloud-upload', text: t('subscription.cloudBackup') },
              { icon: 'color-palette', text: t('subscription.customTheme') },
            ].map((item, index) => (
              <View
                key={index}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingVertical: 8,
                }}
              >
                <View
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    backgroundColor: '#E8F5E9',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: 12,
                  }}
                >
                  <Ionicons name={item.icon as any} size={16} color="#22C55E" />
                </View>
                <Text style={{ fontSize: 14, color: '#1A1A1A' }}>{item.text}</Text>
              </View>
            ))}
          </View>

          {/* LNURL-auth QR 코드 */}
          {authStatus === 'waiting' && authLnurl ? (
            <View style={{ marginBottom: 24 }}>
              <Text style={{ fontSize: 14, color: '#666666', marginBottom: 12, textAlign: 'center' }}>
                {t('subscription.scanQR')}
              </Text>
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
                  marginBottom: 16,
                }}
                onPress={handleCopyLnurl}
                activeOpacity={0.8}
              >
                <QRCode
                  value={authLnurlEncoded}
                  size={200}
                  backgroundColor="#FFFFFF"
                  color="#000000"
                />
                <Text style={{ marginTop: 12, fontSize: 12, color: copied ? '#22C55E' : '#9CA3AF' }}>
                  {copied ? t('common.copied') : t('subscription.tapToCopy')}
                </Text>
              </TouchableOpacity>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                <ActivityIndicator size="small" color="#F7931A" style={{ marginRight: 8 }} />
                <Text style={{ color: '#666666' }}>{t('subscription.waitingAuth')}</Text>
              </View>
              <TouchableOpacity
                style={{
                  padding: 12,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: '#E5E7EB',
                  alignItems: 'center',
                }}
                onPress={handleCancelAuth}
              >
                <Text style={{ color: '#666666' }}>{t('common.cancel')}</Text>
              </TouchableOpacity>
            </View>
          ) : !user ? (
            <View style={{ marginBottom: 24 }}>
              <Text style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 12 }}>
                {t('subscription.loginRequired')}
              </Text>
              <TouchableOpacity
                style={{
                  backgroundColor: '#F7931A',
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 16,
                  borderRadius: 8,
                  opacity: isStartingAuth ? 0.7 : 1,
                }}
                onPress={handleStartAuth}
                disabled={isStartingAuth}
              >
                {isStartingAuth ? (
                  <ActivityIndicator color="#FFFFFF" style={{ marginRight: 8 }} />
                ) : (
                  <Ionicons name="flash" size={24} color="#FFFFFF" style={{ marginRight: 8 }} />
                )}
                <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '600' }}>
                  {isStartingAuth ? `${t('common.preparing')}...` : t('subscription.loginWithLightning')}
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={{ marginBottom: 24 }}>
              {/* 로그인된 상태 */}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: '#F9FAFB',
                  borderRadius: 12,
                  padding: 16,
                  marginBottom: 12,
                }}
              >
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    backgroundColor: '#F7931A',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: 12,
                  }}
                >
                  <Ionicons name="flash" size={20} color="#FFFFFF" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: '500', color: '#1A1A1A' }}>
                    {t('subscription.lightningConnected')}
                  </Text>
                  <Text style={{ fontSize: 10, color: '#9CA3AF' }} numberOfLines={1}>
                    {user.linking_key?.substring(0, 16)}...
                  </Text>
                </View>
                <TouchableOpacity onPress={handleLogout}>
                  <Text style={{ fontSize: 14, color: '#EF4444' }}>{t('subscription.logout')}</Text>
                </TouchableOpacity>
              </View>

              {/* 구독 상태 */}
              {isSubscribed && subscription ? (
                <View
                  style={{
                    backgroundColor: '#E8F5E9',
                    borderRadius: 12,
                    padding: 16,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                    <Ionicons name="checkmark-circle" size={20} color="#22C55E" style={{ marginRight: 8 }} />
                    <Text style={{ fontSize: 16, fontWeight: '600', color: '#22C55E' }}>
                      {t('subscription.premiumActive')}
                    </Text>
                  </View>
                  {subscription.expires_at && (
                    <Text style={{ fontSize: 14, color: '#666666' }}>
                      {t('subscription.expiresAt', { date: format(new Date(subscription.expires_at), 'PPP', { locale: ko }) })}
                    </Text>
                  )}
                </View>
              ) : (
                <TouchableOpacity
                  style={{
                    backgroundColor: '#F7931A',
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 16,
                    borderRadius: 8,
                    opacity: isStartingPayment ? 0.7 : 1,
                  }}
                  onPress={handleSubscribe}
                  disabled={isStartingPayment}
                >
                  {isStartingPayment ? (
                    <ActivityIndicator color="#FFFFFF" style={{ marginRight: 8 }} />
                  ) : (
                    <Ionicons name="flash" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
                  )}
                  <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '600' }}>
                    {isStartingPayment ? t('subscription.paymentPreparing') : t('subscription.subscribeWithLightning')}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* 무료 기능 안내 */}
          <View
            style={{
              backgroundColor: '#F3F4F6',
              borderRadius: 12,
              padding: 16,
            }}
          >
            <Text style={{ fontSize: 14, fontWeight: '500', color: '#666666', marginBottom: 8 }}>
              {t('subscription.freeLimits')}
            </Text>
            <Text style={{ fontSize: 12, color: '#9CA3AF' }}>
              {t('subscription.freeLimitsDetail', { max: CONFIG.FREE_MAX_CARDS })}
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* 결제 모달 */}
      <Modal
        visible={showPaymentModal}
        transparent
        animationType="slide"
        onRequestClose={handleClosePaymentModal}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}>
          <View
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: 20,
              padding: 24,
              width: '90%',
              maxWidth: 340,
              alignItems: 'center',
            }}
          >
            {/* 모달 헤더 */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: 16 }}>
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#1A1A1A' }}>
                {t('subscription.lightningPayment')}
              </Text>
              <TouchableOpacity onPress={handleClosePaymentModal}>
                <Ionicons name="close" size={24} color="#666666" />
              </TouchableOpacity>
            </View>

            {/* 금액 */}
            <View style={{ marginBottom: 20, alignItems: 'center' }}>
              <Text style={{ fontSize: 14, color: '#666666', marginBottom: 4 }}>{t('subscription.paymentAmount')}</Text>
              <Text style={{ fontSize: 28, fontWeight: 'bold', color: '#F7931A' }}>
                {subscriptionPrice.toLocaleString()} sats
              </Text>
            </View>

            {/* QR 코드 */}
            {lightningInvoice && (
              <TouchableOpacity
                style={{
                  backgroundColor: '#FFFFFF',
                  padding: 16,
                  borderRadius: 16,
                  alignItems: 'center',
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.1,
                  shadowRadius: 8,
                  elevation: 4,
                  marginBottom: 16,
                }}
                onPress={handleCopyInvoice}
                activeOpacity={0.8}
              >
                <QRCode
                  value={lightningInvoice}
                  size={180}
                  backgroundColor="#FFFFFF"
                  color="#000000"
                />
                <Text style={{ marginTop: 12, fontSize: 12, color: invoiceCopied ? '#22C55E' : '#9CA3AF' }}>
                  {invoiceCopied ? t('common.copied') : t('subscription.tapToCopyInvoice')}
                </Text>
              </TouchableOpacity>
            )}

            {/* 상태 표시 */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
              {paymentStatus === 'waiting' && (
                <>
                  <ActivityIndicator size="small" color="#F7931A" style={{ marginRight: 8 }} />
                  <Text style={{ color: '#666666' }}>{t('subscription.waitingPayment')}</Text>
                </>
              )}
              {paymentStatus === 'checking' && (
                <>
                  <ActivityIndicator size="small" color="#F7931A" style={{ marginRight: 8 }} />
                  <Text style={{ color: '#666666' }}>{t('subscription.activating')}</Text>
                </>
              )}
              {paymentStatus === 'success' && (
                <>
                  <Ionicons name="checkmark-circle" size={20} color="#22C55E" style={{ marginRight: 8 }} />
                  <Text style={{ color: '#22C55E', fontWeight: '600' }}>{t('subscription.paymentComplete')}</Text>
                </>
              )}
              {paymentStatus === 'expired' && (
                <>
                  <Ionicons name="close-circle" size={20} color="#EF4444" style={{ marginRight: 8 }} />
                  <Text style={{ color: '#EF4444' }}>{t('subscription.expired')}</Text>
                </>
              )}
              {paymentStatus === 'error' && (
                <>
                  <Ionicons name="warning" size={20} color="#F59E0B" style={{ marginRight: 8 }} />
                  <Text style={{ color: '#F59E0B' }}>{t('subscription.processingError')}</Text>
                </>
              )}
            </View>

            {/* Invoice 미리보기 */}
            {lightningInvoice && (
              <View
                style={{
                  backgroundColor: '#F9FAFB',
                  padding: 10,
                  borderRadius: 8,
                  width: '100%',
                }}
              >
                <Text
                  style={{ fontSize: 9, color: '#9CA3AF', fontFamily: 'monospace' }}
                  numberOfLines={2}
                >
                  {lightningInvoice}
                </Text>
              </View>
            )}

            {/* 안내 문구 */}
            <Text style={{ marginTop: 16, fontSize: 11, color: '#9CA3AF', textAlign: 'center' }}>
              {t('subscription.paymentInstructions')}
            </Text>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
