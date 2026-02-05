import { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useCardStore } from '../../src/stores/cardStore';
import { useAssetStore } from '../../src/stores/assetStore';
import { useSubscriptionStore } from '../../src/stores/subscriptionStore';
import { CARD_COMPANIES, CardCompanyId } from '../../src/constants/cardCompanies';
import { CardType, getPaymentDayOptions, getBillingPeriodForCard } from '../../src/types/card';
import { CARD_COMPANY_BILLING_RULES } from '../../src/constants/billingPeriods';
import { isFiatAsset } from '../../src/types/asset';

const CARD_COLORS = [
  '#1A1A1A', // Black
  '#3B82F6', // Blue
  '#22C55E', // Green
  '#F7931A', // Bitcoin Orange
  '#EF4444', // Red
  '#8B5CF6', // Purple
  '#EC4899', // Pink
  '#F59E0B', // Amber
];

export default function AddCardScreen() {
  const [name, setName] = useState('');
  const [company, setCompany] = useState<CardCompanyId | null>(null);
  const [cardType, setCardType] = useState<CardType>('credit');
  const [color, setColor] = useState(CARD_COLORS[0]);
  const [paymentDay, setPaymentDay] = useState<number | null>(null);
  const [billingStartDay, setBillingStartDay] = useState<number | null>(null);
  const [billingEndDay, setBillingEndDay] = useState<number | null>(null);
  const [showPaymentDayPicker, setShowPaymentDayPicker] = useState(false);
  const [linkedAssetId, setLinkedAssetId] = useState<string | null>(null);
  const [showAssetPicker, setShowAssetPicker] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const { addCard, cards } = useCardStore();
  const { assets } = useAssetStore();
  const { isSubscribed } = useSubscriptionStore();

  // 무료 사용자 카드 3장 제한
  const FREE_CARD_LIMIT = 3;

  // 법정화폐 자산만 필터링 (결제 계좌용)
  const fiatAssets = assets.filter(isFiatAsset);

  // 카드사별 가용 결제일 목록
  const availablePaymentDays = useMemo(() => {
    if (!company) return [];
    return getPaymentDayOptions(company);
  }, [company]);

  // 카드사 변경 시 결제일 초기화 (해당 카드사에서 지원하지 않는 결제일인 경우)
  useEffect(() => {
    if (company && paymentDay && !availablePaymentDays.includes(paymentDay)) {
      setPaymentDay(null);
      setBillingStartDay(null);
      setBillingEndDay(null);
    }
  }, [company, availablePaymentDays]);

  // 결제일 선택 시 카드사별 산정기간 자동 설정
  useEffect(() => {
    if (paymentDay && company) {
      const { startDay, endDay } = getBillingPeriodForCard(company, paymentDay);
      setBillingStartDay(startDay);
      setBillingEndDay(endDay);
    }
  }, [paymentDay, company]);

  // 산정기간 설명 텍스트 생성
  const billingPeriodText = useMemo(() => {
    if (!paymentDay || !company || !billingStartDay || !billingEndDay) return null;

    const rules = CARD_COMPANY_BILLING_RULES[company]?.rules[paymentDay];
    if (!rules) return `전월 ${billingStartDay}일 ~ 당월 ${billingEndDay}일`;

    const startMonth = rules.start.monthOffset === -2 ? '전전월' : '전월';
    const endMonth = rules.end.monthOffset === -1 ? '전월' : '당월';

    return `${startMonth} ${billingStartDay}일 ~ ${endMonth} ${billingEndDay}일`;
  }, [paymentDay, company, billingStartDay, billingEndDay]);

  const selectedCompanyName = company
    ? CARD_COMPANIES.find(c => c.id === company)?.name ?? ''
    : '';

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('오류', '카드 이름을 입력해주세요.');
      return;
    }

    if (!company) {
      Alert.alert('오류', '카드사를 선택해주세요.');
      return;
    }

    // 무료 사용자 카드 3장 제한 체크
    if (!isSubscribed && cards.length >= FREE_CARD_LIMIT) {
      Alert.alert(
        '카드 등록 제한',
        `무료 사용자는 최대 ${FREE_CARD_LIMIT}장까지 등록할 수 있습니다.\n\n프리미엄 구독 시 무제한으로 등록할 수 있습니다.`,
        [
          { text: '취소', style: 'cancel' },
          {
            text: '프리미엄 구독',
            onPress: () => router.push('/(modals)/subscription'),
          },
        ]
      );
      return;
    }

    setIsLoading(true);

    try {
      await addCard({
        name: name.trim(),
        company,
        type: cardType,
        color,
        isDefault: false,
        ...(cardType === 'credit' && paymentDay
          ? {
              paymentDay,
              billingStartDay: billingStartDay || undefined,
              billingEndDay: billingEndDay || undefined,
            }
          : {}),
        ...(cardType === 'credit' && linkedAssetId ? { linkedAssetId } : {}),
      });

      router.back();
    } catch (error) {
      Alert.alert('오류', '카드 등록에 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
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
          <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#1A1A1A' }}>카드 등록</Text>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="close" size={24} color="#666666" />
          </TouchableOpacity>
        </View>

        <ScrollView style={{ flex: 1, padding: 20 }}>
          {/* 카드 미리보기 */}
          <View
            style={{
              backgroundColor: color,
              borderRadius: 12,
              padding: 20,
              marginBottom: 24,
              height: 180,
              justifyContent: 'space-between',
            }}
          >
            <View>
              <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>
                {selectedCompanyName || '카드사'}
              </Text>
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#FFFFFF', marginTop: 4 }}>
                {name || '카드 이름'}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <Text style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)' }}>
                {cardType === 'credit' ? '신용카드' : cardType === 'debit' ? '체크카드' : '선불카드'}
              </Text>
              <Ionicons name="card" size={32} color="rgba(255,255,255,0.5)" />
            </View>
          </View>

          {/* 카드 이름 */}
          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 14, color: '#666666', marginBottom: 8 }}>카드 이름</Text>
            <TextInput
              style={{
                borderWidth: 1,
                borderColor: '#E5E7EB',
                borderRadius: 8,
                padding: 12,
                fontSize: 16,
              }}
              placeholder="예: 내 신용카드"
              value={name}
              onChangeText={setName}
            />
          </View>

          {/* 카드사 */}
          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 14, color: '#666666', marginBottom: 8 }}>카드사</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {CARD_COMPANIES.map(comp => (
                <TouchableOpacity
                  key={comp.id}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 8,
                    backgroundColor: company === comp.id ? '#F7931A' : '#F3F4F6',
                  }}
                  onPress={() => setCompany(comp.id)}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      color: company === comp.id ? '#FFFFFF' : '#666666',
                    }}
                  >
                    {comp.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* 카드 종류 */}
          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 14, color: '#666666', marginBottom: 8 }}>카드 종류</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {[
                { id: 'credit', label: '신용카드' },
                { id: 'debit', label: '체크카드' },
                { id: 'prepaid', label: '선불카드' },
              ].map(type => (
                <TouchableOpacity
                  key={type.id}
                  style={{
                    flex: 1,
                    paddingVertical: 12,
                    borderRadius: 8,
                    backgroundColor: cardType === type.id ? '#F7931A' : '#F3F4F6',
                    alignItems: 'center',
                  }}
                  onPress={() => setCardType(type.id as CardType)}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      color: cardType === type.id ? '#FFFFFF' : '#666666',
                    }}
                  >
                    {type.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* 결제일 (신용카드만) */}
          {cardType === 'credit' && (
            <View style={{ marginBottom: 24 }}>
              <Text style={{ fontSize: 14, color: '#666666', marginBottom: 8 }}>결제일</Text>
              <TouchableOpacity
                style={{
                  borderWidth: 1,
                  borderColor: '#E5E7EB',
                  borderRadius: 8,
                  padding: 12,
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
                onPress={() => setShowPaymentDayPicker(true)}
              >
                <Text style={{ fontSize: 16, color: paymentDay ? '#1A1A1A' : '#9CA3AF' }}>
                  {paymentDay ? `매월 ${paymentDay}일` : '결제일 선택 (선택)'}
                </Text>
                <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
              </TouchableOpacity>
              {billingPeriodText && (
                <Text style={{ fontSize: 12, color: '#9CA3AF', marginTop: 8 }}>
                  산정기간: {billingPeriodText}
                </Text>
              )}
              {!company && cardType === 'credit' && (
                <Text style={{ fontSize: 12, color: '#F7931A', marginTop: 8 }}>
                  * 카드사를 먼저 선택해주세요
                </Text>
              )}
            </View>
          )}

          {/* 결제 계좌 (신용카드만) */}
          {cardType === 'credit' && (
            <View style={{ marginBottom: 24 }}>
              <Text style={{ fontSize: 14, color: '#666666', marginBottom: 8 }}>결제 계좌</Text>
              <TouchableOpacity
                style={{
                  borderWidth: 1,
                  borderColor: '#E5E7EB',
                  borderRadius: 8,
                  padding: 12,
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
                onPress={() => setShowAssetPicker(true)}
              >
                <Text style={{ fontSize: 16, color: linkedAssetId ? '#1A1A1A' : '#9CA3AF' }}>
                  {linkedAssetId
                    ? fiatAssets.find(a => a.id === linkedAssetId)?.name ?? '계좌 선택'
                    : '결제 계좌 선택 (선택)'}
                </Text>
                <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
              </TouchableOpacity>
              <Text style={{ fontSize: 12, color: '#9CA3AF', marginTop: 8 }}>
                결제일에 이 계좌에서 자동으로 차감됩니다
              </Text>
            </View>
          )}

          {/* 카드 색상 */}
          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 14, color: '#666666', marginBottom: 8 }}>카드 색상</Text>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              {CARD_COLORS.map(c => (
                <TouchableOpacity
                  key={c}
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    backgroundColor: c,
                    borderWidth: color === c ? 3 : 0,
                    borderColor: '#F7931A',
                  }}
                  onPress={() => setColor(c)}
                >
                  {color === c && (
                    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="checkmark" size={20} color="#FFFFFF" />
                    </View>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </ScrollView>

        {/* 저장 버튼 */}
        <View style={{ padding: 20, borderTopWidth: 1, borderTopColor: '#E5E7EB' }}>
          <TouchableOpacity
            style={{
              backgroundColor: '#F7931A',
              padding: 16,
              borderRadius: 8,
              alignItems: 'center',
              opacity: isLoading ? 0.7 : 1,
            }}
            onPress={handleSave}
            disabled={isLoading}
          >
            <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '600' }}>
              {isLoading ? '등록 중...' : '카드 등록'}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* 결제일 선택 모달 */}
      <Modal visible={showPaymentDayPicker} transparent animationType="slide">
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <View
            style={{
              backgroundColor: '#FFFFFF',
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              padding: 20,
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
              <Text style={{ fontSize: 18, fontWeight: 'bold' }}>결제일 선택</Text>
              <TouchableOpacity onPress={() => setShowPaymentDayPicker(false)}>
                <Ionicons name="close" size={24} color="#666666" />
              </TouchableOpacity>
            </View>

            {company && (
              <Text style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 16 }}>
                {CARD_COMPANIES.find(c => c.id === company)?.name} 가용 결제일
              </Text>
            )}

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 16 }}>
              {availablePaymentDays.map((day) => (
                <TouchableOpacity
                  key={day}
                  style={{
                    width: '18%',
                    padding: 12,
                    backgroundColor: paymentDay === day ? '#F7931A' : '#F3F4F6',
                    borderRadius: 8,
                    margin: '1%',
                    alignItems: 'center',
                  }}
                  onPress={() => {
                    setPaymentDay(day);
                    setShowPaymentDayPicker(false);
                  }}
                >
                  <Text
                    style={{
                      fontSize: 16,
                      color: paymentDay === day ? '#FFFFFF' : '#1A1A1A',
                    }}
                  >
                    {day}일
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {availablePaymentDays.length === 0 && (
              <Text style={{ fontSize: 14, color: '#9CA3AF', textAlign: 'center', marginBottom: 16 }}>
                카드사를 먼저 선택해주세요
              </Text>
            )}

            {/* 설정 안함 옵션 */}
            <TouchableOpacity
              style={{
                padding: 16,
                backgroundColor: '#F3F4F6',
                borderRadius: 8,
                alignItems: 'center',
              }}
              onPress={() => {
                setPaymentDay(null);
                setBillingStartDay(null);
                setBillingEndDay(null);
                setShowPaymentDayPicker(false);
              }}
            >
              <Text style={{ fontSize: 16, color: '#666666' }}>설정 안함</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 결제 계좌 선택 모달 */}
      <Modal visible={showAssetPicker} transparent animationType="slide">
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <View
            style={{
              backgroundColor: '#FFFFFF',
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              padding: 20,
              maxHeight: '60%',
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
              <Text style={{ fontSize: 18, fontWeight: 'bold' }}>결제 계좌 선택</Text>
              <TouchableOpacity onPress={() => setShowAssetPicker(false)}>
                <Ionicons name="close" size={24} color="#666666" />
              </TouchableOpacity>
            </View>

            {fiatAssets.length === 0 ? (
              <View style={{ padding: 32, alignItems: 'center' }}>
                <Ionicons name="wallet-outline" size={48} color="#9CA3AF" />
                <Text style={{ fontSize: 14, color: '#9CA3AF', marginTop: 12, textAlign: 'center' }}>
                  등록된 계좌가 없습니다{'\n'}자산 탭에서 계좌를 먼저 추가해주세요
                </Text>
              </View>
            ) : (
              <ScrollView style={{ maxHeight: 300 }}>
                {fiatAssets.map((asset) => (
                  <TouchableOpacity
                    key={asset.id}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      padding: 16,
                      backgroundColor: linkedAssetId === asset.id ? '#FEF3C7' : '#F9FAFB',
                      borderRadius: 8,
                      marginBottom: 8,
                    }}
                    onPress={() => {
                      setLinkedAssetId(asset.id);
                      setShowAssetPicker(false);
                    }}
                  >
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
                    <Text style={{ flex: 1, fontSize: 16, color: '#1A1A1A' }}>{asset.name}</Text>
                    {linkedAssetId === asset.id && (
                      <Ionicons name="checkmark-circle" size={24} color="#F7931A" />
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            {/* 설정 안함 옵션 */}
            <TouchableOpacity
              style={{
                padding: 16,
                backgroundColor: '#F3F4F6',
                borderRadius: 8,
                alignItems: 'center',
                marginTop: 8,
              }}
              onPress={() => {
                setLinkedAssetId(null);
                setShowAssetPicker(false);
              }}
            >
              <Text style={{ fontSize: 16, color: '#666666' }}>설정 안함</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
