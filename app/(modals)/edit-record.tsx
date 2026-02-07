import { useState, useEffect } from 'react';
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
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useLedgerStore } from '../../src/stores/ledgerStore';
import { useCardStore } from '../../src/stores/cardStore';
import { usePriceStore } from '../../src/stores/priceStore';
import { DEFAULT_EXPENSE_CATEGORIES, DEFAULT_INCOME_CATEGORIES } from '../../src/constants/categories';
import { formatKrw, formatSats } from '../../src/utils/formatters';
import { krwToSats, satsToKrw } from '../../src/utils/calculations';
import { LedgerRecord, isExpense } from '../../src/types/ledger';

type PaymentMethod = 'cash' | 'card' | 'lightning' | 'onchain' | 'bank';
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
  { value: -1, label: '직접입력' },
];

export default function EditRecordScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { records, updateRecord, deleteRecord } = useLedgerStore();
  const { cards } = useCardStore();
  const { btcKrw } = usePriceStore();

  const record = records.find(r => r.id === id);
  const isExpenseRecord = record && isExpense(record);

  const [amount, setAmount] = useState('');
  const [currencyMode, setCurrencyMode] = useState<CurrencyMode>('KRW');
  const [category, setCategory] = useState('');
  const [customCategory, setCustomCategory] = useState('');
  const [showCustomCategory, setShowCustomCategory] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [installmentMonths, setInstallmentMonths] = useState(1);
  const [customInstallment, setCustomInstallment] = useState('');
  const [isInterestFree, setIsInterestFree] = useState(true);
  const [showInstallmentPicker, setShowInstallmentPicker] = useState(false);
  const [showCustomInstallmentInput, setShowCustomInstallmentInput] = useState(false);
  const [source, setSource] = useState('');
  const [memo, setMemo] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // 초기값 설정
  useEffect(() => {
    if (record) {
      setAmount(record.amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','));
      setCategory(record.category);
      setMemo(record.memo || '');
      setSelectedDate(new Date(record.date));

      // 기본 카테고리에 없는 경우 커스텀으로 처리
      const categories = isExpenseRecord ? DEFAULT_EXPENSE_CATEGORIES : DEFAULT_INCOME_CATEGORIES;
      const isDefaultCategory = categories.some(c => c.name === record.category);
      if (!isDefaultCategory) {
        setShowCustomCategory(true);
        setCustomCategory(record.category);
        setCategory('');
      }

      if (isExpense(record)) {
        setPaymentMethod(record.paymentMethod);
        setSelectedCardId(record.cardId);
        setInstallmentMonths(record.installmentMonths || 1);
        setIsInterestFree(record.isInterestFree ?? true);

        // 기본 옵션에 없는 할부인 경우
        const isDefaultInstallment = INSTALLMENT_OPTIONS.some(o => o.value === record.installmentMonths);
        if (record.installmentMonths && record.installmentMonths > 1 && !isDefaultInstallment) {
          setShowCustomInstallmentInput(true);
          setCustomInstallment(record.installmentMonths.toString());
        }
      } else {
        setSource(record.source || '');
      }
    }
  }, [record]);

  if (!record) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center' }}>
        <Text>기록을 찾을 수 없습니다.</Text>
      </SafeAreaView>
    );
  }

  const amountNumber = parseInt(amount.replace(/[^0-9]/g, '')) || 0;
  const krwAmount = currencyMode === 'KRW' ? amountNumber : btcKrw ? satsToKrw(amountNumber, btcKrw) : 0;
  const satsAmount = currencyMode === 'SATS' ? amountNumber : btcKrw ? krwToSats(amountNumber, btcKrw) : 0;

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
    setAmount('');
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
    if (date) setSelectedDate(date);
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

    if (isExpenseRecord && paymentMethod === 'card' && !selectedCardId) {
      Alert.alert('오류', '카드를 선택해주세요.');
      return;
    }

    setIsLoading(true);

    try {
      const updates: Partial<LedgerRecord> = {
        date: formatDateString(selectedDate),
        amount: krwAmount,
        category: finalCategory,
        memo: memo || null,
      };

      if (isExpenseRecord) {
        Object.assign(updates, {
          paymentMethod,
          cardId: paymentMethod === 'card' ? selectedCardId : null,
          installmentMonths: paymentMethod === 'card' && installmentMonths > 1 ? installmentMonths : null,
          isInterestFree: paymentMethod === 'card' && installmentMonths > 1 ? isInterestFree : null,
        });
      } else {
        Object.assign(updates, {
          source: source || null,
        });
      }

      await updateRecord(record.id, updates);
      router.back();
    } catch (error) {
      Alert.alert('오류', '수정에 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      '삭제 확인',
      '이 기록을 삭제하시겠습니까?',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: async () => {
            await deleteRecord(record.id);
            router.back();
          },
        },
      ]
    );
  };

  const categories = isExpenseRecord ? DEFAULT_EXPENSE_CATEGORIES : DEFAULT_INCOME_CATEGORIES;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
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
            {isExpenseRecord ? '지출 수정' : '수입 수정'}
          </Text>
          <View style={{ flexDirection: 'row', gap: 16 }}>
            <TouchableOpacity onPress={handleDelete}>
              <Ionicons name="trash-outline" size={24} color="#EF4444" />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.back()}>
              <Ionicons name="close" size={24} color="#666666" />
            </TouchableOpacity>
          </View>
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
                style={{ flex: 1, fontSize: 24, fontWeight: 'bold', paddingVertical: 16, color: '#1A1A1A' }}
                placeholder="0"
                placeholderTextColor="#9CA3AF"
                keyboardType="numeric"
                value={amount}
                onChangeText={handleAmountChange}
              />
              {currencyMode === 'SATS' && <Text style={{ fontSize: 14, color: '#F7931A' }}>sats</Text>}
            </View>
            {amountNumber > 0 && btcKrw && (
              <Text style={{ fontSize: 12, color: '#F7931A', marginTop: 4 }}>
                {currencyMode === 'KRW' ? `= ${formatSats(satsAmount)} (현재 시세)` : `= ${formatKrw(krwAmount)} (현재 시세)`}
              </Text>
            )}
          </View>

          {/* 카테고리 */}
          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 14, color: '#666666', marginBottom: 8 }}>카테고리</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {categories.map(cat => (
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
                  <Text style={{ fontSize: 14, color: category === cat.name && !showCustomCategory ? '#FFFFFF' : '#666666' }}>
                    {cat.icon} {cat.name}
                  </Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 10,
                  borderRadius: 20,
                  backgroundColor: showCustomCategory ? '#6B7280' : '#F3F4F6',
                }}
                onPress={() => handleCategorySelect('', true)}
              >
                <Text style={{ fontSize: 14, color: showCustomCategory ? '#FFFFFF' : '#666666' }}>✏️ 직접입력</Text>
              </TouchableOpacity>
            </View>
            {showCustomCategory && (
              <TextInput
                style={{
                  marginTop: 12,
                  borderWidth: 1,
                  borderColor: '#E5E7EB',
                  borderRadius: 8,
                  padding: 12,
                  fontSize: 16,
                  color: '#1A1A1A',
                }}
                placeholder="카테고리 직접 입력"
                placeholderTextColor="#9CA3AF"
                value={customCategory}
                onChangeText={setCustomCategory}
              />
            )}
          </View>

          {/* 지출: 결제 수단 */}
          {isExpenseRecord && (
            <>
              <View style={{ marginBottom: 24 }}>
                <Text style={{ fontSize: 14, color: '#666666', marginBottom: 8 }}>결제 수단</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {[
                    { id: 'cash', label: '현금' },
                    { id: 'card', label: '카드' },
                    { id: 'lightning', label: '⚡' },
                    { id: 'onchain', label: '₿' },
                  ].map(method => (
                    <TouchableOpacity
                      key={method.id}
                      style={{
                        flex: 1,
                        paddingVertical: 12,
                        borderRadius: 8,
                        backgroundColor: paymentMethod === method.id ? '#F7931A' : '#F3F4F6',
                        alignItems: 'center',
                      }}
                      onPress={() => setPaymentMethod(method.id as PaymentMethod)}
                    >
                      <Text style={{ fontSize: 14, color: paymentMethod === method.id ? '#FFFFFF' : '#666666' }}>
                        {method.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

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
                            backgroundColor: selectedCardId === card.id ? card.color : '#F3F4F6',
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
                              backgroundColor: selectedCardId === card.id ? '#FFFFFF' : card.color,
                              marginRight: 8,
                            }}
                          />
                          <Text style={{ color: selectedCardId === card.id ? '#FFFFFF' : '#1A1A1A' }}>{card.name}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
              )}

              {/* 할부 */}
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
                          color: '#1A1A1A',
                        }}
                        placeholder="개월 수 입력"
                        placeholderTextColor="#9CA3AF"
                        keyboardType="numeric"
                        value={customInstallment}
                        onChangeText={(text) => {
                          const num = text.replace(/[^0-9]/g, '');
                          setCustomInstallment(num);
                          if (num) setInstallmentMonths(parseInt(num));
                        }}
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

                  {/* 무이자/유이자 선택 */}
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
            </>
          )}

          {/* 수입: 수입원 */}
          {!isExpenseRecord && (
            <View style={{ marginBottom: 24 }}>
              <Text style={{ fontSize: 14, color: '#666666', marginBottom: 8 }}>수입원 (선택)</Text>
              <TextInput
                style={{
                  borderWidth: 1,
                  borderColor: '#E5E7EB',
                  borderRadius: 8,
                  padding: 12,
                  fontSize: 16,
                  color: '#1A1A1A',
                }}
                placeholder="예: 회사, 프리랜서"
                placeholderTextColor="#9CA3AF"
                value={source}
                onChangeText={setSource}
              />
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
                color: '#1A1A1A',
              }}
              placeholder="메모를 입력하세요"
              placeholderTextColor="#9CA3AF"
              value={memo}
              onChangeText={setMemo}
            />
          </View>

          {/* 기록 정보 */}
          <View style={{ marginBottom: 24, padding: 12, backgroundColor: '#F9FAFB', borderRadius: 8 }}>
            <Text style={{ fontSize: 12, color: '#9CA3AF' }}>
              생성: {new Date(record.createdAt).toLocaleString('ko-KR')}
            </Text>
            {record.updatedAt !== record.createdAt && (
              <Text style={{ fontSize: 12, color: '#9CA3AF', marginTop: 4 }}>
                수정: {new Date(record.updatedAt).toLocaleString('ko-KR')}
              </Text>
            )}
            {record.satsEquivalent && (
              <Text style={{ fontSize: 12, color: '#F7931A', marginTop: 4 }}>
                기록 당시: {formatSats(record.satsEquivalent)}
              </Text>
            )}
          </View>
        </ScrollView>

        {/* 저장 버튼 */}
        <View style={{ padding: 20, borderTopWidth: 1, borderTopColor: '#E5E7EB' }}>
          <TouchableOpacity
            style={{
              backgroundColor: isExpenseRecord ? '#EF4444' : '#22C55E',
              padding: 16,
              borderRadius: 8,
              alignItems: 'center',
              opacity: isLoading ? 0.7 : 1,
            }}
            onPress={handleSave}
            disabled={isLoading}
          >
            <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '600' }}>
              {isLoading ? '저장 중...' : '수정 완료'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* 할부 선택 모달 */}
        <Modal visible={showInstallmentPicker} transparent animationType="slide">
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
                    <Text
                      style={{
                        fontSize: 16,
                        color: installmentMonths === option.value && !showCustomInstallmentInput ? '#FFFFFF' : '#1A1A1A',
                        textAlign: 'center',
                      }}
                    >
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
