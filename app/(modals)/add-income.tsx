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
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../src/hooks/useTheme';
import { useLedgerStore } from '../../src/stores/ledgerStore';
import { usePriceStore } from '../../src/stores/priceStore';
import { useAssetStore } from '../../src/stores/assetStore';
import { useCategoryStore } from '../../src/stores/categoryStore';
import { formatKrw, formatSats, getTodayString } from '../../src/utils/formatters';
import { krwToSats, satsToKrw } from '../../src/utils/calculations';
import { isFiatAsset, isBitcoinAsset } from '../../src/types/asset';
import { fetchHistoricalBtcPrice } from '../../src/services/api/upbit';

type CurrencyMode = 'KRW' | 'SATS';

export default function AddIncomeScreen() {
  const { t } = useTranslation();
  const { theme, isDark } = useTheme();
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
  const [historicalBtcKrw, setHistoricalBtcKrw] = useState<number | null>(null);

  const { addIncome } = useLedgerStore();
  const activeIncomeCategories = useCategoryStore(s => s.getActiveIncomeCategories)();
  const { btcKrw } = usePriceStore();
  const { assets } = useAssetStore();

  // 금액 파싱
  const amountNumber = parseInt(amount.replace(/[^0-9]/g, '')) || 0;

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

  // 날짜 변경 시 과거 날짜면 해당 날짜 종가 fetch (미리보기용)
  useEffect(() => {
    const dateString = formatDateString(selectedDate);
    if (dateString !== getTodayString()) {
      fetchHistoricalBtcPrice(dateString)
        .then(price => setHistoricalBtcKrw(price))
        .catch(() => setHistoricalBtcKrw(null));
    } else {
      setHistoricalBtcKrw(null);
    }
  }, [selectedDate]);

  // 미리보기에 사용할 시세: 오늘은 실시간, 과거는 해당 날짜 종가
  const isToday = formatDateString(selectedDate) === getTodayString();
  const previewBtcKrw = isToday ? btcKrw : historicalBtcKrw;

  // 원화 금액 계산 (sats 모드일 경우 변환)
  const krwAmount = currencyMode === 'KRW'
    ? amountNumber
    : previewBtcKrw ? satsToKrw(amountNumber, previewBtcKrw) : 0;

  // sats 금액 계산 (원화 모드일 경우 변환)
  const satsAmount = currencyMode === 'SATS'
    ? amountNumber
    : previewBtcKrw ? krwToSats(amountNumber, previewBtcKrw) : 0;

  const handleSave = async () => {
    if (!amountNumber) {
      Alert.alert(t('common.error'), t('income.amountRequired'));
      return;
    }

    const finalCategory = showCustomCategory ? customCategory : category;
    if (!finalCategory) {
      Alert.alert(t('common.error'), t('income.categoryRequired'));
      return;
    }

    // sats 모드일 때 시세가 없으면 저장 불가
    if (currencyMode === 'SATS' && !btcKrw) {
      Alert.alert(t('common.error'), t('common.networkError'));
      return;
    }

    setIsLoading(true);

    try {
      // - KRW 모드: amount는 원화, currency는 'KRW'
      // - SATS 모드: amount는 sats, currency는 'SATS'
      // 오늘 날짜면 실시간 현재가, 과거 날짜면 해당 날짜 종가 fetch
      const incomeDate = formatDateString(selectedDate);
      const overrideBtcKrw = incomeDate === getTodayString() ? btcKrw : undefined;
      await addIncome({
        date: incomeDate,
        amount: amountNumber,
        currency: currencyMode,
        category: finalCategory,
        source: source || null,
        memo: memo || null,
        linkedAssetId: linkedAssetId || null,
      }, overrideBtcKrw);

      router.back();
    } catch (error) {
      Alert.alert(t('common.error'), t('editRecord.editFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
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
            borderBottomColor: theme.border,
          }}
        >
          <Text style={{ fontSize: 18, fontWeight: 'bold', color: theme.text }}>{t('income.title')}</Text>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="close" size={24} color={theme.textSecondary} />
          </TouchableOpacity>
        </View>

        <ScrollView style={{ flex: 1, padding: 20 }} contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          {/* 날짜 선택 */}
          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 14, color: theme.textSecondary, marginBottom: 8 }}>{t('common.date')}</Text>
            <TouchableOpacity
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderWidth: 1,
                borderColor: theme.inputBorder,
                borderRadius: 8,
                padding: 12,
              }}
              onPress={() => setShowDatePicker(true)}
            >
              <Text style={{ fontSize: 16, color: theme.text }}>
                {selectedDate.toLocaleDateString('ko-KR', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  weekday: 'short',
                })}
              </Text>
              <Ionicons name="calendar-outline" size={20} color={theme.textSecondary} />
            </TouchableOpacity>
            {showDatePicker && (
              <DateTimePicker
                value={selectedDate}
                mode="date"
                display={Platform.OS === 'ios' ? 'inline' : 'default'}
                onChange={handleDateChange}
                maximumDate={new Date()}
                locale="ko-KR"
                themeVariant={isDark ? 'dark' : 'light'}
              />
            )}
          </View>

          {/* 금액 */}
          <View style={{ marginBottom: 24 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Text style={{ fontSize: 14, color: theme.textSecondary }}>{t('common.amount')}</Text>
              <TouchableOpacity
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: currencyMode === 'KRW' ? theme.backgroundTertiary : theme.warningBanner,
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 16,
                }}
                onPress={toggleCurrencyMode}
              >
                <Text style={{ fontSize: 12, color: currencyMode === 'KRW' ? theme.textSecondary : theme.primary, fontWeight: '600' }}>
                  {currencyMode === 'KRW' ? t('common.krwAmount') : t('common.sats')}
                </Text>
                <Ionicons name="swap-horizontal" size={14} color={currencyMode === 'KRW' ? theme.textSecondary : theme.primary} style={{ marginLeft: 4 }} />
              </TouchableOpacity>
            </View>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                borderWidth: 1,
                borderColor: theme.inputBorder,
                borderRadius: 8,
                paddingHorizontal: 16,
              }}
            >
              <Text style={{ fontSize: 18, color: currencyMode === 'KRW' ? theme.textSecondary : theme.primary, marginRight: 4 }}>
                {currencyMode === 'KRW' ? '₩' : '₿'}
              </Text>
              <TextInput
                style={{ flex: 1, fontSize: 24, fontWeight: 'bold', paddingVertical: 16, color: theme.inputText }}
                placeholder="0"
                placeholderTextColor={theme.placeholder}
                keyboardType="numeric"
                value={amount}
                onChangeText={handleAmountChange}
              />
              {currencyMode === 'SATS' && (
                <Text style={{ fontSize: 14, color: theme.primary }}>{t('common.sats')}</Text>
              )}
            </View>
            {amountNumber > 0 && previewBtcKrw && (
              <Text style={{ fontSize: 12, color: theme.primary, marginTop: 4 }}>
                {currencyMode === 'KRW'
                  ? `≈ ${formatSats(satsAmount)} (${isToday ? t('common.currentRate') : t('common.closingRate')})`
                  : `≈ ${formatKrw(krwAmount)} (${isToday ? t('common.currentRate') : t('common.closingRate')})`
                }
              </Text>
            )}
          </View>

          {/* 카테고리 */}
          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 14, color: theme.textSecondary, marginBottom: 8 }}>{t('income.category')}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {activeIncomeCategories.map(cat => (
                <TouchableOpacity
                  key={cat.id}
                  style={{
                    paddingHorizontal: 16,
                    paddingVertical: 10,
                    borderRadius: 20,
                    backgroundColor: category === cat.name && !showCustomCategory ? cat.color : theme.backgroundTertiary,
                  }}
                  onPress={() => handleCategorySelect(cat.name)}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      color: category === cat.name && !showCustomCategory ? '#FFFFFF' : theme.textSecondary,
                    }}
                  >
                    {cat.icon} {t('categories.' + cat.id)}
                  </Text>
                </TouchableOpacity>
              ))}
              {/* 직접입력 버튼 */}
              <TouchableOpacity
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 10,
                  borderRadius: 20,
                  backgroundColor: showCustomCategory ? '#6B7280' : theme.backgroundTertiary,
                }}
                onPress={() => handleCategorySelect('', true)}
              >
                <Text
                  style={{
                    fontSize: 14,
                    color: showCustomCategory ? '#FFFFFF' : theme.textSecondary,
                  }}
                >
                  {t('income.customCategory')}
                </Text>
              </TouchableOpacity>
            </View>
            {/* 커스텀 카테고리 입력 */}
            {showCustomCategory && (
              <TextInput
                style={{
                  marginTop: 12,
                  borderWidth: 1,
                  borderColor: theme.inputBorder,
                  borderRadius: 8,
                  padding: 12,
                  fontSize: 16,
                  color: theme.inputText,
                }}
                placeholder={t('income.customCategoryPlaceholder')}
                placeholderTextColor={theme.placeholder}
                value={customCategory}
                onChangeText={setCustomCategory}
                autoFocus
              />
            )}
          </View>

          {/* 수입원 */}
          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 14, color: theme.textSecondary, marginBottom: 8 }}>{t('income.source')}</Text>
            <TextInput
              style={{
                borderWidth: 1,
                borderColor: theme.inputBorder,
                borderRadius: 8,
                padding: 12,
                fontSize: 16,
                color: theme.inputText,
              }}
              placeholder={t('income.sourcePlaceholder')}
              placeholderTextColor={theme.placeholder}
              value={source}
              onChangeText={setSource}
            />
          </View>

          {/* 입금 계좌/지갑 */}
          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 14, color: theme.textSecondary, marginBottom: 8 }}>{t('income.depositAccount')}</Text>
            {assets.length === 0 ? (
              <TouchableOpacity
                style={{
                  padding: 16,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: theme.border,
                  borderStyle: 'dashed',
                  alignItems: 'center',
                }}
                onPress={() => router.push('/(modals)/add-asset')}
              >
                <Text style={{ color: theme.textMuted }}>{t('income.addAccountOrWallet')}</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={{
                  borderWidth: 1,
                  borderColor: theme.inputBorder,
                  borderRadius: 8,
                  padding: 12,
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
                onPress={() => setShowAssetPicker(true)}
              >
                <Text style={{ fontSize: 16, color: linkedAssetId ? theme.text : theme.textMuted }}>
                  {linkedAssetId
                    ? assets.find(a => a.id === linkedAssetId)?.name ?? t('common.search')
                    : t('income.selectDepositAccount')}
                </Text>
                <Ionicons name="chevron-forward" size={20} color={theme.textMuted} />
              </TouchableOpacity>
            )}
            <Text style={{ fontSize: 12, color: theme.textMuted, marginTop: 8 }}>
              {t('income.autoAddHint')}
            </Text>
          </View>

          {/* 메모 */}
          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 14, color: theme.textSecondary, marginBottom: 8 }}>{t('common.memo')}</Text>
            <TextInput
              style={{
                borderWidth: 1,
                borderColor: theme.inputBorder,
                borderRadius: 8,
                padding: 12,
                fontSize: 16,
                color: theme.inputText,
              }}
              placeholder={t('common.memoPlaceholder')}
              placeholderTextColor={theme.placeholder}
              value={memo}
              onChangeText={setMemo}
            />
          </View>

          {/* 저장 버튼 */}
          <View style={{ padding: 20, paddingBottom: 40 }}>
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
                {isLoading ? t('common.saving') : t('common.save')}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>

        {/* 입금 계좌/지갑 선택 모달 */}
        <Modal visible={showAssetPicker} transparent animationType="slide">
          <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: theme.modalOverlay }}>
            <View
              style={{
                backgroundColor: theme.modalBackground,
                borderTopLeftRadius: 20,
                borderTopRightRadius: 20,
                padding: 20,
                maxHeight: '70%',
              }}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
                <Text style={{ fontSize: 18, fontWeight: 'bold', color: theme.text }}>{t('income.selectDepositAccount')}</Text>
                <TouchableOpacity onPress={() => setShowAssetPicker(false)}>
                  <Ionicons name="close" size={24} color={theme.textSecondary} />
                </TouchableOpacity>
              </View>

              <ScrollView style={{ maxHeight: 400 }}>
                {/* 법정화폐 계좌 */}
                {assets.filter(isFiatAsset).length > 0 && (
                  <View style={{ marginBottom: 16 }}>
                    <Text style={{ fontSize: 12, color: theme.textMuted, marginBottom: 8 }}>{t('income.bankAccounts')}</Text>
                    {assets.filter(isFiatAsset).map((asset) => (
                      <TouchableOpacity
                        key={asset.id}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          padding: 16,
                          backgroundColor: linkedAssetId === asset.id ? '#D1FAE5' : theme.backgroundSecondary,
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
                        <Text style={{ flex: 1, fontSize: 16, color: theme.text }}>{asset.name}</Text>
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
                    <Text style={{ fontSize: 12, color: theme.textMuted, marginBottom: 8 }}>{t('income.btcWallets')}</Text>
                    {assets.filter(isBitcoinAsset).map((asset) => (
                      <TouchableOpacity
                        key={asset.id}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          padding: 16,
                          backgroundColor: linkedAssetId === asset.id ? theme.warningBanner : theme.backgroundSecondary,
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
                          <Text style={{ fontSize: 16, color: theme.text }}>{asset.name}</Text>
                          <Text style={{ fontSize: 11, color: theme.warningBannerText }}>
                            {isBitcoinAsset(asset) && asset.walletType === 'lightning' ? 'Lightning' : 'Onchain'}
                          </Text>
                        </View>
                        {linkedAssetId === asset.id && (
                          <Ionicons name="checkmark-circle" size={24} color={theme.primary} />
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
                  backgroundColor: theme.backgroundTertiary,
                  borderRadius: 8,
                  alignItems: 'center',
                  marginTop: 8,
                }}
                onPress={() => {
                  setLinkedAssetId(null);
                  setShowAssetPicker(false);
                }}
              >
                <Text style={{ fontSize: 16, color: theme.textSecondary }}>{t('income.noSelection')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
