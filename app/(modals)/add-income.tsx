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
import { usePriceStore } from '../../src/stores/priceStore';
import { useAssetStore } from '../../src/stores/assetStore';
import { DEFAULT_INCOME_CATEGORIES } from '../../src/constants/categories';
import { formatKrw, formatSats } from '../../src/utils/formatters';
import { krwToSats, satsToKrw } from '../../src/utils/calculations';
import { isFiatAsset, isBitcoinAsset } from '../../src/types/asset';

type CurrencyMode = 'KRW' | 'SATS';

export default function AddIncomeScreen() {
  const [amount, setAmount] = useState('');
  const [currencyMode, setCurrencyMode] = useState<CurrencyMode>('KRW');
  const [category, setCategory] = useState('');
  const [customCategory, setCustomCategory] = useState('');
  const [showCustomCategory, setShowCustomCategory] = useState(false);
  const [source, setSource] = useState('');
  const [memo, setMemo] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [linkedAssetId, setLinkedAssetId] = useState<string | null>(null);
  const [showAssetPicker, setShowAssetPicker] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const { addIncome } = useLedgerStore();
  const { btcKrw } = usePriceStore();
  const { assets } = useAssetStore();

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

    // sats 모드일 때 시세가 없으면 저장 불가
    if (currencyMode === 'SATS' && !btcKrw) {
      Alert.alert('오류', 'BTC 시세를 가져올 수 없습니다. 네트워크를 확인해주세요.');
      return;
    }

    setIsLoading(true);

    try {
      // - KRW 모드: amount는 원화, currency는 'KRW'
      // - SATS 모드: amount는 sats, currency는 'SATS'
      await addIncome({
        date: formatDateString(selectedDate),
        amount: amountNumber,
        currency: currencyMode,
        category: finalCategory,
        source: source || null,
        memo: memo || null,
        linkedAssetId: linkedAssetId || null,
      });

      router.back();
    } catch (error) {
      Alert.alert('오류', '저장에 실패했습니다.');
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
          <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#1A1A1A' }}>수입 입력</Text>
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
              {DEFAULT_INCOME_CATEGORIES.map(cat => (
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

          {/* 수입원 */}
          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 14, color: '#666666', marginBottom: 8 }}>수입원 (선택)</Text>
            <TextInput
              style={{
                borderWidth: 1,
                borderColor: '#E5E7EB',
                borderRadius: 8,
                padding: 12,
                fontSize: 16,
              }}
              placeholder="예: 회사, 프리랜서"
              value={source}
              onChangeText={setSource}
            />
          </View>

          {/* 입금 계좌/지갑 */}
          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 14, color: '#666666', marginBottom: 8 }}>입금 계좌/지갑 (선택)</Text>
            {assets.length === 0 ? (
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
                <Text style={{ color: '#9CA3AF' }}>+ 계좌/지갑 추가하기</Text>
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
                    ? assets.find(a => a.id === linkedAssetId)?.name ?? '선택'
                    : '입금 계좌/지갑 선택'}
                </Text>
                <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            )}
            <Text style={{ fontSize: 12, color: '#9CA3AF', marginTop: 8 }}>
              선택하면 수입 시 자산에 자동 추가됩니다
            </Text>
          </View>

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
              backgroundColor: '#22C55E',
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

        {/* 입금 계좌/지갑 선택 모달 */}
        <Modal visible={showAssetPicker} transparent animationType="slide">
          <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' }}>
            <View
              style={{
                backgroundColor: '#FFFFFF',
                borderTopLeftRadius: 20,
                borderTopRightRadius: 20,
                padding: 20,
                maxHeight: '70%',
              }}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
                <Text style={{ fontSize: 18, fontWeight: 'bold' }}>입금 계좌/지갑 선택</Text>
                <TouchableOpacity onPress={() => setShowAssetPicker(false)}>
                  <Ionicons name="close" size={24} color="#666666" />
                </TouchableOpacity>
              </View>

              <ScrollView style={{ maxHeight: 400 }}>
                {/* 법정화폐 계좌 */}
                {assets.filter(isFiatAsset).length > 0 && (
                  <View style={{ marginBottom: 16 }}>
                    <Text style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 8 }}>은행 계좌</Text>
                    {assets.filter(isFiatAsset).map((asset) => (
                      <TouchableOpacity
                        key={asset.id}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          padding: 16,
                          backgroundColor: linkedAssetId === asset.id ? '#D1FAE5' : '#F9FAFB',
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
                          <Ionicons name="checkmark-circle" size={24} color="#22C55E" />
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {/* 비트코인 지갑 */}
                {assets.filter(isBitcoinAsset).length > 0 && (
                  <View style={{ marginBottom: 16 }}>
                    <Text style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 8 }}>비트코인 지갑</Text>
                    {assets.filter(isBitcoinAsset).map((asset) => (
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
                            backgroundColor: '#FDE68A',
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginRight: 12,
                          }}
                        >
                          <Text style={{ fontSize: 18 }}>
                            {isBitcoinAsset(asset) && asset.walletType === 'lightning' ? '⚡' : '₿'}
                          </Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 16, color: '#1A1A1A' }}>{asset.name}</Text>
                          <Text style={{ fontSize: 11, color: '#92400E' }}>
                            {isBitcoinAsset(asset) && asset.walletType === 'lightning' ? 'Lightning' : 'Onchain'}
                          </Text>
                        </View>
                        {linkedAssetId === asset.id && (
                          <Ionicons name="checkmark-circle" size={24} color="#F7931A" />
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
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
