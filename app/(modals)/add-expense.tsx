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
import { useCardStore } from '../../src/stores/cardStore';
import { usePriceStore } from '../../src/stores/priceStore';
import { useDebtStore } from '../../src/stores/debtStore';
import { useAuthStore } from '../../src/stores/authStore';
import { useAssetStore } from '../../src/stores/assetStore';
import { useCategoryStore } from '../../src/stores/categoryStore';
import { formatKrw, formatSats, getTodayString, getLocale } from '../../src/utils/formatters';
import { krwToSats, satsToKrw } from '../../src/utils/calculations';
import { isFiatAsset, isBitcoinAsset } from '../../src/types/asset';
import { fetchHistoricalBtcPrice } from '../../src/services/api/upbit';
import { getDefaultInstallmentRate } from '../../src/constants/cardCompanies';

type PaymentMethod = 'cash' | 'card' | 'bank' | 'lightning' | 'onchain';
type CurrencyMode = 'KRW' | 'SATS';

const INSTALLMENT_OPTIONS = [
  { value: 1, labelKey: 'home.lumpSum' },
  { value: 2, labelKey: '2' },
  { value: 3, labelKey: '3' },
  { value: 4, labelKey: '4' },
  { value: 5, labelKey: '5' },
  { value: 6, labelKey: '6' },
  { value: 10, labelKey: '10' },
  { value: 12, labelKey: '12' },
  { value: 24, labelKey: '24' },
  { value: -1, labelKey: 'expense.customCategory' }, // -1은 직접입력 표시용
];

export default function AddExpenseScreen() {
  const { t } = useTranslation();
  const { theme, isDark } = useTheme();
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
  const [interestRate, setInterestRate] = useState(''); // 유이자 이율 (%, 빈값이면 카드사 기본 이율 적용)
  const [showInstallmentPicker, setShowInstallmentPicker] = useState(false);
  const [showCustomInstallmentInput, setShowCustomInstallmentInput] = useState(false);
  const [showInsufficientBalanceModal, setShowInsufficientBalanceModal] = useState(false);
  const [memo, setMemo] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [linkedAssetId, setLinkedAssetId] = useState<string | null>(null);
  const [showAssetPicker, setShowAssetPicker] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [historicalBtcKrw, setHistoricalBtcKrw] = useState<number | null>(null);

  const { addExpense } = useLedgerStore();
  const activeExpenseCategories = useCategoryStore(s => s.getActiveExpenseCategories)();
  const { cards, updateCard } = useCardStore();
  const { btcKrw } = usePriceStore();
  const { addInstallment } = useDebtStore();
  const { getEncryptionKey } = useAuthStore();
  const encryptionKey = getEncryptionKey();
  const { assets } = useAssetStore();

  // 선택된 카드의 기본 할부 이율
  const selectedCard = cards.find(c => c.id === selectedCardId);
  const defaultRate = selectedCard
    ? getDefaultInstallmentRate(selectedCard.company, installmentMonths)
    : 15;
  const effectiveRate = parseFloat(interestRate) || defaultRate;

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
    const todayStr = getTodayString();
    if (dateString !== todayStr) {
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
    if (!amountNumber || amountNumber <= 0) {
      Alert.alert(t('common.error'), t('expense.amountRequired'));
      return;
    }

    const finalCategory = showCustomCategory ? customCategory : category;
    if (!finalCategory) {
      Alert.alert(t('common.error'), t('expense.categoryRequired'));
      return;
    }

    if (paymentMethod === 'card' && !selectedCardId) {
      Alert.alert(t('common.error'), t('expense.cardRequired'));
      return;
    }

    if (!encryptionKey) {
      Alert.alert(t('common.error'), t('common.authRequired'));
      return;
    }

    // sats 모드일 때 시세가 없으면 저장 불가
    if (currencyMode === 'SATS' && !btcKrw) {
      Alert.alert(t('common.error'), t('common.networkError'));
      return;
    }

    // 선불카드 잔액 초과 체크
    const selectedCard = paymentMethod === 'card' && selectedCardId
      ? cards.find(c => c.id === selectedCardId)
      : null;

    if (selectedCard?.type === 'prepaid') {
      const cardBalance = selectedCard.balance ?? 0;
      if (krwAmount > cardBalance) {
        setShowInsufficientBalanceModal(true);
        return;
      }
    }

    setIsLoading(true);

    try {
      const dateString = formatDateString(selectedDate);
      const isInstallment = paymentMethod === 'card' && installmentMonths > 1;

      // 1. 선불카드인 경우 잔액 차감 먼저 (atomicity: 차감 성공 후에만 지출 기록)
      if (selectedCard?.type === 'prepaid') {
        const newBalance = (selectedCard.balance ?? 0) - krwAmount;
        await updateCard(selectedCardId!, { balance: Math.max(0, newBalance) });
      }

      // 2. 지출 기록 추가
      // - KRW 모드: amount는 원화, currency는 'KRW'
      // - SATS 모드: amount는 sats, currency는 'SATS'
      // 오늘 날짜면 실시간 현재가, 과거 날짜면 해당 날짜 종가 fetch
      const overrideBtcKrw = dateString === getTodayString() ? btcKrw : undefined;
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
      }, overrideBtcKrw);

      // 3. 할부인 경우, 부채 탭에 할부 기록 자동 생성
      if (isInstallment && selectedCardId) {
        await addInstallment(
          {
            cardId: selectedCardId,
            expenseId: expenseId,
            storeName: finalCategory, // 카테고리를 상점명으로 사용
            totalAmount: krwAmount,
            months: installmentMonths,
            isInterestFree: isInterestFree,
            interestRate: isInterestFree ? 0 : effectiveRate,
            startDate: dateString,
            paidMonths: 0, // 새로 시작하는 할부이므로 0
            memo: memo || undefined,
          },
          encryptionKey
        );
      }

      router.back();
    } catch (error) {
      Alert.alert(t('common.error'), `${error}`);
    } finally {
      setIsLoading(false);
    }
  };

  // 할부 옵션 레이블 생성 함수
  const getInstallmentLabel = (value: number) => {
    if (value === 1) return t('home.lumpSum');
    if (value === -1) return t('expense.customCategory');
    return `${value}${t('common.months')}`;
  };

  return (
    <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={{ flex: 1, backgroundColor: theme.background }}>
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
          <Text style={{ fontSize: 18, fontWeight: 'bold', color: theme.text }}>{t('expense.title')}</Text>
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
                locale={getLocale()}
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
                  ? `= ${formatSats(satsAmount)} (${isToday ? t('common.currentRate') : t('common.closingRate')})`
                  : `= ${formatKrw(krwAmount)} (${isToday ? t('common.currentRate') : t('common.closingRate')})`
                }
              </Text>
            )}
          </View>

          {/* 카테고리 */}
          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 14, color: theme.textSecondary, marginBottom: 8 }}>{t('expense.category')}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {activeExpenseCategories.map(cat => (
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
                  {t('expense.customCategory')}
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
                placeholder={t('expense.customCategoryPlaceholder')}
                placeholderTextColor={theme.placeholder}
                value={customCategory}
                onChangeText={setCustomCategory}
                autoFocus
              />
            )}
          </View>

          {/* 결제 수단 */}
          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 14, color: theme.textSecondary, marginBottom: 8 }}>{t('expense.paymentMethod')}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {[
                { id: 'cash', label: t('expense.cash') },
                { id: 'card', label: t('expense.card') },
                { id: 'bank', label: t('expense.bankTransfer') },
                { id: 'lightning', label: t('expense.lightning') },
                { id: 'onchain', label: t('expense.onchain') },
              ].map(method => (
                <TouchableOpacity
                  key={method.id}
                  style={{
                    paddingVertical: 12,
                    paddingHorizontal: 16,
                    borderRadius: 8,
                    backgroundColor:
                      paymentMethod === method.id ? theme.primary : theme.backgroundTertiary,
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
                      color: paymentMethod === method.id ? '#FFFFFF' : theme.textSecondary,
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
              <Text style={{ fontSize: 14, color: theme.textSecondary, marginBottom: 8 }}>
                {paymentMethod === 'bank' ? t('expense.selectAccount') : paymentMethod === 'lightning' ? t('expense.selectLightningWallet') : t('expense.selectOnchainWallet')}
              </Text>
              {availableAssets.length === 0 ? (
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
                  <Text style={{ color: theme.textMuted }}>
                    {paymentMethod === 'bank' ? t('expense.addAccount') : t('expense.addWallet')}
                  </Text>
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
                      ? availableAssets.find(a => a.id === linkedAssetId)?.name ?? t('common.search')
                      : paymentMethod === 'bank' ? t('expense.accountSelectHint') : t('expense.walletSelectHint')}
                  </Text>
                  <Ionicons name="chevron-forward" size={20} color={theme.textMuted} />
                </TouchableOpacity>
              )}
              <Text style={{ fontSize: 12, color: theme.textMuted, marginTop: 8 }}>
                {t('expense.autoDeductHint')}
              </Text>
            </View>
          )}

          {/* 카드 선택 */}
          {paymentMethod === 'card' && (
            <View style={{ marginBottom: 24 }}>
              <Text style={{ fontSize: 14, color: theme.textSecondary, marginBottom: 8 }}>{t('expense.selectCard')}</Text>
              {cards.length === 0 ? (
                <TouchableOpacity
                  style={{
                    padding: 16,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: theme.border,
                    borderStyle: 'dashed',
                    alignItems: 'center',
                  }}
                  onPress={() => router.push('/(modals)/add-card')}
                >
                  <Text style={{ color: theme.textMuted }}>{t('expense.addCard')}</Text>
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
                          selectedCardId === card.id ? card.color : theme.backgroundTertiary,
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
                          color: selectedCardId === card.id ? '#FFFFFF' : theme.text,
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
              <Text style={{ fontSize: 14, color: theme.textSecondary, marginBottom: 8 }}>{t('expense.installment')}</Text>
              {showCustomInstallmentInput ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <TextInput
                    style={{
                      flex: 1,
                      borderWidth: 1,
                      borderColor: theme.inputBorder,
                      borderRadius: 8,
                      padding: 12,
                      fontSize: 16,
                      color: theme.inputText,
                    }}
                    placeholder={t('expense.monthsInput')}
                    placeholderTextColor={theme.placeholder}
                    keyboardType="numeric"
                    value={customInstallment}
                    onChangeText={(text) => {
                      const num = text.replace(/[^0-9]/g, '');
                      setCustomInstallment(num);
                      if (num) setInstallmentMonths(parseInt(num));
                    }}
                    autoFocus
                  />
                  <Text style={{ fontSize: 16, color: theme.textSecondary }}>{t('common.months')}</Text>
                  <TouchableOpacity
                    onPress={() => {
                      setShowCustomInstallmentInput(false);
                      setCustomInstallment('');
                      setInstallmentMonths(1);
                    }}
                  >
                    <Ionicons name="close-circle" size={24} color={theme.textMuted} />
                  </TouchableOpacity>
                </View>
              ) : (
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
                  onPress={() => setShowInstallmentPicker(true)}
                >
                  <Text style={{ fontSize: 16, color: theme.text }}>
                    {installmentMonths === 1 ? t('home.lumpSum') : `${installmentMonths}${t('common.months')}`}
                  </Text>
                  <Ionicons name="chevron-down" size={20} color={theme.textSecondary} />
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
                      backgroundColor: isInterestFree ? '#22C55E' : theme.backgroundTertiary,
                      alignItems: 'center',
                    }}
                    onPress={() => setIsInterestFree(true)}
                  >
                    <Text style={{ fontSize: 14, color: isInterestFree ? '#FFFFFF' : theme.textSecondary, fontWeight: '600' }}>
                      {t('common.noInterest')}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{
                      flex: 1,
                      paddingVertical: 10,
                      borderRadius: 8,
                      backgroundColor: !isInterestFree ? '#EF4444' : theme.backgroundTertiary,
                      alignItems: 'center',
                    }}
                    onPress={() => setIsInterestFree(false)}
                  >
                    <Text style={{ fontSize: 14, color: !isInterestFree ? '#FFFFFF' : theme.textSecondary, fontWeight: '600' }}>
                      {t('common.withInterest')}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* 유이자 이율 입력 */}
              {installmentMonths > 1 && !isInterestFree && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 }}>
                  <Text style={{ fontSize: 14, color: theme.textSecondary }}>{t('expense.annualRate')}</Text>
                  <TextInput
                    style={{
                      borderWidth: 1,
                      borderColor: theme.inputBorder,
                      borderRadius: 8,
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      fontSize: 16,
                      color: theme.inputText,
                      width: 80,
                      textAlign: 'center',
                    }}
                    keyboardType="decimal-pad"
                    value={interestRate}
                    onChangeText={setInterestRate}
                    placeholder={String(defaultRate)}
                    placeholderTextColor={theme.placeholder}
                  />
                  <Text style={{ fontSize: 14, color: theme.textSecondary }}>%</Text>
                </View>
              )}

              {installmentMonths > 1 && krwAmount > 0 && (
                <Text style={{ fontSize: 12, color: theme.textSecondary, marginTop: 8 }}>
                  {t('expense.installmentSummary', {
                    amount: formatKrw(Math.ceil(krwAmount / installmentMonths)),
                    months: installmentMonths,
                    interest: isInterestFree ? `(${t('common.noInterest')})` : `(${effectiveRate}%)`,
                  })}
                </Text>
              )}
            </View>
          )}

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
                {isLoading ? t('common.saving') : t('common.save')}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>

        {/* 할부 선택 모달 */}
        <Modal
          visible={showInstallmentPicker}
          transparent
          animationType="slide"
        >
          <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: theme.modalOverlay }}>
            <View style={{ backgroundColor: theme.modalBackground, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <Text style={{ fontSize: 18, fontWeight: 'bold', color: theme.text }}>{t('expense.selectInstallment')}</Text>
                <TouchableOpacity onPress={() => setShowInstallmentPicker(false)}>
                  <Ionicons name="close" size={24} color={theme.textSecondary} />
                </TouchableOpacity>
              </View>
              <ScrollView style={{ maxHeight: 300 }}>
                {INSTALLMENT_OPTIONS.map(option => (
                  <TouchableOpacity
                    key={option.value}
                    style={{
                      padding: 16,
                      borderRadius: 8,
                      backgroundColor: installmentMonths === option.value && !showCustomInstallmentInput ? theme.primary : theme.backgroundTertiary,
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
                      color: installmentMonths === option.value && !showCustomInstallmentInput ? '#FFFFFF' : theme.text,
                      textAlign: 'center',
                    }}>
                      {getInstallmentLabel(option.value)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>
        </Modal>

        {/* 자산 선택 모달 */}
        <Modal visible={showAssetPicker} transparent animationType="slide">
          <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: theme.modalOverlay }}>
            <View
              style={{
                backgroundColor: theme.modalBackground,
                borderTopLeftRadius: 20,
                borderTopRightRadius: 20,
                padding: 20,
                maxHeight: '60%',
              }}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
                <Text style={{ fontSize: 18, fontWeight: 'bold', color: theme.text }}>
                  {paymentMethod === 'bank' ? t('expense.selectAccount') : paymentMethod === 'lightning' ? t('expense.selectLightningWallet') : t('expense.selectOnchainWallet')}
                </Text>
                <TouchableOpacity onPress={() => setShowAssetPicker(false)}>
                  <Ionicons name="close" size={24} color={theme.textSecondary} />
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
                    <Text style={{ flex: 1, fontSize: 16, color: theme.text }}>{asset.name}</Text>
                    {linkedAssetId === asset.id && (
                      <Ionicons name="checkmark-circle" size={24} color={theme.primary} />
                    )}
                  </TouchableOpacity>
                ))}
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

      {/* 잔액 부족 모달 (선불카드) */}
      <Modal visible={showInsufficientBalanceModal} transparent animationType="fade">
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.modalOverlay }}>
          <View
            style={{
              backgroundColor: theme.modalBackground,
              borderRadius: 16,
              padding: 24,
              width: '80%',
              alignItems: 'center',
            }}
          >
            <Ionicons name="warning" size={48} color="#F59E0B" style={{ marginBottom: 16 }} />
            <Text style={{ fontSize: 18, fontWeight: 'bold', color: theme.text, marginBottom: 8 }}>
              {t('card.insufficientBalance')}
            </Text>
            <Text style={{ fontSize: 14, color: theme.textSecondary, textAlign: 'center', marginBottom: 16 }}>
              {t('card.currentBalance', {
                balance: formatKrw(
                  cards.find(c => c.id === selectedCardId)?.balance ?? 0
                ),
              })}
            </Text>
            <TouchableOpacity
              style={{
                backgroundColor: theme.primary,
                paddingHorizontal: 32,
                paddingVertical: 12,
                borderRadius: 8,
              }}
              onPress={() => setShowInsufficientBalanceModal(false)}
            >
              <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '600' }}>{t('common.confirm')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
