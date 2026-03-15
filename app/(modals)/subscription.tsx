import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
  TextInput,
  Linking,
  AppState,
  Clipboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import QRCode from 'react-native-qrcode-svg';
import { useTheme } from '../../src/hooks/useTheme';
import { useSubscriptionStore } from '../../src/stores/subscriptionStore';
import { CONFIG } from '../../src/constants/config';
import { format } from 'date-fns';
import type { Locale } from 'date-fns';
import { ko, enUS, es, ja } from 'date-fns/locale';
import i18n from '../../src/i18n';
import type { SubscriptionTier } from '../../src/types/subscription';

const DATE_LOCALE_MAP: Record<string, Locale> = { ko, en: enUS, es, ja };
function getDateLocale(): Locale {
  return DATE_LOCALE_MAP[i18n.language] || ko;
}

export default function SubscriptionScreen() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const {
    user,
    subscription,
    isLoading,
    isSubscribed,
    initialize,
    refreshSubscription,
    // LNURL-auth
    authLnurlEncoded,
    authStatus,
    startLnurlAuth,
    checkLnurlAuthStatus,
    cancelLnurlAuth,
    logout,
    // v2: tier & discount
    availableTiers,
    selectedTier,
    loadTierPrices,
    selectTier,
    // email & payment history
    updateEmail,
    loadPaymentHistory,
    paymentHistory,
  } = useSubscriptionStore();

  const [emailInput, setEmailInput] = useState('');
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailSaved, setEmailSaved] = useState(false);
  const webPaymentPollingRef = useRef<NodeJS.Timeout | null>(null);
  const lnurlPollingRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    initialize();
    loadTierPrices();
  }, []);

  // 구독 후 email/결제 내역 로드
  useEffect(() => {
    if (user && isSubscribed) {
      loadPaymentHistory();
      if (user.email) {
        setEmailInput(user.email);
      }
    }
  }, [user, isSubscribed]);

  const handleSaveEmail = async () => {
    const trimmed = emailInput.trim();
    if (!trimmed) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      Alert.alert(t('common.error'), t('settings.emailInvalid'));
      return;
    }
    setEmailSaving(true);
    const success = await updateEmail(emailInput.trim());
    setEmailSaving(false);
    if (success) {
      setEmailSaved(true);
      setTimeout(() => setEmailSaved(false), 2000);
    }
  };

  const stopWebPaymentPolling = useCallback(() => {
    if (webPaymentPollingRef.current) {
      clearInterval(webPaymentPollingRef.current);
      webPaymentPollingRef.current = null;
    }
  }, []);

  const stopLnurlPolling = useCallback(() => {
    if (lnurlPollingRef.current) {
      clearInterval(lnurlPollingRef.current);
      lnurlPollingRef.current = null;
    }
  }, []);

  const handleStartLnurlAuth = async () => {
    const lnurl = await startLnurlAuth();
    if (!lnurl) {
      Alert.alert(t('common.error'), t('subscription.lnurlFailed') + '\n' + t('subscription.lnurlFailedDetail'));
      return;
    }
    // 3초마다 인증 상태 폴링
    lnurlPollingRef.current = setInterval(async () => {
      const success = await checkLnurlAuthStatus();
      if (success) {
        stopLnurlPolling();
        loadTierPrices();
      }
    }, 3000);
  };

  const handleLogout = () => {
    Alert.alert(
      t('subscription.logout'),
      t('subscription.logoutConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('subscription.logout'),
          style: 'destructive',
          onPress: async () => {
            stopLnurlPolling();
            await logout();
          },
        },
      ]
    );
  };

  // 컴포넌트 언마운트 시 폴링 정리
  useEffect(() => {
    return () => {
      stopLnurlPolling();
    };
  }, []);

  // 웹에서 구독 관리 → 외부 브라우저 열기
  const handleManageOnWeb = () => {
    const url = user
      ? `${CONFIG.WEB_PAYMENT_URL}?uid=${user.id}&tier=${selectedTier}`
      : CONFIG.WEB_PAYMENT_URL;
    Linking.openURL(url);

    // 결제 완료 후 구독 상태 폴링 (5초마다)
    stopWebPaymentPolling();
    webPaymentPollingRef.current = setInterval(async () => {
      await refreshSubscription();
      const { isSubscribed: nowSubscribed } = useSubscriptionStore.getState();
      if (nowSubscribed) {
        stopWebPaymentPolling();
        Alert.alert(t('subscription.paymentComplete'), t('subscription.paymentDone'));
      }
    }, 5000);
  };

  // 백그라운드 복귀 시 즉시 확인
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && webPaymentPollingRef.current) {
        refreshSubscription().then(() => {
          const { isSubscribed: nowSubscribed } = useSubscriptionStore.getState();
          if (nowSubscribed) {
            stopWebPaymentPolling();
            Alert.alert(t('subscription.paymentComplete'), t('subscription.paymentDone'));
          }
        });
      }
    });
    return () => {
      sub.remove();
      stopWebPaymentPolling();
    };
  }, []);

  if (isLoading) {
    return (
      <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={{ flex: 1, backgroundColor: theme.background, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={theme.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={{ flex: 1, backgroundColor: theme.background }}>
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
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          {user && (
            <TouchableOpacity onPress={handleLogout}>
              <Ionicons name="log-out-outline" size={22} color={theme.textSecondary} />
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="close" size={24} color={theme.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        <View style={{ padding: 20 }}>
          {/* 프리미엄 헤더 */}
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
            {([
              { icon: 'card' as const, text: t('subscription.unlimitedCards') },
              { icon: 'analytics' as const, text: t('subscription.detailedStats') },
              { icon: 'notifications' as const, text: t('subscription.premiumAlert') },
              { icon: 'cloud-upload' as const, text: t('subscription.cloudBackup') },
              { icon: 'color-palette' as const, text: t('subscription.customTheme') },
            ] as const).map((item, index) => (
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
                  <Ionicons name={item.icon} size={16} color={theme.success} />
                </View>
                <Text style={{ fontSize: 14, color: theme.text }}>{item.text}</Text>
              </View>
            ))}
          </View>

          {/* LNurl 로그인 섹션 (미로그인 시) */}
          {!user && (
            <View style={{ marginBottom: 24 }}>
              {authStatus === 'idle' ? (
                <TouchableOpacity
                  style={{
                    backgroundColor: theme.warning,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 16,
                    borderRadius: 12,
                  }}
                  onPress={handleStartLnurlAuth}
                >
                  <Ionicons name="flash" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
                  <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '600' }}>
                    {t('subscription.loginWithLightning')}
                  </Text>
                </TouchableOpacity>
              ) : authStatus === 'waiting' && authLnurlEncoded ? (
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: 14, color: theme.textSecondary, marginBottom: 16, textAlign: 'center' }}>
                    {t('subscription.scanQR')}
                  </Text>
                  <TouchableOpacity
                    onPress={() => {
                      Clipboard.setString(authLnurlEncoded);
                      Alert.alert(t('common.done'), t('subscription.tapToCopy'));
                    }}
                    style={{ padding: 12, backgroundColor: '#FFFFFF', borderRadius: 12 }}
                  >
                    <QRCode value={authLnurlEncoded} size={200} />
                  </TouchableOpacity>
                  <Text style={{ fontSize: 12, color: theme.textMuted, marginTop: 8 }}>
                    {t('subscription.tapToCopy')}
                  </Text>
                  <ActivityIndicator size="small" color={theme.primary} style={{ marginTop: 16 }} />
                  <TouchableOpacity
                    style={{ marginTop: 12, padding: 8 }}
                    onPress={() => { stopLnurlPolling(); cancelLnurlAuth(); }}
                  >
                    <Text style={{ fontSize: 14, color: theme.textMuted }}>{t('common.cancel')}</Text>
                  </TouchableOpacity>
                </View>
              ) : authStatus === 'error' ? (
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: 14, color: theme.error, marginBottom: 12, textAlign: 'center' }}>
                    {t('subscription.lnurlFailed')}
                  </Text>
                  <TouchableOpacity
                    style={{ backgroundColor: theme.warning, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 }}
                    onPress={() => { cancelLnurlAuth(); handleStartLnurlAuth(); }}
                  >
                    <Text style={{ color: '#FFFFFF', fontWeight: '600' }}>{t('common.retry')}</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
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

          {/* 구독 상태 — 일반 */}
          {isSubscribed && subscription && !subscription.is_lifetime && (
            <View
              style={{
                backgroundColor: theme.incomeButtonBg,
                borderRadius: 12,
                padding: 16,
                marginBottom: 16,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                <Ionicons name="checkmark-circle" size={20} color={theme.success} style={{ marginRight: 8 }} />
                <Text style={{ fontSize: 16, fontWeight: '600', color: theme.success }}>
                  {t('subscription.premiumActive')}
                </Text>
              </View>
              {subscription.expires_at && (
                <Text style={{ fontSize: 14, color: theme.textSecondary }}>
                  {t('subscription.expiresAt', { date: format(new Date(subscription.expires_at), 'PPP', { locale: getDateLocale() }) })}
                </Text>
              )}
            </View>
          )}

          {/* 미구독 시: 티어 선택 + 웹 결제 버튼 */}
          {!isSubscribed && (
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

              {/* 웹에서 구독하기 버튼 */}
              <TouchableOpacity
                style={{
                  backgroundColor: theme.primary,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 16,
                  borderRadius: 12,
                  marginTop: 16,
                }}
                onPress={handleManageOnWeb}
              >
                <Ionicons name="globe-outline" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
                <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '600' }}>
                  {t('subscription.subscribeOnWeb')}
                </Text>
              </TouchableOpacity>

              <Text style={{ fontSize: 12, color: theme.textMuted, textAlign: 'center', marginTop: 8 }}>
                {t('subscription.webPaymentNote')}
              </Text>
            </View>
          )}

          {/* Email input (구독자용, 선택) */}
          {isSubscribed && (
            <View style={{ marginBottom: 16 }}>
              <Text style={{ fontSize: 13, color: theme.textSecondary, marginBottom: 6 }}>
                {t('settings.emailOptional')}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <TextInput
                  style={{
                    flex: 1,
                    borderWidth: 1,
                    borderColor: emailSaved ? theme.success : theme.border,
                    borderRadius: 8,
                    padding: 12,
                    fontSize: 14,
                    color: theme.text,
                    backgroundColor: theme.backgroundSecondary,
                    marginRight: 8,
                  }}
                  placeholder={t('settings.emailPlaceholder')}
                  placeholderTextColor={theme.textMuted}
                  value={emailInput}
                  onChangeText={setEmailInput}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
                <TouchableOpacity
                  style={{
                    backgroundColor: theme.primary,
                    borderRadius: 8,
                    paddingHorizontal: 16,
                    paddingVertical: 12,
                    opacity: emailSaving ? 0.7 : 1,
                  }}
                  onPress={handleSaveEmail}
                  disabled={emailSaving}
                >
                  {emailSaving ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={{ color: '#FFFFFF', fontWeight: '600' }}>
                      {emailSaved ? t('settings.emailSaved') : t('common.save')}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Payment History */}
          {isSubscribed && paymentHistory.length > 0 && (
            <View style={{ marginBottom: 16 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: theme.text, marginBottom: 8 }}>
                {t('settings.paymentHistory')}
              </Text>
              {paymentHistory.map((payment) => (
                <View
                  key={payment.id}
                  style={{
                    backgroundColor: theme.backgroundSecondary,
                    borderRadius: 8,
                    padding: 12,
                    marginBottom: 6,
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <View>
                    <Text style={{ fontSize: 13, fontWeight: '500', color: theme.text }}>
                      {payment.tier === 'monthly' ? t('subscription.tierMonthly')
                        : payment.tier === 'annual' ? t('subscription.tierAnnual')
                        : t('subscription.tierLifetime')}
                    </Text>
                    {payment.paid_at && (
                      <Text style={{ fontSize: 11, color: theme.textMuted }}>
                        {format(new Date(payment.paid_at), 'PPP', { locale: getDateLocale() })}
                      </Text>
                    )}
                  </View>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: theme.primary }}>
                    {payment.amount_sats.toLocaleString()} sats
                  </Text>
                </View>
              ))}
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
    </SafeAreaView>
  );
}
