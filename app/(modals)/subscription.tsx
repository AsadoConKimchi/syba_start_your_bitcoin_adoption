import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
  Modal,
  TextInput,
  Linking,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../src/hooks/useTheme';
import { useSubscriptionStore } from '../../src/stores/subscriptionStore';
import { CONFIG } from '../../src/constants/config';
// getSubscriptionPriceSats는 더 이상 사용하지 않음 — subscription_prices 단일 소스 사용
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { waitForPaymentWs, PaymentStatus } from '../../src/services/blinkProxy';
import { lastLnurlError } from '../../src/services/lnurlAuth';
import type { SubscriptionTier } from '../../src/types/subscription';

export default function SubscriptionScreen() {
  const { t } = useTranslation();
  const { theme } = useTheme();
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
    // v2: tier & discount
    availableTiers,
    selectedTier,
    discountCode,
    priceCalculation,
    isCalculatingPrice,
    loadTierPrices,
    selectTier,
    setDiscountCode,
    applyDiscountCode,
  } = useSubscriptionStore();

  const [isStartingAuth, setIsStartingAuth] = useState(false);
  const [isStartingPayment, setIsStartingPayment] = useState(false);
  const [copied, setCopied] = useState(false);
  const [invoiceCopied, setInvoiceCopied] = useState(false);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  // subscriptionPrice state 제거 — availableTiers에서 직접 읽음
  const [discountMessage, setDiscountMessage] = useState<string>('');
  const [discountApplied, setDiscountApplied] = useState(false);

  // 결제 모달 상태
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<'waiting' | 'checking' | 'success' | 'expired' | 'error'>('waiting');
  const paymentCancelledRef = useRef(false);
  const isProcessingRef = useRef(false);

  const handleCopyLnurl = async () => {
    if (authLnurlEncoded) {
      await Clipboard.setStringAsync(authLnurlEncoded);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleCopyInvoice = async () => {
    if (lightningInvoice) {
      await Clipboard.setStringAsync(lightningInvoice);
      setInvoiceCopied(true);
      setTimeout(() => setInvoiceCopied(false), 2000);
    }
  };

  useEffect(() => {
    initialize();
    loadTierPrices();
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

  const handleApplyDiscount = async () => {
    if (!discountCode.trim()) return;
    const result = await applyDiscountCode();
    if (result.valid) {
      setDiscountApplied(true);
      setDiscountMessage(t('subscription.discountApplied'));
    } else {
      setDiscountApplied(false);
      setDiscountMessage(result.reason || t('subscription.discountInvalid'));
    }
    setTimeout(() => setDiscountMessage(''), 3000);
  };

  const handleWebPayment = () => {
    if (!user) return;
    const url = `${CONFIG.WEB_PAYMENT_URL}?uid=${user.id}&tier=${selectedTier}`;
    Linking.openURL(url);
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
      const paid = await waitForPaymentWs(
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
        10 * 60 * 1000 // 10분
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
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={theme.primary} />
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
          {t('subscription.title')}
        </Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="close" size={24} color={theme.textSecondary} />
        </TouchableOpacity>
      </View>

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        {/* 프리미엄 헤더 + 가격 (컴팩트) */}
        <View style={{ padding: 20 }}>
          <View
            style={{
              backgroundColor: theme.warningBanner,
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
                backgroundColor: theme.primary,
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 12,
              }}
            >
              <Ionicons name="diamond" size={24} color="#FFFFFF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: theme.text }}>
                {t('subscription.sybaPremium')}
              </Text>
              <Text style={{ fontSize: 12, color: theme.textSecondary }}>
                {t('subscription.unlockAll')}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ fontSize: 20, fontWeight: 'bold', color: theme.primary }}>
                {(() => {
                  const tierInfo = availableTiers.find(p => p.tier === selectedTier);
                  const price = tierInfo?.price_sats ?? CONFIG.SUBSCRIPTION_TIERS[selectedTier].price;
                  return price.toLocaleString();
                })()}
              </Text>
              <Text style={{ fontSize: 11, color: theme.textSecondary }}>
                {selectedTier === 'monthly' ? t('subscription.pricePerMonth')
                  : selectedTier === 'annual' ? t('subscription.pricePerYear')
                  : t('subscription.priceLifetime')}
              </Text>
            </View>
          </View>

          {/* 혜택 목록 */}
          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 16, fontWeight: '600', color: theme.text, marginBottom: 12 }}>
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
                    backgroundColor: theme.incomeButtonBg,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: 12,
                  }}
                >
                  <Ionicons name={item.icon as any} size={16} color={theme.success} />
                </View>
                <Text style={{ fontSize: 14, color: theme.text }}>{item.text}</Text>
              </View>
            ))}
          </View>

          {/* v2: 구독 티어 선택 */}
          {user && !isSubscribed && (
            <View style={{ marginBottom: 24 }}>
              <Text style={{ fontSize: 16, fontWeight: '600', color: theme.text, marginBottom: 12 }}>
                {t('subscription.selectPlan')}
              </Text>

              {/* 티어 카드 3개 */}
              {(['monthly', 'annual', 'lifetime'] as SubscriptionTier[]).map((tier) => {
                const tierInfo = availableTiers.find(p => p.tier === tier);
                const price = tierInfo?.price_sats ?? CONFIG.SUBSCRIPTION_TIERS[tier].price;
                const isSelected = selectedTier === tier;
                const isSoldOut = tierInfo ? tierInfo.max_quantity !== -1 && tierInfo.current_sold >= tierInfo.max_quantity : false;
                const remaining = tierInfo && tierInfo.max_quantity !== -1 ? tierInfo.max_quantity - tierInfo.current_sold : null;

                const labels: Record<SubscriptionTier, { name: string; desc: string; badge?: string }> = {
                  monthly:  { name: t('subscription.tierMonthly'), desc: `${price.toLocaleString()} ${t('subscription.pricePerMonth')}` },
                  annual:   { name: t('subscription.tierAnnual'), desc: `${price.toLocaleString()} ${t('subscription.pricePerYear')}`, badge: t('subscription.badgeFreeMonths') },
                  lifetime: { name: t('subscription.tierLifetime'), desc: `${price.toLocaleString()} sats`, badge: remaining !== null ? t('subscription.badgeRemaining', { count: remaining }) : undefined },
                };
                const label = labels[tier];

                return (
                  <TouchableOpacity
                    key={tier}
                    style={{
                      borderWidth: 2,
                      borderColor: isSelected ? theme.primary : theme.border,
                      borderRadius: 12,
                      padding: 16,
                      marginBottom: 8,
                      backgroundColor: isSoldOut ? theme.backgroundTertiary : isSelected ? theme.primaryLight || `${theme.primary}15` : theme.background,
                      opacity: isSoldOut ? 0.5 : 1,
                    }}
                    onPress={() => !isSoldOut && selectTier(tier)}
                    disabled={isSoldOut}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <View
                          style={{
                            width: 20, height: 20, borderRadius: 10,
                            borderWidth: 2,
                            borderColor: isSelected ? theme.primary : theme.border,
                            backgroundColor: isSelected ? theme.primary : 'transparent',
                            alignItems: 'center', justifyContent: 'center', marginRight: 12,
                          }}
                        >
                          {isSelected && <Ionicons name="checkmark" size={12} color="#FFFFFF" />}
                        </View>
                        <View>
                          <Text style={{ fontSize: 16, fontWeight: '600', color: isSoldOut ? theme.textMuted : theme.text }}>
                            {label.name} {isSoldOut ? t('subscription.soldOut') : ''}
                          </Text>
                          <Text style={{ fontSize: 13, color: theme.textSecondary }}>{label.desc}</Text>
                        </View>
                      </View>
                      {label.badge && (
                        <View style={{ backgroundColor: tier === 'lifetime' ? theme.warning : theme.success, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                          <Text style={{ fontSize: 11, fontWeight: '600', color: '#FFFFFF' }}>{label.badge}</Text>
                        </View>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}

              {/* 할인코드 입력 */}
              <View style={{ marginTop: 12 }}>
                <Text style={{ fontSize: 13, color: theme.textSecondary, marginBottom: 6 }}>{t('subscription.discountCode')}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <TextInput
                    style={{
                      flex: 1,
                      borderWidth: 1,
                      borderColor: discountApplied ? theme.success : theme.border,
                      borderRadius: 8,
                      padding: 12,
                      fontSize: 14,
                      color: theme.text,
                      backgroundColor: theme.backgroundSecondary,
                      marginRight: 8,
                    }}
                    placeholder={t('subscription.discountCodePlaceholder')}
                    placeholderTextColor={theme.textMuted}
                    value={discountCode}
                    onChangeText={setDiscountCode}
                    autoCapitalize="characters"
                  />
                  <TouchableOpacity
                    style={{
                      backgroundColor: theme.primary,
                      borderRadius: 8,
                      paddingHorizontal: 16,
                      paddingVertical: 12,
                    }}
                    onPress={handleApplyDiscount}
                  >
                    <Text style={{ color: '#FFFFFF', fontWeight: '600' }}>{t('subscription.discountApply')}</Text>
                  </TouchableOpacity>
                </View>
                {discountMessage !== '' && (
                  <Text style={{ fontSize: 12, color: discountApplied ? theme.success : theme.error, marginTop: 4 }}>
                    {discountMessage}
                  </Text>
                )}
              </View>

              {/* 가격 요약 */}
              {priceCalculation && (
                <View style={{ marginTop: 12, backgroundColor: theme.backgroundSecondary, borderRadius: 8, padding: 12 }}>
                  {priceCalculation.discountAmount > 0 && (
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                      <Text style={{ fontSize: 13, color: theme.textSecondary }}>{t('subscription.originalPrice')}</Text>
                      <Text style={{ fontSize: 13, color: theme.textSecondary, textDecorationLine: 'line-through' }}>
                        {priceCalculation.originalPrice.toLocaleString()} sats
                      </Text>
                    </View>
                  )}
                  {priceCalculation.discountAmount > 0 && (
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                      <Text style={{ fontSize: 13, color: theme.success }}>{t('subscription.discountLabel')}</Text>
                      <Text style={{ fontSize: 13, color: theme.success }}>
                        -{priceCalculation.discountAmount.toLocaleString()} sats
                      </Text>
                    </View>
                  )}
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: theme.text }}>{t('subscription.paymentTotal')}</Text>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: theme.primary }}>
                      {isCalculatingPrice ? '...' : `${priceCalculation.finalPrice.toLocaleString()} sats`}
                    </Text>
                  </View>
                </View>
              )}

              {/* 웹 결제 옵션 */}
              <TouchableOpacity
                style={{
                  marginTop: 12,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 12,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: theme.border,
                }}
                onPress={handleWebPayment}
              >
                <Ionicons name="globe-outline" size={18} color={theme.textSecondary} style={{ marginRight: 8 }} />
                <Text style={{ fontSize: 14, color: theme.textSecondary }}>{t('subscription.payOnWeb')}</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* 구독 상태 — lifetime 표시 */}
          {isSubscribed && subscription?.is_lifetime && (
            <View style={{ marginBottom: 16, backgroundColor: theme.incomeButtonBg, borderRadius: 12, padding: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="infinite" size={22} color={theme.success} style={{ marginRight: 8 }} />
                <Text style={{ fontSize: 16, fontWeight: '600', color: theme.success }}>{t('subscription.lifetimeActive')}</Text>
              </View>
            </View>
          )}

          {/* LNURL-auth QR 코드 */}
          {authStatus === 'waiting' && authLnurl ? (
            <View style={{ marginBottom: 24 }}>
              <Text style={{ fontSize: 14, color: theme.textSecondary, marginBottom: 12, textAlign: 'center' }}>
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
                  value={authLnurlEncoded ?? undefined}
                  size={200}
                  backgroundColor="#FFFFFF"
                  color="#000000"
                />
                <Text style={{ marginTop: 12, fontSize: 12, color: copied ? theme.success : theme.textMuted }}>
                  {copied ? t('common.copied') : t('subscription.tapToCopy')}
                </Text>
              </TouchableOpacity>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                <ActivityIndicator size="small" color={theme.primary} style={{ marginRight: 8 }} />
                <Text style={{ color: theme.textSecondary }}>{t('subscription.waitingAuth')}</Text>
              </View>
              <TouchableOpacity
                style={{
                  padding: 12,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: theme.border,
                  alignItems: 'center',
                }}
                onPress={handleCancelAuth}
              >
                <Text style={{ color: theme.textSecondary }}>{t('common.cancel')}</Text>
              </TouchableOpacity>
            </View>
          ) : !user ? (
            <View style={{ marginBottom: 24 }}>
              <Text style={{ fontSize: 12, color: theme.textMuted, marginBottom: 12 }}>
                {t('subscription.loginRequired')}
              </Text>
              <TouchableOpacity
                style={{
                  backgroundColor: theme.primary,
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
                  backgroundColor: theme.backgroundSecondary,
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
                    backgroundColor: theme.primary,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: 12,
                  }}
                >
                  <Ionicons name="flash" size={20} color="#FFFFFF" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: '500', color: theme.text }}>
                    {t('subscription.lightningConnected')}
                  </Text>
                  <Text style={{ fontSize: 10, color: theme.textMuted }} numberOfLines={1}>
                    {user.linking_key?.substring(0, 16)}...
                  </Text>
                </View>
                <TouchableOpacity onPress={handleLogout}>
                  <Text style={{ fontSize: 14, color: theme.error }}>{t('subscription.logout')}</Text>
                </TouchableOpacity>
              </View>

              {/* 구독 상태 */}
              {isSubscribed && subscription ? (
                <View
                  style={{
                    backgroundColor: theme.incomeButtonBg,
                    borderRadius: 12,
                    padding: 16,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                    <Ionicons name={subscription.is_lifetime ? 'infinite' : 'checkmark-circle'} size={20} color={theme.success} style={{ marginRight: 8 }} />
                    <Text style={{ fontSize: 16, fontWeight: '600', color: theme.success }}>
                      {subscription.is_lifetime ? t('subscription.lifetimeActive') : t('subscription.premiumActive')}
                    </Text>
                  </View>
                  {subscription.expires_at && !subscription.is_lifetime && (
                    <Text style={{ fontSize: 14, color: theme.textSecondary }}>
                      {t('subscription.expiresAt', { date: format(new Date(subscription.expires_at), 'PPP', { locale: ko }) })}
                    </Text>
                  )}
                </View>
              ) : (
                <TouchableOpacity
                  style={{
                    backgroundColor: theme.primary,
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
              backgroundColor: theme.backgroundTertiary,
              borderRadius: 12,
              padding: 16,
            }}
          >
            <Text style={{ fontSize: 14, fontWeight: '500', color: theme.textSecondary, marginBottom: 8 }}>
              {t('subscription.freeLimits')}
            </Text>
            <Text style={{ fontSize: 12, color: theme.textMuted }}>
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
        <View style={{ flex: 1, backgroundColor: theme.modalOverlay, justifyContent: 'center', alignItems: 'center' }}>
          <View
            style={{
              backgroundColor: theme.modalBackground,
              borderRadius: 20,
              padding: 24,
              width: '90%',
              maxWidth: 340,
              alignItems: 'center',
            }}
          >
            {/* 모달 헤더 */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: 16 }}>
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: theme.text }}>
                {t('subscription.lightningPayment')}
              </Text>
              <TouchableOpacity onPress={handleClosePaymentModal}>
                <Ionicons name="close" size={24} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* 금액 */}
            <View style={{ marginBottom: 20, alignItems: 'center' }}>
              <Text style={{ fontSize: 14, color: theme.textSecondary, marginBottom: 4 }}>{t('subscription.paymentAmount')}</Text>
              <Text style={{ fontSize: 28, fontWeight: 'bold', color: theme.primary }}>
                {(priceCalculation?.finalPrice ?? (() => {
                  const tierInfo = availableTiers.find(p => p.tier === selectedTier);
                  return tierInfo?.price_sats ?? CONFIG.SUBSCRIPTION_TIERS[selectedTier].price;
                })()).toLocaleString()} sats
              </Text>
              {priceCalculation && priceCalculation.discountAmount > 0 && (
                <Text style={{ fontSize: 12, color: theme.success, marginTop: 2 }}>
                  {t('subscription.discountAppliedAmount', { amount: priceCalculation.discountAmount.toLocaleString() })}
                </Text>
              )}
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
                <Text style={{ marginTop: 12, fontSize: 12, color: invoiceCopied ? theme.success : theme.textMuted }}>
                  {invoiceCopied ? t('common.copied') : t('subscription.tapToCopyInvoice')}
                </Text>
              </TouchableOpacity>
            )}

            {/* 상태 표시 */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
              {paymentStatus === 'waiting' && (
                <>
                  <ActivityIndicator size="small" color={theme.primary} style={{ marginRight: 8 }} />
                  <Text style={{ color: theme.textSecondary }}>{t('subscription.waitingPayment')}</Text>
                </>
              )}
              {paymentStatus === 'checking' && (
                <>
                  <ActivityIndicator size="small" color={theme.primary} style={{ marginRight: 8 }} />
                  <Text style={{ color: theme.textSecondary }}>{t('subscription.activating')}</Text>
                </>
              )}
              {paymentStatus === 'success' && (
                <>
                  <Ionicons name="checkmark-circle" size={20} color={theme.success} style={{ marginRight: 8 }} />
                  <Text style={{ color: theme.success, fontWeight: '600' }}>{t('subscription.paymentComplete')}</Text>
                </>
              )}
              {paymentStatus === 'expired' && (
                <>
                  <Ionicons name="close-circle" size={20} color={theme.error} style={{ marginRight: 8 }} />
                  <Text style={{ color: theme.error }}>{t('subscription.expired')}</Text>
                </>
              )}
              {paymentStatus === 'error' && (
                <>
                  <Ionicons name="warning" size={20} color="#F59E0B" style={{ marginRight: 8 }} />
                  <Text style={{ color: theme.warning }}>{t('subscription.processingError')}</Text>
                </>
              )}
            </View>

            {/* Invoice 미리보기 */}
            {lightningInvoice && (
              <View
                style={{
                  backgroundColor: theme.backgroundSecondary,
                  padding: 10,
                  borderRadius: 8,
                  width: '100%',
                }}
              >
                <Text
                  style={{ fontSize: 9, color: theme.textMuted, fontFamily: 'monospace' }}
                  numberOfLines={2}
                >
                  {lightningInvoice}
                </Text>
              </View>
            )}

            {/* 안내 문구 */}
            <Text style={{ marginTop: 16, fontSize: 11, color: theme.textMuted, textAlign: 'center' }}>
              {t('subscription.paymentInstructions')}
            </Text>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
