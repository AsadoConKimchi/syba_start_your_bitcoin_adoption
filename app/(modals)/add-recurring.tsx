import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, Alert,
  KeyboardAvoidingView, Platform, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../src/hooks/useTheme';
import { useRecurringStore } from '../../src/stores/recurringStore';
import { useCardStore } from '../../src/stores/cardStore';
import { useAssetStore } from '../../src/stores/assetStore';
import { useAuthStore } from '../../src/stores/authStore';
import { useCategoryStore } from '../../src/stores/categoryStore';
import { isFiatAsset } from '../../src/types/asset';

type PaymentMethod = 'card' | 'bank' | 'cash';

export default function AddRecurringScreen() {
  const { t } = useTranslation();
  const { theme, isDark } = useTheme();
  const { addRecurring } = useRecurringStore();
  const { cards } = useCardStore();
  const { assets } = useAssetStore();
  const { getEncryptionKey } = useAuthStore();
  const activeExpenseCategories = useCategoryStore(s => s.getActiveExpenseCategories)();

  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [customCategory, setCustomCategory] = useState('');
  const [showCustomCategory, setShowCustomCategory] = useState(false);
  const [frequency, setFrequency] = useState<'monthly' | 'yearly'>('monthly');
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [monthOfYear, setMonthOfYear] = useState(1);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('bank');
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [linkedAssetId, setLinkedAssetId] = useState<string | null>(null);
  const [startDate, setStartDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showDayPicker, setShowDayPicker] = useState(false);
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [showAssetPicker, setShowAssetPicker] = useState(false);
  const [memo, setMemo] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const fiatAssets = assets.filter(isFiatAsset);
  const amountNumber = parseInt(amount.replace(/[^0-9]/g, '')) || 0;

  const handleAmountChange = (text: string) => {
    const numbers = text.replace(/[^0-9]/g, '');
    if (numbers) {
      setAmount(parseInt(numbers).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','));
    } else {
      setAmount('');
    }
  };

  const formatDateString = (date: Date): string => {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert(t('common.error'), t('recurring.nameRequired'));
      return;
    }
    if (!amountNumber) {
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
    const encryptionKey = getEncryptionKey();
    if (!encryptionKey) return;

    setIsLoading(true);
    try {
      await addRecurring({
        name: name.trim(),
        amount: amountNumber,
        currency: 'KRW',
        category: finalCategory,
        frequency,
        dayOfMonth,
        ...(frequency === 'yearly' ? { monthOfYear } : {}),
        paymentMethod,
        ...(paymentMethod === 'card' ? { cardId: selectedCardId! } : {}),
        ...(paymentMethod === 'bank' && linkedAssetId ? { linkedAssetId } : {}),
        isActive: true,
        startDate: formatDateString(startDate),
        memo: memo || undefined,
      }, encryptionKey);
      router.back();
    } catch (error) {
      Alert.alert(t('common.error'), `${error}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: theme.border }}>
          <Text style={{ fontSize: 18, fontWeight: 'bold', color: theme.text }}>{t('recurring.addTitle')}</Text>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="close" size={24} color={theme.textSecondary} />
          </TouchableOpacity>
        </View>

        <ScrollView style={{ flex: 1, padding: 20 }} contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          {/* Name */}
          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 14, color: theme.textSecondary, marginBottom: 8 }}>{t('recurring.name')}</Text>
            <TextInput
              style={{ borderWidth: 1, borderColor: theme.inputBorder, borderRadius: 8, padding: 12, fontSize: 16, color: theme.inputText }}
              placeholder={t('recurring.namePlaceholder')}
              placeholderTextColor={theme.placeholder}
              value={name}
              onChangeText={setName}
            />
          </View>

          {/* Amount */}
          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 14, color: theme.textSecondary, marginBottom: 8 }}>{t('common.amount')}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: theme.inputBorder, borderRadius: 8, paddingHorizontal: 16 }}>
              <Text style={{ fontSize: 18, color: theme.textSecondary, marginRight: 4 }}>₩</Text>
              <TextInput
                style={{ flex: 1, fontSize: 24, fontWeight: 'bold', paddingVertical: 16, color: theme.inputText }}
                placeholder="0"
                placeholderTextColor={theme.placeholder}
                keyboardType="numeric"
                value={amount}
                onChangeText={handleAmountChange}
              />
            </View>
          </View>

          {/* Category */}
          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 14, color: theme.textSecondary, marginBottom: 8 }}>{t('expense.category')}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {activeExpenseCategories.map(cat => (
                <TouchableOpacity
                  key={cat.id}
                  style={{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, backgroundColor: category === cat.name && !showCustomCategory ? cat.color : theme.backgroundTertiary }}
                  onPress={() => { setShowCustomCategory(false); setCustomCategory(''); setCategory(cat.name); }}
                >
                  <Text style={{ fontSize: 14, color: category === cat.name && !showCustomCategory ? '#FFFFFF' : theme.textSecondary }}>
                    {cat.icon} {t('categories.' + cat.id)}
                  </Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, backgroundColor: showCustomCategory ? '#6B7280' : theme.backgroundTertiary }}
                onPress={() => { setShowCustomCategory(true); setCategory(''); }}
              >
                <Text style={{ fontSize: 14, color: showCustomCategory ? '#FFFFFF' : theme.textSecondary }}>{t('expense.customCategory')}</Text>
              </TouchableOpacity>
            </View>
            {showCustomCategory && (
              <TextInput
                style={{ marginTop: 12, borderWidth: 1, borderColor: theme.inputBorder, borderRadius: 8, padding: 12, fontSize: 16, color: theme.inputText }}
                placeholder={t('expense.customCategoryPlaceholder')}
                placeholderTextColor={theme.placeholder}
                value={customCategory}
                onChangeText={setCustomCategory}
                autoFocus
              />
            )}
          </View>

          {/* Frequency */}
          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 14, color: theme.textSecondary, marginBottom: 8 }}>{t('recurring.frequency')}</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {(['monthly', 'yearly'] as const).map(f => (
                <TouchableOpacity
                  key={f}
                  style={{ flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center', backgroundColor: frequency === f ? theme.primary : theme.backgroundTertiary }}
                  onPress={() => setFrequency(f)}
                >
                  <Text style={{ fontSize: 14, color: frequency === f ? '#FFFFFF' : theme.textSecondary }}>
                    {t(`recurring.${f}`)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Day of month */}
          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 14, color: theme.textSecondary, marginBottom: 8 }}>{t('recurring.paymentDay')}</Text>
            <TouchableOpacity
              style={{ borderWidth: 1, borderColor: theme.inputBorder, borderRadius: 8, padding: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
              onPress={() => setShowDayPicker(true)}
            >
              <Text style={{ fontSize: 16, color: theme.text }}>{t('recurring.everyMonth', { day: dayOfMonth })}</Text>
              <Ionicons name="chevron-forward" size={20} color={theme.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Month of year (yearly only) */}
          {frequency === 'yearly' && (
            <View style={{ marginBottom: 24 }}>
              <Text style={{ fontSize: 14, color: theme.textSecondary, marginBottom: 8 }}>{t('recurring.paymentMonth')}</Text>
              <TouchableOpacity
                style={{ borderWidth: 1, borderColor: theme.inputBorder, borderRadius: 8, padding: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
                onPress={() => setShowMonthPicker(true)}
              >
                <Text style={{ fontSize: 16, color: theme.text }}>{t('recurring.everyYear', { month: monthOfYear })}</Text>
                <Ionicons name="chevron-forward" size={20} color={theme.textMuted} />
              </TouchableOpacity>
            </View>
          )}

          {/* Payment method */}
          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 14, color: theme.textSecondary, marginBottom: 8 }}>{t('expense.paymentMethod')}</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {([
                { id: 'bank', label: t('expense.bankTransfer') },
                { id: 'card', label: t('expense.card') },
                { id: 'cash', label: t('expense.cash') },
              ] as const).map(m => (
                <TouchableOpacity
                  key={m.id}
                  style={{ flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center', backgroundColor: paymentMethod === m.id ? theme.primary : theme.backgroundTertiary }}
                  onPress={() => { setPaymentMethod(m.id); setSelectedCardId(null); setLinkedAssetId(null); }}
                >
                  <Text style={{ fontSize: 14, color: paymentMethod === m.id ? '#FFFFFF' : theme.textSecondary }}>{m.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Card selector */}
          {paymentMethod === 'card' && cards.length > 0 && (
            <View style={{ marginBottom: 24 }}>
              <Text style={{ fontSize: 14, color: theme.textSecondary, marginBottom: 8 }}>{t('expense.selectCard')}</Text>
              <View style={{ gap: 8 }}>
                {cards.map(card => (
                  <TouchableOpacity
                    key={card.id}
                    style={{ padding: 12, borderRadius: 8, backgroundColor: selectedCardId === card.id ? card.color : theme.backgroundTertiary, flexDirection: 'row', alignItems: 'center' }}
                    onPress={() => setSelectedCardId(card.id)}
                  >
                    <View style={{ width: 24, height: 16, borderRadius: 2, backgroundColor: selectedCardId === card.id ? '#FFFFFF' : card.color, marginRight: 8 }} />
                    <Text style={{ color: selectedCardId === card.id ? '#FFFFFF' : theme.text }}>{card.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Account selector */}
          {paymentMethod === 'bank' && fiatAssets.length > 0 && (
            <View style={{ marginBottom: 24 }}>
              <Text style={{ fontSize: 14, color: theme.textSecondary, marginBottom: 8 }}>{t('expense.selectAccount')}</Text>
              <TouchableOpacity
                style={{ borderWidth: 1, borderColor: theme.inputBorder, borderRadius: 8, padding: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
                onPress={() => setShowAssetPicker(true)}
              >
                <Text style={{ fontSize: 16, color: linkedAssetId ? theme.text : theme.textMuted }}>
                  {linkedAssetId ? fiatAssets.find(a => a.id === linkedAssetId)?.name ?? '' : t('expense.accountSelectHint')}
                </Text>
                <Ionicons name="chevron-forward" size={20} color={theme.textMuted} />
              </TouchableOpacity>
            </View>
          )}

          {/* Start date */}
          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 14, color: theme.textSecondary, marginBottom: 8 }}>{t('recurring.startDate')}</Text>
            <TouchableOpacity
              style={{ borderWidth: 1, borderColor: theme.inputBorder, borderRadius: 8, padding: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
              onPress={() => setShowDatePicker(true)}
            >
              <Text style={{ fontSize: 16, color: theme.text }}>
                {startDate.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}
              </Text>
              <Ionicons name="calendar-outline" size={20} color={theme.textSecondary} />
            </TouchableOpacity>
            {showDatePicker && (
              <DateTimePicker
                value={startDate}
                mode="date"
                display={Platform.OS === 'ios' ? 'inline' : 'default'}
                onChange={(_, date) => { setShowDatePicker(Platform.OS === 'ios'); if (date) setStartDate(date); }}
                locale="ko-KR"
                themeVariant={isDark ? 'dark' : 'light'}
              />
            )}
          </View>

          {/* Memo */}
          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 14, color: theme.textSecondary, marginBottom: 8 }}>{t('common.memo')}</Text>
            <TextInput
              style={{ borderWidth: 1, borderColor: theme.inputBorder, borderRadius: 8, padding: 12, fontSize: 16, color: theme.inputText }}
              placeholder={t('common.memoPlaceholder')}
              placeholderTextColor={theme.placeholder}
              value={memo}
              onChangeText={setMemo}
            />
          </View>

          {/* Save button */}
          <View style={{ padding: 20, paddingBottom: 40 }}>
            <TouchableOpacity
              style={{ backgroundColor: theme.primary, padding: 16, borderRadius: 8, alignItems: 'center', opacity: isLoading ? 0.7 : 1 }}
              onPress={handleSave}
              disabled={isLoading}
            >
              <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '600' }}>
                {isLoading ? t('common.saving') : t('common.save')}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Day picker modal */}
      <Modal visible={showDayPicker} transparent animationType="slide">
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: theme.modalOverlay }}>
          <View style={{ backgroundColor: theme.modalBackground, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: theme.text }}>{t('recurring.selectDay')}</Text>
              <TouchableOpacity onPress={() => setShowDayPicker(false)}>
                <Ionicons name="close" size={24} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {Array.from({ length: 28 }, (_, i) => i + 1).map(day => (
                <TouchableOpacity
                  key={day}
                  style={{ width: '14.28%', padding: 10, alignItems: 'center', backgroundColor: dayOfMonth === day ? theme.primary : 'transparent', borderRadius: 8 }}
                  onPress={() => { setDayOfMonth(day); setShowDayPicker(false); }}
                >
                  <Text style={{ fontSize: 16, color: dayOfMonth === day ? '#FFFFFF' : theme.text }}>{day}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </Modal>

      {/* Month picker modal (yearly) */}
      <Modal visible={showMonthPicker} transparent animationType="slide">
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: theme.modalOverlay }}>
          <View style={{ backgroundColor: theme.modalBackground, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: theme.text }}>{t('recurring.selectMonth')}</Text>
              <TouchableOpacity onPress={() => setShowMonthPicker(false)}>
                <Ionicons name="close" size={24} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                <TouchableOpacity
                  key={m}
                  style={{ width: '23%', padding: 12, alignItems: 'center', backgroundColor: monthOfYear === m ? theme.primary : theme.backgroundTertiary, borderRadius: 8 }}
                  onPress={() => { setMonthOfYear(m); setShowMonthPicker(false); }}
                >
                  <Text style={{ fontSize: 16, color: monthOfYear === m ? '#FFFFFF' : theme.text }}>{m}{t('common.month')}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </Modal>

      {/* Asset picker modal */}
      <Modal visible={showAssetPicker} transparent animationType="slide">
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: theme.modalOverlay }}>
          <View style={{ backgroundColor: theme.modalBackground, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '60%' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: theme.text }}>{t('expense.selectAccount')}</Text>
              <TouchableOpacity onPress={() => setShowAssetPicker(false)}>
                <Ionicons name="close" size={24} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 300 }}>
              {fiatAssets.map(asset => (
                <TouchableOpacity
                  key={asset.id}
                  style={{ flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: linkedAssetId === asset.id ? theme.warningBanner : theme.backgroundSecondary, borderRadius: 8, marginBottom: 8 }}
                  onPress={() => { setLinkedAssetId(asset.id); setShowAssetPicker(false); }}
                >
                  <Text style={{ fontSize: 18, marginRight: 12 }}>🏦</Text>
                  <Text style={{ flex: 1, fontSize: 16, color: theme.text }}>{asset.name}</Text>
                  {linkedAssetId === asset.id && <Ionicons name="checkmark-circle" size={24} color={theme.primary} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity
              style={{ padding: 16, backgroundColor: theme.backgroundTertiary, borderRadius: 8, alignItems: 'center', marginTop: 8 }}
              onPress={() => { setLinkedAssetId(null); setShowAssetPicker(false); }}
            >
              <Text style={{ fontSize: 16, color: theme.textSecondary }}>{t('income.noSelection')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
