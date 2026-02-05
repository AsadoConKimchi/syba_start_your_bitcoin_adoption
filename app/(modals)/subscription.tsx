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
import { useSubscriptionStore } from '../../src/stores/subscriptionStore';
import { CONFIG } from '../../src/constants/config';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { waitForPayment, PaymentStatus } from '../../src/services/blinkProxy';

export default function SubscriptionScreen() {
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

  // 결제 모달 상태
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<'waiting' | 'checking' | 'success' | 'expired' | 'error'>('waiting');
  const paymentCancelledRef = useRef(false);

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
    setIsStartingAuth(true);
    try {
      await startLnurlAuth();
    } catch (error) {
      Alert.alert('오류', '로그인 시작에 실패했습니다.');
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
    Alert.alert('로그아웃', '정말 로그아웃 하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      {
        text: '로그아웃',
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
        Alert.alert('오류', '결제 생성에 실패했습니다.');
      }
    } catch (error) {
      Alert.alert('오류', '결제 시작 중 오류가 발생했습니다.');
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
            Alert.alert('결제 완료', '프리미엄 구독이 활성화되었습니다!');
          }, 1500);
        } else {
          setPaymentStatus('error');
          Alert.alert(
            '처리 오류',
            '결제는 완료되었으나 구독 활성화에 실패했습니다. 고객센터에 문의해주세요.'
          );
        }
      } else {
        if (!paymentCancelledRef.current) {
          setPaymentStatus('expired');
          Alert.alert('결제 만료', 'Invoice가 만료되었습니다. 다시 시도해주세요.', [
            { text: '확인', onPress: handleClosePaymentModal },
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
          프리미엄 구독
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
                SYBA 프리미엄
              </Text>
              <Text style={{ fontSize: 12, color: '#666666' }}>
                모든 기능을 잠금 해제하세요
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#F7931A' }}>
                {CONFIG.SUBSCRIPTION_PRICE_SATS.toLocaleString()}
              </Text>
              <Text style={{ fontSize: 11, color: '#666666' }}>sats / 월</Text>
            </View>
          </View>

          {/* 혜택 목록 */}
          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 16, fontWeight: '600', color: '#1A1A1A', marginBottom: 12 }}>
              프리미엄 혜택
            </Text>
            {[
              { icon: 'card', text: '무제한 카드 등록' },
              { icon: 'analytics', text: '상세 통계 및 리포트' },
              { icon: 'notifications', text: '김프 알림' },
              { icon: 'cloud-upload', text: '클라우드 백업' },
              { icon: 'color-palette', text: '커스텀 테마' },
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
                Lightning 지갑으로 QR 코드를 스캔하세요
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
                  value={authLnurl}
                  size={200}
                  backgroundColor="#FFFFFF"
                  color="#000000"
                />
                <Text style={{ marginTop: 12, fontSize: 12, color: copied ? '#22C55E' : '#9CA3AF' }}>
                  {copied ? '복사됨!' : 'QR 탭하여 복사'}
                </Text>
              </TouchableOpacity>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                <ActivityIndicator size="small" color="#F7931A" style={{ marginRight: 8 }} />
                <Text style={{ color: '#666666' }}>인증 대기 중...</Text>
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
                <Text style={{ color: '#666666' }}>취소</Text>
              </TouchableOpacity>
            </View>
          ) : !user ? (
            <View style={{ marginBottom: 24 }}>
              <Text style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 12 }}>
                구독하려면 Lightning 지갑으로 로그인이 필요합니다
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
                  {isStartingAuth ? '준비 중...' : 'Lightning 지갑으로 로그인'}
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
                    Lightning 연결됨
                  </Text>
                  <Text style={{ fontSize: 10, color: '#9CA3AF' }} numberOfLines={1}>
                    {user.linking_key?.substring(0, 16)}...
                  </Text>
                </View>
                <TouchableOpacity onPress={handleLogout}>
                  <Text style={{ fontSize: 14, color: '#EF4444' }}>로그아웃</Text>
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
                      프리미엄 활성화
                    </Text>
                  </View>
                  {subscription.expires_at && (
                    <Text style={{ fontSize: 14, color: '#666666' }}>
                      만료일: {format(new Date(subscription.expires_at), 'yyyy년 M월 d일', { locale: ko })}
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
                    {isStartingPayment ? '결제 준비 중...' : 'Lightning으로 구독하기'}
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
              무료 버전 제한
            </Text>
            <Text style={{ fontSize: 12, color: '#9CA3AF' }}>
              • 카드 등록 최대 {CONFIG.FREE_MAX_CARDS}장{'\n'}
              • 기본 통계만 제공{'\n'}
              • 로컬 백업만 가능
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
                Lightning 결제
              </Text>
              <TouchableOpacity onPress={handleClosePaymentModal}>
                <Ionicons name="close" size={24} color="#666666" />
              </TouchableOpacity>
            </View>

            {/* 금액 */}
            <View style={{ marginBottom: 20, alignItems: 'center' }}>
              <Text style={{ fontSize: 14, color: '#666666', marginBottom: 4 }}>결제 금액</Text>
              <Text style={{ fontSize: 28, fontWeight: 'bold', color: '#F7931A' }}>
                {CONFIG.SUBSCRIPTION_PRICE_SATS.toLocaleString()} sats
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
                  {invoiceCopied ? '복사됨!' : 'QR 탭하여 Invoice 복사'}
                </Text>
              </TouchableOpacity>
            )}

            {/* 상태 표시 */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
              {paymentStatus === 'waiting' && (
                <>
                  <ActivityIndicator size="small" color="#F7931A" style={{ marginRight: 8 }} />
                  <Text style={{ color: '#666666' }}>결제 대기 중...</Text>
                </>
              )}
              {paymentStatus === 'checking' && (
                <>
                  <ActivityIndicator size="small" color="#F7931A" style={{ marginRight: 8 }} />
                  <Text style={{ color: '#666666' }}>구독 활성화 중...</Text>
                </>
              )}
              {paymentStatus === 'success' && (
                <>
                  <Ionicons name="checkmark-circle" size={20} color="#22C55E" style={{ marginRight: 8 }} />
                  <Text style={{ color: '#22C55E', fontWeight: '600' }}>결제 완료!</Text>
                </>
              )}
              {paymentStatus === 'expired' && (
                <>
                  <Ionicons name="close-circle" size={20} color="#EF4444" style={{ marginRight: 8 }} />
                  <Text style={{ color: '#EF4444' }}>만료됨</Text>
                </>
              )}
              {paymentStatus === 'error' && (
                <>
                  <Ionicons name="warning" size={20} color="#F59E0B" style={{ marginRight: 8 }} />
                  <Text style={{ color: '#F59E0B' }}>처리 오류</Text>
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
              Lightning 지갑으로 QR 코드를 스캔하거나{'\n'}Invoice를 복사하여 결제해주세요
            </Text>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
