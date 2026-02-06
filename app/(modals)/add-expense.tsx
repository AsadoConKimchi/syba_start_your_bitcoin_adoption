import { useState } from 'react';
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
import DateTimePicker from '@react-native-community/datetimepicker';
import { useLedgerStore } from '../../src/stores/ledgerStore';
import { useCardStore } from '../../src/stores/cardStore';
import { usePriceStore } from '../../src/stores/priceStore';
import { useDebtStore } from '../../src/stores/debtStore';
import { useAuthStore } from '../../src/stores/authStore';
import { useAssetStore } from '../../src/stores/assetStore';
import { DEFAULT_EXPENSE_CATEGORIES } from '../../src/constants/categories';
import { formatKrw, formatSats, getTodayString } from '../../src/utils/formatters';
import { krwToSats, satsToKrw } from '../../src/utils/calculations';
import { isFiatAsset, isBitcoinAsset } from '../../src/types/asset';

type PaymentMethod = 'cash' | 'card' | 'bank' | 'lightning' | 'onchain';
type CurrencyMode = 'KRW' | 'SATS';

const INSTALLMENT_OPTIONS = [
  { value: 1, label: '일시불' },
  { value: 2, label: '2개월' },
  { value: 3, label: '3개월' },
  { value: 4, label: '4개월' },
  { value: 5, label: '5개월' },
  { value: 6, label: '6개월' },
  { value: 10, label: '10개월' },
  { value: 12, label: '12개월' },
  { value: 24, label: '24개월' },
  { value: -1, label: '직접입력' }, // -1은 직접입력 표시용
];

export default function AddExpenseScreen() {
  const [amount, setAmount] = useState('');
  const [currencyMode, setCurrencyMode] = useState<CurrencyMode>('KRW');
  const [category, setCategory] = useState('');
  const [customCategory, setCustomCategory] = useState('');
  const [showCustomCategory, setShowCustomCategory] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [installmentMonths, setInstallmentMonths] = useState(1);
  const [customInstallment, setCustomInstallment] = useState('');
  const [isInterestFree, setIsInterestFree] = useState(true); // 무이자 여부
  const [showInstallmentPicker, setShowInstallmentPicker] = useState(false);
  const [showCustomInstallmentInput, setShowCustomInstallmentInput] = useState(false);
  const [memo, setMemo] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [linkedAssetId, setLinkedAssetId] = useState<string | null>(null);
  const [showAssetPicker, setShowAssetPicker] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const { addExpense } = useLedgerStore();
  const { cards } = useCardStore();
  const { btcKrw } = usePriceStore();
  const { addInstallment } = useDebtStore();
  const { encryptionKey } = useAuthStore();
  const { assets } = useAssetStore();

  // 결제수단별 자산 필터링
  const fiatAssets = assets.filter(isFiatAsset);
  const lightningAssets = assets.filter(a => isBitcoinAsset(a) && a.walletType === 'lightning');
  const onchainAssets = assets.filter(a => isBitcoinAsset(a) && a.walletType === 'onchain');

  // 현재 결제수단에 맞는 자산 목록
  const getAssetsForPaymentMethod = () => {
    switch (paymentMethod) {
      case 'bank': return fiatAssets;
      case 'lightning': return lightningAssets;
      case 'onchain': return onchainAssets;
      default: return [];
    }
  };

  const availableAssets = getAssetsForPaymentMethod();

  // 금액 파싱
  const amountNumber = parseInt(amount.replace(/[^0-9]/g, '')) || 0;

  // 원화 금액 계산 (sats 모드일 경우 변환)
  const krwAmount = currencyMode === 'KRW'
    ? amountNumber
    : btcKrw ? satsToKrw(amountNumber, btcKrw) : 0;

  // sats 금액 계산 (원화 모드일 경우 변환)
  const satsAmount = currencyMode === 'SATS'
    ? amountNumber
    : btcKrw ? krwToSats(amountNumber, btcKrw) : 0;

  const handleAmountChange = (text: string) => {
    const numbers = text.replace(/[^0-9]/g, '');
    if (numbers) {
      const formatted = parseInt(numbers).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      setAmount(formatted);
    } else {
      setAmount('');
    }
  };

  const toggleCurrencyMode = () => {
    setCurrencyMode(prev => prev === 'KRW' ? 'SATS' : 'KRW');
    setAmount(''); // 모드 변경 시 금액 초기화
  };

  const handleCategorySelect = (catName: string, isCustomInput: boolean = false) => {
    if (isCustomInput) {
      setShowCustomCategory(true);
      setCategory('');
    } else {
      setShowCustomCategory(false);
      setCustomCategory('');
      setCategory(catName);
    }
  };

  const handleDateChange = (event: any, date?: Date) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (date) {
      setSelectedDate(date);
    }
  };

  const formatDateString = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const handleSave = async () => {
    if (!amountNumber) {
      Alert.alert('오류', '금액을 입력해주세요.');
      return;
    }

    const finalCategory = showCustomCategory ? customCategory : category;
    if (!finalCategory) {
      Alert.alert('오류', '카테고리를 선택하거나 입력해주세요.');
      return;
    }

    if (paymentMethod === 'card' && !selectedCardId) {
      Alert.alert('오류', '카드를 선택해주세요.');
      return;
    }

    if (!encryptionKey) {
      Alert.alert('오류', '인증이 필요합니다.');
      return;
    }

    // sats 모드일 때 시세가 없으면 저장 불가
    if (currencyMode === 'SATS' && !btcKrw) {
      Alert.alert('오류', 'BTC 시세를 가져올 수 없습니다. 네트워크를 확인해주세요.');
      return;
    }

    setIsLoading(true);

    try {
      const dateString = formatDateString(selectedDate);
      const isInstallment = paymentMethod === 'card' && installmentMonths > 1;

      // 1. 지출 기록 추가
      // - KRW 모드: amount는 원화, currency는 'KRW'
      // - SATS 모드: amount는 sats, currency는 'SATS'
      const expenseId = await addExpense({
        date: dateString,
        amount: currencyMode === 'KRW' ? amountNumber : amountNumber,
        currency: currencyMode,
        category: finalCategory,
        paymentMethod,
        cardId: paymentMethod === 'card' ? selectedCardId : null,
        installmentMonths: isInstallment ? installmentMonths : null,
        isInterestFree: isInstallment ? isInterestFree : null,
        installmentId: null,
        memo: memo || null,
        linkedAssetId: linkedAssetId || null,
      });

      // 2. 할부인 경우, 부채 탭에 할부 기록 자동 생성
      if (isInstallment && selectedCardId) {
        await addInstallment(
          {
            cardId: selectedCardId,
            expenseId: expenseId,
            storeName: finalCategory, // 카테고리를 상점명으로 사용
            totalAmount: krwAmount,
            months: installmentMonths,
            isInterestFree: isInterestFree,
            interestRate: isInterestFree ? 0 : 15, // 유이자 기본 15%
            startDate: dateString,
            paidMonths: 0, // 새로 시작하는 할부이므로 0
            memo: memo || undefined,
          },
          encryptionKey
        );
      }

      router.back();
    } catch (error) {
      Alert.alert('오류', `저장에 실패했습니다: ${error}`);
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
          <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#1A1A1A' }}>지출 입력</Text>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="close" size={24} color="#666666" />
          </TouchableOpacity>
        </View>

        <ScrollView style={{ flex: 1, padding: 20 }}>
          {/* 날짜 선택 */}
          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 14, color: '#666666', marginBottom: 8 }}>날짜</Text>
            <TouchableOpacity
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderWidth: 1,
                borderColor: '#E5E7EB',
                borderRadius: 8,
                padding: 12,
              }}
              onPress={() => setShowDatePicker(true)}
            >
              <Text style={{ fontSize: 16, color: '#1A1A1A' }}>
                {selectedDate.toLocaleDateString('ko-KR', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  weekday: 'short',
                })}
              </Text>
              <Ionicons name="calendar-outline" size={20} color="#666666" />
            </TouchableOpacity>
            {showDatePicker && (
              <DateTimePicker
                value={selectedDate}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={handleDateChange}
                maximumDate={new Date()}
                locale="ko-KR"
              />
            )}
          </View>

          {/* 금액 */}
          <View style={{ marginBottom: 24 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Text style={{ fontSize: 14, color: '#666666' }}>금액</Text>
              <TouchableOpacity
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: currencyMode === 'KRW' ? '#F3F4F6' : '#FEF3C7',
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 16,
                }}
                onPress={toggleCurrencyMode}
              >
                <Text style={{ fontSize: 12, color: currencyMode === 'KRW' ? '#666666' : '#F7931A', fontWeight: '600' }}>
                  {currencyMode === 'KRW' ? '원화 (KRW)' : 'sats'}
                </Text>
                <Ionicons name="swap-horizontal" size={14} color={currencyMode === 'KRW' ? '#666666' : '#F7931A'} style={{ marginLeft: 4 }} />
              </TouchableOpacity>
            </View>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                borderWidth: 1,
                borderColor: '#E5E7EB',
                borderRadius: 8,
                paddingHorizontal: 16,
              }}
            >
              <Text style={{ fontSize: 18, color: currencyMode === 'KRW' ? '#666666' : '#F7931A', marginRight: 4 }}>
                {currencyMode === 'KRW' ? '₩' : '₿'}
              </Text>
              <TextInput
                style={{ flex: 1, fontSize: 24, fontWeight: 'bold', paddingVertical: 16 }}
                placeholder="0"
                keyboardType="numeric"
                value={amount}
                onChangeText={handleAmountChange}
              />
              {currencyMode === 'SATS' && (
                <Text style={{ fontSize: 14, color: '#F7931A' }}>sats</Text>
              )}
            </View>
            {amountNumber > 0 && btcKrw && (
              <Text style={{ fontSize: 12, color: '#F7931A', marginTop: 4 }}>
                {currencyMode === 'KRW'
                  ? `= ${formatSats(satsAmount)} (현재 시세)`
                  : `= ${formatKrw(krwAmount)} (현재 시세)`
                }
              </Text>
            )}
          </View>

          {/* 카테고리 */}
          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 14, color: '#666666', marginBottom: 8 }}>카테고리</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {DEFAULT_EXPENSE_CATEGORIES.map(cat => (
                <TouchableOpacity
                  key={cat.id}
                  style={{
                    paddingHorizontal: 16,
                    paddingVertical: 10,
                    borderRadius: 20,
                    backgroundColor: category === cat.name && !showCustomCategory ? cat.color : '#F3F4F6',
                  }}
                  onPress={() => handleCategorySelect(cat.name)}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      color: category === cat.name && !showCustomCategory ? '#FFFFFF' : '#666666',
                    }}
                  >
                    {cat.icon} {cat.name}
                  </Text>
                </TouchableOpacity>
              ))}
              {/* 직접입력 버튼 */}
              <TouchableOpacity
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 10,
                  borderRadius: 20,
                  backgroundColor: showCustomCategory ? '#6B7280' : '#F3F4F6',
                }}
                onPress={() => handleCategorySelect('', true)}
              >
                <Text
                  style={{
                    fontSize: 14,
                    color: showCustomCategory ? '#FFFFFF' : '#666666',
                  }}
                >
                  ✏️ 직접입력
                </Text>
              </TouchableOpacity>
            </View>
            {/* 커스텀 카테고리 입력 */}
            {showCustomCategory && (
              <TextInput
                style={{
                  marginTop: 12,
                  borderWidth: 1,
                  borderColor: '#E5E7EB',
                  borderRadius: 8,
                  padding: 12,
                  fontSize: 16,
                }}
                placeholder="카테고리 직접 입력"
                value={customCategory}
                onChangeText={setCustomCategory}
                autoFocus
              />
            )}
          </View>

          {/* 결제 수단 */}
          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 14, color: '#666666', marginBottom: 8 }}>결제 수단</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {[
                { id: 'cash', label: '현금' },
                { id: 'card', label: '카드' },
                { id: 'bank', label: '계좌이체' },
                { id: 'lightning', label: '⚡ Lightning' },
                { id: 'onchain', label: '₿ Onchain' },
              ].map(method => (
                <TouchableOpacity
                  key={method.id}
                  style={{
                    paddingVertical: 12,
                    paddingHorizontal: 16,
                    borderRadius: 8,
                    backgroundColor:
                      paymentMethod === method.id ? '#F7931A' : '#F3F4F6',
                    alignItems: 'center',
                  }}
                  onPress={() => {
                    setPaymentMethod(method.id as PaymentMethod);
                    setLinkedAssetId(null); // 결제수단 변경 시 자산 선택 초기화
                  }}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      color: paymentMethod === method.id ? '#FFFFFF' : '#666666',
                    }}
                  >
                    {method.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* 자산 선택 (계좌이체/Lightning/Onchain) */}
          {(paymentMethod === 'bank' || paymentMethod === 'lightning' || paymentMethod === 'onchain') && (
            <View style={{ marginBottom: 24 }}>
              <Text style={{ fontSize: 14, color: '#666666', marginBottom: 8 }}>
                {paymentMethod === 'bank' ? '출금 계좌' : paymentMethod === 'lightning' ? 'Lightning 지갑' : 'Onchain 지갑'}
              </Text>
              {availableAssets.length === 0 ? (
                <TouchableOpacity
                  style={{
                    padding: 16,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: '#E5E7EB',
                    borderStyle: 'dashed',
                    alignItems: 'center',
                  }}
                  onPress={() => router.push('/(modals)/add-asset')}
                >
                  <Text style={{ color: '#9CA3AF' }}>
                    + {paymentMethod === 'bank' ? '계좌 추가하기' : '지갑 추가하기'}
                  </Text>
                </TouchableOpacity>
              ) : (
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
                      ? availableAssets.find(a => a.id === linkedAssetId)?.name ?? '선택'
                      : `${paymentMethod === 'bank' ? '계좌' : '지갑'} 선택 (선택)`}
                  </Text>
                  <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
                </TouchableOpacity>
              )}
              <Text style={{ fontSize: 12, color: '#9CA3AF', marginTop: 8 }}>
                선택하면 지출 시 자산에서 자동 차감됩니다
              </Text>
            </View>
          )}

          {/* 카드 선택 */}
          {paymentMethod === 'card' && (
            <View style={{ marginBottom: 24 }}>
              <Text style={{ fontSize: 14, color: '#666666', marginBottom: 8 }}>카드 선택</Text>
              {cards.length === 0 ? (
                <TouchableOpacity
                  style={{
                    padding: 16,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: '#E5E7EB',
                    borderStyle: 'dashed',
                    alignItems: 'center',
                  }}
                  onPress={() => router.push('/(modals)/add-card')}
                >
                  <Text style={{ color: '#9CA3AF' }}>+ 카드 등록하기</Text>
                </TouchableOpacity>
              ) : (
                <View style={{ gap: 8 }}>
                  {cards.map(card => (
                    <TouchableOpacity
                      key={card.id}
                      style={{
                        padding: 12,
                        borderRadius: 8,
                        backgroundColor:
                          selectedCardId === card.id ? card.color : '#F3F4F6',
                        flexDirection: 'row',
                        alignItems: 'center',
                      }}
                      onPress={() => setSelectedCardId(card.id)}
                    >
                      <View
                        style={{
                          width: 24,
                          height: 16,
                          borderRadius: 2,
                          backgroundColor:
                            selectedCardId === card.id ? '#FFFFFF' : card.color,
                          marginRight: 8,
                        }}
                      />
                      <Text
                        style={{
                          color: selectedCardId === card.id ? '#FFFFFF' : '#1A1A1A',
                        }}
                      >
                        {card.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          )}

          {/* 할부 선택 (카드 결제 시) */}
          {paymentMethod === 'card' && selectedCardId && (
            <View style={{ marginBottom: 24 }}>
              <Text style={{ fontSize: 14, color: '#666666', marginBottom: 8 }}>할부</Text>
              {showCustomInstallmentInput ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <TextInput
                    style={{
                      flex: 1,
                      borderWidth: 1,
                      borderColor: '#E5E7EB',
                      borderRadius: 8,
                      padding: 12,
                      fontSize: 16,
                    }}
                    placeholder="개월 수 입력"
                    keyboardType="numeric"
                    value={customInstallment}
                    onChangeText={(text) => {
                      const num = text.replace(/[^0-9]/g, '');
                      setCustomInstallment(num);
                      if (num) setInstallmentMonths(parseInt(num));
                    }}
                    autoFocus
                  />
                  <Text style={{ fontSize: 16, color: '#666666' }}>개월</Text>
                  <TouchableOpacity
                    onPress={() => {
                      setShowCustomInstallmentInput(false);
                      setCustomInstallment('');
                      setInstallmentMonths(1);
                    }}
                  >
                    <Ionicons name="close-circle" size={24} color="#9CA3AF" />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderWidth: 1,
                    borderColor: '#E5E7EB',
                    borderRadius: 8,
                    padding: 12,
                  }}
                  onPress={() => setShowInstallmentPicker(true)}
                >
                  <Text style={{ fontSize: 16, color: '#1A1A1A' }}>
                    {installmentMonths === 1 ? '일시불' : `${installmentMonths}개월`}
                  </Text>
                  <Ionicons name="chevron-down" size={20} color="#666666" />
                </TouchableOpacity>
              )}

              {/* 무이자/유이자 선택 (할부일 때만) */}
              {installmentMonths > 1 && (
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                  <TouchableOpacity
                    style={{
                      flex: 1,
                      paddingVertical: 10,
                      borderRadius: 8,
                      backgroundColor: isInterestFree ? '#22C55E' : '#F3F4F6',
                      alignItems: 'center',
                    }}
                    onPress={() => setIsInterestFree(true)}
                  >
                    <Text style={{ fontSize: 14, color: isInterestFree ? '#FFFFFF' : '#666666', fontWeight: '600' }}>
                      무이자
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{
                      flex: 1,
                      paddingVertical: 10,
                      borderRadius: 8,
                      backgroundColor: !isInterestFree ? '#EF4444' : '#F3F4F6',
                      alignItems: 'center',
                    }}
                    onPress={() => setIsInterestFree(false)}
                  >
                    <Text style={{ fontSize: 14, color: !isInterestFree ? '#FFFFFF' : '#666666', fontWeight: '600' }}>
                      유이자
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              {installmentMonths > 1 && krwAmount > 0 && (
                <Text style={{ fontSize: 12, color: '#666666', marginTop: 8 }}>
                  월 {formatKrw(Math.ceil(krwAmount / installmentMonths))} × {installmentMonths}개월
                  {isInterestFree ? ' (무이자)' : ' (유이자)'}
                </Text>
              )}
            </View>
          )}

          {/* 메모 */}
          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 14, color: '#666666', marginBottom: 8 }}>메모 (선택)</Text>
            <TextInput
              style={{
                borderWidth: 1,
                borderColor: '#E5E7EB',
                borderRadius: 8,
                padding: 12,
                fontSize: 16,
              }}
              placeholder="메모를 입력하세요"
              value={memo}
              onChangeText={setMemo}
            />
          </View>
        </ScrollView>

        {/* 저장 버튼 */}
        <View style={{ padding: 20, borderTopWidth: 1, borderTopColor: '#E5E7EB' }}>
          <TouchableOpacity
            style={{
              backgroundColor: '#EF4444',
              padding: 16,
              borderRadius: 8,
              alignItems: 'center',
              opacity: isLoading ? 0.7 : 1,
            }}
            onPress={handleSave}
            disabled={isLoading}
          >
            <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '600' }}>
              {isLoading ? '저장 중...' : '저장'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* 할부 선택 모달 */}
        <Modal
          visible={showInstallmentPicker}
          transparent
          animationType="slide"
        >
          <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' }}>
            <View style={{ backgroundColor: '#FFFFFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <Text style={{ fontSize: 18, fontWeight: 'bold' }}>할부 선택</Text>
                <TouchableOpacity onPress={() => setShowInstallmentPicker(false)}>
                  <Ionicons name="close" size={24} color="#666666" />
                </TouchableOpacity>
              </View>
              <ScrollView style={{ maxHeight: 300 }}>
                {INSTALLMENT_OPTIONS.map(option => (
                  <TouchableOpacity
                    key={option.value}
                    style={{
                      padding: 16,
                      borderRadius: 8,
                      backgroundColor: installmentMonths === option.value && !showCustomInstallmentInput ? '#F7931A' : '#F3F4F6',
                      marginBottom: 8,
                    }}
                    onPress={() => {
                      if (option.value === -1) {
                        // 직접입력 선택
                        setShowCustomInstallmentInput(true);
                        setInstallmentMonths(1);
                        setCustomInstallment('');
                      } else {
                        setInstallmentMonths(option.value);
                        setShowCustomInstallmentInput(false);
                        setCustomInstallment('');
                      }
                      setShowInstallmentPicker(false);
                    }}
                  >
                    <Text style={{
                      fontSize: 16,
                      color: installmentMonths === option.value && !showCustomInstallmentInput ? '#FFFFFF' : '#1A1A1A',
                      textAlign: 'center',
                    }}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>
        </Modal>

        {/* 자산 선택 모달 */}
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
                <Text style={{ fontSize: 18, fontWeight: 'bold' }}>
                  {paymentMethod === 'bank' ? '출금 계좌 선택' : paymentMethod === 'lightning' ? 'Lightning 지갑 선택' : 'Onchain 지갑 선택'}
                </Text>
                <TouchableOpacity onPress={() => setShowAssetPicker(false)}>
                  <Ionicons name="close" size={24} color="#666666" />
                </TouchableOpacity>
              </View>

              <ScrollView style={{ maxHeight: 300 }}>
                {availableAssets.map((asset) => (
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
                        backgroundColor: paymentMethod === 'bank' ? '#D1FAE5' : '#FDE68A',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginRight: 12,
                      }}
                    >
                      <Text style={{ fontSize: 18 }}>
                        {paymentMethod === 'bank' ? '🏦' : paymentMethod === 'lightning' ? '⚡' : '₿'}
                      </Text>
                    </View>
                    <Text style={{ flex: 1, fontSize: 16, color: '#1A1A1A' }}>{asset.name}</Text>
                    {linkedAssetId === asset.id && (
                      <Ionicons name="checkmark-circle" size={24} color="#F7931A" />
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* 선택 안함 옵션 */}
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
                <Text style={{ fontSize: 16, color: '#666666' }}>선택 안함</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
