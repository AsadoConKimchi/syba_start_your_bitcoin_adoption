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
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../src/hooks/useTheme';
import { useLedgerStore } from '../../src/stores/ledgerStore';
import { useCardStore } from '../../src/stores/cardStore';
import { usePriceStore } from '../../src/stores/priceStore';
import { useAssetStore } from '../../src/stores/assetStore';
import { DEFAULT_EXPENSE_CATEGORIES, DEFAULT_INCOME_CATEGORIES } from '../../src/constants/categories';
import { formatKrw, formatSats } from '../../src/utils/formatters';
import { krwToSats, satsToKrw } from '../../src/utils/calculations';
import { isFiatAsset, isBitcoinAsset } from '../../src/types/asset';
import { LedgerRecord, isExpense, isTransfer } from '../../src/types/ledger';

type PaymentMethod = 'cash' | 'card' | 'lightning' | 'onchain' | 'bank';
type CurrencyMode = 'KRW' | 'SATS';

const INSTALLMENT_OPTIONS = [
  { value: 1, labelKey: 'lumpSum' },
  { value: 2, labelKey: '2' },
  { value: 3, labelKey: '3' },
  { value: 4, labelKey: '4' },
  { value: 5, labelKey: '5' },
  { value: 6, labelKey: '6' },
  { value: 10, labelKey: '10' },
  { value: 12, labelKey: '12' },
  { value: 24, labelKey: '24' },
  { value: -1, labelKey: 'custom' },
];

export default function EditRecordScreen() {
  const { t } = useTranslation();
  const { theme, isDark } = useTheme();
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
  const [linkedAssetId, setLinkedAssetId] = useState<string | null>(null);
  const [showAssetPicker, setShowAssetPicker] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const { assets } = useAssetStore();

  // 결제수단별 자산 필터링
  const fiatAssets = assets.filter(isFiatAsset);
  const lightningAssets = assets.filter(a => isBitcoinAsset(a) && a.walletType === 'lightning');
  const onchainAssets = assets.filter(a => isBitcoinAsset(a) && a.walletType === 'onchain');

  const getAssetsForPaymentMethod = () => {
    switch (paymentMethod) {
      case 'bank': return fiatAssets;
      case 'lightning': return lightningAssets;
      case 'onchain': return onchainAssets;
      default: return [];
    }
  };

  const availableAssets = getAssetsForPaymentMethod();

  // 초기값 설정
  useEffect(() => {
    if (record && !isTransfer(record)) {
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
        setLinkedAssetId(record.linkedAssetId || null);
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

  if (!record || isTransfer(record)) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: theme.text }}>{t('editRecord.notFound')}</Text>
      </SafeAreaView>
    );
  }

  const amountNumber = parseInt(amount.replace(/[^0-9]/g, '')) || 0;
  // 기록 당시 시세 우선 사용 (없으면 현재 시세로 fallback)
  const recordBtcKrw = (!isTransfer(record) && record.btcKrwAtTime) ? record.btcKrwAtTime : btcKrw;
  const krwAmount = currencyMode === 'KRW' ? amountNumber : recordBtcKrw ? satsToKrw(amountNumber, recordBtcKrw) : 0;
  const satsAmount = currencyMode === 'SATS' ? amountNumber : recordBtcKrw ? krwToSats(amountNumber, recordBtcKrw) : 0;

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
      Alert.alert(t('common.error'), t('editRecord.amountRequired'));
      return;
    }

    const finalCategory = showCustomCategory ? customCategory : category;
    if (!finalCategory) {
      Alert.alert(t('common.error'), t('editRecord.categoryRequired'));
      return;
    }

    if (isExpenseRecord && paymentMethod === 'card' && !selectedCardId) {
      Alert.alert(t('common.error'), t('editRecord.cardRequired'));
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
      // 금액 변경 시 기록 당시 시세 기준으로 satsEquivalent 재계산
      if (recordBtcKrw) {
        (updates as any).satsEquivalent = satsAmount;
      }

      if (isExpenseRecord) {
        Object.assign(updates, {
          paymentMethod,
          cardId: paymentMethod === 'card' ? selectedCardId : null,
          installmentMonths: paymentMethod === 'card' && installmentMonths > 1 ? installmentMonths : null,
          isInterestFree: paymentMethod === 'card' && installmentMonths > 1 ? isInterestFree : null,
          linkedAssetId: (paymentMethod === 'bank' || paymentMethod === 'lightning' || paymentMethod === 'onchain') ? linkedAssetId : null,
        });
      } else {
        Object.assign(updates, {
          source: source || null,
        });
      }

      await updateRecord(record.id, updates);
      router.back();
    } catch (error) {
      Alert.alert(t('common.error'), t('editRecord.editFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      t('editRecord.deleteConfirm'),
      t('editRecord.deleteMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
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

  // 할부 옵션 레이블 생성 함수
  const getInstallmentLabel = (value: number) => {
    if (value === 1) return t('home.lumpSum');
    if (value === -1) return t('expense.customCategory');
    return `${value}${t('common.months')}`;
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
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
            {t('editRecord.title')}
          </Text>
          <View style={{ flexDirection: 'row', gap: 16 }}>
            <TouchableOpacity onPress={handleDelete}>
              <Ionicons name="trash-outline" size={24} color={theme.error} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.back()}>
              <Ionicons name="close" size={24} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView style={{ flex: 1, padding: 20 }} keyboardShouldPersistTaps="handled">
          {/* 날짜 선택 */}
          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 14, color: theme.textSecondary, marginBottom: 8 }}>{t('common.date')}</Text>
            <TouchableOpacity
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderWidth: 1,
                borderColor: theme.border,
                borderRadius: 8,
                padding: 12,
                backgroundColor: theme.backgroundSecondary,
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
                borderColor: theme.border,
                borderRadius: 8,
                paddingHorizontal: 16,
                backgroundColor: theme.backgroundSecondary,
              }}
            >
              <Text style={{ fontSize: 18, color: currencyMode === 'KRW' ? theme.textSecondary : theme.primary, marginRight: 4 }}>
                {currencyMode === 'KRW' ? '₩' : '₿'}
              </Text>
              <TextInput
                style={{ flex: 1, fontSize: 24, fontWeight: 'bold', paddingVertical: 16, color: theme.text }}
                placeholder="0"
                placeholderTextColor={theme.placeholder}
                keyboardType="numeric"
                value={amount}
                onChangeText={handleAmountChange}
              />
              {currencyMode === 'SATS' && <Text style={{ fontSize: 14, color: theme.primary }}>{t('common.sats')}</Text>}
            </View>
            {amountNumber > 0 && recordBtcKrw && (
              <Text style={{ fontSize: 12, color: theme.primary, marginTop: 4 }}>
                {currencyMode === 'KRW' ? `= ${formatSats(satsAmount)} (${t('common.recordedRate')})` : `= ${formatKrw(krwAmount)} (${t('common.recordedRate')})`}
              </Text>
            )}
          </View>

          {/* 카테고리 */}
          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 14, color: theme.textSecondary, marginBottom: 8 }}>{t('expense.category')}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {categories.map(cat => (
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
                  <Text style={{ fontSize: 14, color: category === cat.name && !showCustomCategory ? '#FFFFFF' : theme.textSecondary }}>
                    {cat.icon} {t('categories.' + cat.id)}
                  </Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 10,
                  borderRadius: 20,
                  backgroundColor: showCustomCategory ? '#6B7280' : theme.backgroundTertiary,
                }}
                onPress={() => handleCategorySelect('', true)}
              >
                <Text style={{ fontSize: 14, color: showCustomCategory ? '#FFFFFF' : theme.textSecondary }}>{t('expense.customCategory')}</Text>
              </TouchableOpacity>
            </View>
            {showCustomCategory && (
              <TextInput
                style={{
                  marginTop: 12,
                  borderWidth: 1,
                  borderColor: theme.border,
                  borderRadius: 8,
                  padding: 12,
                  fontSize: 16,
                  color: theme.inputText,
                  backgroundColor: theme.backgroundSecondary,
                }}
                placeholder={t('expense.customCategoryPlaceholder')}
                placeholderTextColor={theme.placeholder}
                value={customCategory}
                onChangeText={setCustomCategory}
              />
            )}
          </View>

          {/* 지출: 결제 수단 */}
          {isExpenseRecord && (
            <>
              <View style={{ marginBottom: 24 }}>
                <Text style={{ fontSize: 14, color: theme.textSecondary, marginBottom: 8 }}>{t('expense.paymentMethod')}</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {[
                    { id: 'cash', label: t('expense.cash') },
                    { id: 'card', label: t('expense.card') },
                    { id: 'bank', label: t('expense.bankTransfer') },
                    { id: 'lightning', label: '⚡' },
                    { id: 'onchain', label: '₿' },
                  ].map(method => (
                    <TouchableOpacity
                      key={method.id}
                      style={{
                        paddingVertical: 12,
                        paddingHorizontal: 16,
                        borderRadius: 8,
                        backgroundColor: paymentMethod === method.id ? theme.primary : theme.backgroundTertiary,
                        alignItems: 'center',
                      }}
                      onPress={() => {
                        setPaymentMethod(method.id as PaymentMethod);
                        setLinkedAssetId(null);
                      }}
                    >
                      <Text style={{ fontSize: 14, color: paymentMethod === method.id ? '#FFFFFF' : theme.textSecondary }}>
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
                        borderColor: theme.border,
                        borderRadius: 8,
                        padding: 12,
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        backgroundColor: theme.backgroundSecondary,
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
                            backgroundColor: selectedCardId === card.id ? card.color : theme.backgroundTertiary,
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
                          <Text style={{ color: selectedCardId === card.id ? '#FFFFFF' : theme.text }}>{card.name}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
              )}

              {/* 할부 */}
              {paymentMethod === 'card' && selectedCardId && (
                <View style={{ marginBottom: 24 }}>
                  <Text style={{ fontSize: 14, color: theme.textSecondary, marginBottom: 8 }}>{t('expense.installment')}</Text>
                  {showCustomInstallmentInput ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <TextInput
                        style={{
                          flex: 1,
                          borderWidth: 1,
                          borderColor: theme.border,
                          borderRadius: 8,
                          padding: 12,
                          fontSize: 16,
                          color: theme.inputText,
                          backgroundColor: theme.backgroundSecondary,
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
                        borderColor: theme.border,
                        borderRadius: 8,
                        padding: 12,
                        backgroundColor: theme.backgroundSecondary,
                      }}
                      onPress={() => setShowInstallmentPicker(true)}
                    >
                      <Text style={{ fontSize: 16, color: theme.text }}>
                        {installmentMonths === 1 ? t('home.lumpSum') : `${installmentMonths}${t('common.months')}`}
                      </Text>
                      <Ionicons name="chevron-down" size={20} color={theme.textSecondary} />
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
                          backgroundColor: isInterestFree ? theme.success : theme.backgroundTertiary,
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
                          backgroundColor: !isInterestFree ? theme.error : theme.backgroundTertiary,
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

                  {installmentMonths > 1 && krwAmount > 0 && (
                    <Text style={{ fontSize: 12, color: theme.textSecondary, marginTop: 8 }}>
                      {t('expense.installmentSummary', {
                        amount: formatKrw(Math.ceil(krwAmount / installmentMonths)),
                        months: installmentMonths,
                        interest: isInterestFree ? `(${t('common.noInterest')})` : `(${t('common.withInterest')})`,
                      })}
                    </Text>
                  )}
                </View>
              )}
            </>
          )}

          {/* 수입: 수입원 */}
          {!isExpenseRecord && (
            <View style={{ marginBottom: 24 }}>
              <Text style={{ fontSize: 14, color: theme.textSecondary, marginBottom: 8 }}>{t('income.source')}</Text>
              <TextInput
                style={{
                  borderWidth: 1,
                  borderColor: theme.border,
                  borderRadius: 8,
                  padding: 12,
                  fontSize: 16,
                  color: theme.inputText,
                  backgroundColor: theme.backgroundSecondary,
                }}
                placeholder={t('income.sourcePlaceholder')}
                placeholderTextColor={theme.placeholder}
                value={source}
                onChangeText={setSource}
              />
            </View>
          )}

          {/* 메모 */}
          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 14, color: theme.textSecondary, marginBottom: 8 }}>{t('common.memo')}</Text>
            <TextInput
              style={{
                borderWidth: 1,
                borderColor: theme.border,
                borderRadius: 8,
                padding: 12,
                fontSize: 16,
                color: theme.inputText,
                backgroundColor: theme.backgroundSecondary,
              }}
              placeholder={t('common.memoPlaceholder')}
              placeholderTextColor={theme.placeholder}
              value={memo}
              onChangeText={setMemo}
            />
          </View>

          {/* 기록 정보 */}
          <View style={{ marginBottom: 24, padding: 12, backgroundColor: theme.backgroundSecondary, borderRadius: 8 }}>
            <Text style={{ fontSize: 12, color: theme.textMuted }}>
              {t('editRecord.created')}: {new Date(record.createdAt).toLocaleString()}
            </Text>
            {record.updatedAt !== record.createdAt && (
              <Text style={{ fontSize: 12, color: theme.textMuted, marginTop: 4 }}>
                {t('editRecord.modified')}: {new Date(record.updatedAt).toLocaleString()}
              </Text>
            )}
            {record.satsEquivalent && (
              <Text style={{ fontSize: 12, color: theme.primary, marginTop: 4 }}>
                {t('editRecord.recordedRate')}: {formatSats(record.satsEquivalent)}
              </Text>
            )}
          </View>

          {/* 저장 버튼 */}
          <View style={{ padding: 20, paddingBottom: 40 }}>
            <TouchableOpacity
              style={{
                backgroundColor: isExpenseRecord ? theme.error : theme.success,
                padding: 16,
                borderRadius: 8,
                alignItems: 'center',
                opacity: isLoading ? 0.7 : 1,
              }}
              onPress={handleSave}
              disabled={isLoading}
            >
              <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '600' }}>
                {isLoading ? t('common.saving') : t('common.done')}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>

        {/* 할부 선택 모달 */}
        <Modal visible={showInstallmentPicker} transparent animationType="slide">
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
                        color: installmentMonths === option.value && !showCustomInstallmentInput ? '#FFFFFF' : theme.text,
                        textAlign: 'center',
                      }}
                    >
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
                        backgroundColor: paymentMethod === 'bank' ? theme.incomeButtonBg : theme.warningBanner,
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
