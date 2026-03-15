import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, Alert,
  KeyboardAvoidingView, Platform, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../src/hooks/useTheme';
import { useRecurringTransferStore } from '../../src/stores/recurringTransferStore';
import { useCardStore } from '../../src/stores/cardStore';
import { useAssetStore } from '../../src/stores/assetStore';
import { useAuthStore } from '../../src/stores/authStore';
import { isFiatAsset } from '../../src/types/asset';
import { getLocale } from '../../src/utils/formatters';

type TransferType = 'account' | 'card';

export default function EditRecurringTransferScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const { theme, isDark } = useTheme();
  const { recurringTransfers, updateRecurringTransfer } = useRecurringTransferStore();
  const { cards } = useCardStore();
  const { assets } = useAssetStore();
  const { getEncryptionKey } = useAuthStore();

  const item = recurringTransfers.find(r => r.id === id);

  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [frequency, setFrequency] = useState<'monthly' | 'yearly'>('monthly');
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [monthOfYear, setMonthOfYear] = useState(1);
  const [transferType, setTransferType] = useState<TransferType>('account');
  const [fromAssetId, setFromAssetId] = useState<string | null>(null);
  const [toAssetId, setToAssetId] = useState<string | null>(null);
  const [toCardId, setToCardId] = useState<string | null>(null);
  const [startDate, setStartDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showDayPicker, setShowDayPicker] = useState(false);
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker] = useState(false);
  const [memo, setMemo] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const fiatAssets = assets.filter(isFiatAsset);
  const prepaidCards = cards.filter(c => c.type === 'prepaid');
  const amountNumber = parseInt(amount.replace(/[^0-9]/g, '')) || 0;

  useEffect(() => {
    if (item) {
      setName(item.name);
      setAmount(item.amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','));
      setFrequency(item.frequency);
      setDayOfMonth(item.dayOfMonth);
      setMonthOfYear(item.monthOfYear ?? 1);
      setFromAssetId(item.fromAssetId);
      setStartDate(new Date(item.startDate));
      setMemo(item.memo ?? '');

      if (item.toCardId) {
        setTransferType('card');
        setToCardId(item.toCardId);
      } else {
        setTransferType('account');
        setToAssetId(item.toAssetId ?? null);
      }
    }
  }, [item?.id]);

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
    if (!id || !item) return;
    if (!name.trim()) {
      Alert.alert(t('common.error'), t('recurring.nameRequired'));
      return;
    }
    if (!amountNumber || amountNumber <= 0) {
      Alert.alert(t('common.error'), t('expense.amountRequired'));
      return;
    }
    if (!fromAssetId) {
      Alert.alert(t('common.error'), t('recurringTransfer.selectFromAccount'));
      return;
    }
    if (transferType === 'account' && !toAssetId) {
      Alert.alert(t('common.error'), t('recurringTransfer.selectToTarget'));
      return;
    }
    if (transferType === 'card' && !toCardId) {
      Alert.alert(t('common.error'), t('recurringTransfer.selectToTarget'));
      return;
    }
    if (transferType === 'account' && fromAssetId === toAssetId) {
      Alert.alert(t('common.error'), t('recurringTransfer.sameAccountError'));
      return;
    }

    const encryptionKey = getEncryptionKey();
    if (!encryptionKey) return;

    setIsLoading(true);
    try {
      await updateRecurringTransfer(id, {
        name: name.trim(),
        amount: amountNumber,
        frequency,
        dayOfMonth,
        ...(frequency === 'yearly' ? { monthOfYear } : { monthOfYear: undefined }),
        fromAssetId,
        toAssetId: transferType === 'account' ? toAssetId ?? undefined : undefined,
        toCardId: transferType === 'card' ? toCardId ?? undefined : undefined,
        startDate: formatDateString(startDate),
        memo: memo || undefined,
      }, encryptionKey);
      Alert.alert('', t('recurringTransfer.editDone'), [
        { text: t('common.confirm'), onPress: () => router.back() },
      ]);
    } catch (error) {
      Alert.alert(t('common.error'), `${error}`);
    } finally {
      setIsLoading(false);
    }
  };

  if (!item) {
    return (
      <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={{ flex: 1, backgroundColor: theme.background, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: theme.textSecondary }}>{t('common.notFound')}</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={{ flex: 1, backgroundColor: theme.background }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: theme.border }}>
          <Text style={{ fontSize: 18, fontWeight: 'bold', color: theme.text }}>{t('recurringTransfer.editTitle')}</Text>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="close" size={24} color={theme.textSecondary} />
          </TouchableOpacity>
        </View>

        <ScrollView style={{ flex: 1, padding: 20 }} contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          {/* Name */}
          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 14, color: theme.textSecondary, marginBottom: 8 }}>{t('recurringTransfer.name')}</Text>
            <TextInput
              style={{ borderWidth: 1, borderColor: theme.inputBorder, borderRadius: 8, padding: 12, fontSize: 16, color: theme.inputText }}
              placeholder={t('recurringTransfer.namePlaceholder')}
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

          {/* Transfer type */}
          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 14, color: theme.textSecondary, marginBottom: 8 }}>{t('recurringTransfer.transferType')}</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {([
                { id: 'account' as const, label: t('recurringTransfer.accountToAccount') },
                { id: 'card' as const, label: t('recurringTransfer.accountToCard') },
              ]).map(tt => (
                <TouchableOpacity
                  key={tt.id}
                  style={{ flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center', backgroundColor: transferType === tt.id ? theme.primary : theme.backgroundTertiary }}
                  onPress={() => { setTransferType(tt.id); setToAssetId(null); setToCardId(null); }}
                >
                  <Text style={{ fontSize: 14, color: transferType === tt.id ? '#FFFFFF' : theme.textSecondary }}>{tt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* From account */}
          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 14, color: theme.textSecondary, marginBottom: 8 }}>{t('recurringTransfer.fromAccount')}</Text>
            <TouchableOpacity
              style={{ borderWidth: 1, borderColor: theme.inputBorder, borderRadius: 8, padding: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
              onPress={() => setShowFromPicker(true)}
            >
              <Text style={{ fontSize: 16, color: fromAssetId ? theme.text : theme.textMuted }}>
                {fromAssetId ? fiatAssets.find(a => a.id === fromAssetId)?.name ?? '' : t('recurringTransfer.selectFromAccount')}
              </Text>
              <Ionicons name="chevron-forward" size={20} color={theme.textMuted} />
            </TouchableOpacity>
          </View>

          {/* To account or card */}
          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 14, color: theme.textSecondary, marginBottom: 8 }}>
              {transferType === 'account' ? t('recurringTransfer.toAccount') : t('recurringTransfer.toCard')}
            </Text>
            <TouchableOpacity
              style={{ borderWidth: 1, borderColor: theme.inputBorder, borderRadius: 8, padding: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
              onPress={() => setShowToPicker(true)}
            >
              <Text style={{ fontSize: 16, color: (toAssetId || toCardId) ? theme.text : theme.textMuted }}>
                {transferType === 'account'
                  ? (toAssetId ? fiatAssets.find(a => a.id === toAssetId)?.name ?? '' : t('recurringTransfer.selectToTarget'))
                  : (toCardId ? cards.find(c => c.id === toCardId)?.name ?? '' : t('recurringTransfer.selectToTarget'))
                }
              </Text>
              <Ionicons name="chevron-forward" size={20} color={theme.textMuted} />
            </TouchableOpacity>
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

          {/* Start date */}
          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 14, color: theme.textSecondary, marginBottom: 8 }}>{t('recurring.startDate')}</Text>
            <TouchableOpacity
              style={{ borderWidth: 1, borderColor: theme.inputBorder, borderRadius: 8, padding: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
              onPress={() => setShowDatePicker(true)}
            >
              <Text style={{ fontSize: 16, color: theme.text }}>
                {startDate.toLocaleDateString(getLocale(), { year: 'numeric', month: 'long', day: 'numeric' })}
              </Text>
              <Ionicons name="calendar-outline" size={20} color={theme.textSecondary} />
            </TouchableOpacity>
            {showDatePicker && (
              <DateTimePicker
                value={startDate}
                mode="date"
                display={Platform.OS === 'ios' ? 'inline' : 'default'}
                onChange={(_, date) => { setShowDatePicker(Platform.OS === 'ios'); if (date) setStartDate(date); }}
                locale={getLocale()}
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

      {/* From account picker */}
      <Modal visible={showFromPicker} transparent animationType="slide">
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: theme.modalOverlay }}>
          <View style={{ backgroundColor: theme.modalBackground, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '60%' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: theme.text }}>{t('recurringTransfer.fromAccount')}</Text>
              <TouchableOpacity onPress={() => setShowFromPicker(false)}>
                <Ionicons name="close" size={24} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 300 }}>
              {fiatAssets.map(asset => (
                <TouchableOpacity
                  key={asset.id}
                  style={{ flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: fromAssetId === asset.id ? theme.warningBanner : theme.backgroundSecondary, borderRadius: 8, marginBottom: 8 }}
                  onPress={() => { setFromAssetId(asset.id); setShowFromPicker(false); }}
                >
                  <Text style={{ fontSize: 18, marginRight: 12 }}>🏦</Text>
                  <Text style={{ flex: 1, fontSize: 16, color: theme.text }}>{asset.name}</Text>
                  {fromAssetId === asset.id && <Ionicons name="checkmark-circle" size={24} color={theme.primary} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* To account/card picker */}
      <Modal visible={showToPicker} transparent animationType="slide">
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: theme.modalOverlay }}>
          <View style={{ backgroundColor: theme.modalBackground, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '60%' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: theme.text }}>
                {transferType === 'account' ? t('recurringTransfer.toAccount') : t('recurringTransfer.toCard')}
              </Text>
              <TouchableOpacity onPress={() => setShowToPicker(false)}>
                <Ionicons name="close" size={24} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 300 }}>
              {transferType === 'account'
                ? fiatAssets
                    .filter(a => a.id !== fromAssetId)
                    .map(asset => (
                      <TouchableOpacity
                        key={asset.id}
                        style={{ flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: toAssetId === asset.id ? theme.warningBanner : theme.backgroundSecondary, borderRadius: 8, marginBottom: 8 }}
                        onPress={() => { setToAssetId(asset.id); setShowToPicker(false); }}
                      >
                        <Text style={{ fontSize: 18, marginRight: 12 }}>🏦</Text>
                        <Text style={{ flex: 1, fontSize: 16, color: theme.text }}>{asset.name}</Text>
                        {toAssetId === asset.id && <Ionicons name="checkmark-circle" size={24} color={theme.primary} />}
                      </TouchableOpacity>
                    ))
                : prepaidCards.map(card => (
                    <TouchableOpacity
                      key={card.id}
                      style={{ flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: toCardId === card.id ? theme.warningBanner : theme.backgroundSecondary, borderRadius: 8, marginBottom: 8 }}
                      onPress={() => { setToCardId(card.id); setShowToPicker(false); }}
                    >
                      <View style={{ width: 24, height: 16, borderRadius: 2, backgroundColor: card.color, marginRight: 12 }} />
                      <Text style={{ flex: 1, fontSize: 16, color: theme.text }}>{card.name}</Text>
                      {toCardId === card.id && <Ionicons name="checkmark-circle" size={24} color={theme.primary} />}
                    </TouchableOpacity>
                  ))
              }
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
