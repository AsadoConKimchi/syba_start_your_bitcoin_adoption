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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../src/hooks/useTheme';
import { useLedgerStore } from '../../src/stores/ledgerStore';
import { useAssetStore } from '../../src/stores/assetStore';
import { useCardStore } from '../../src/stores/cardStore';
import { isFiatAsset } from '../../src/types/asset';
import { formatKrw } from '../../src/utils/formatters';

type TabMode = 'transfer' | 'topup';

export default function AddTransferScreen() {
  const { t } = useTranslation();
  const { theme, isDark } = useTheme();

  const [tab, setTab] = useState<TabMode>('transfer');
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [fromAssetId, setFromAssetId] = useState<string | null>(null);
  const [toAssetId, setToAssetId] = useState<string | null>(null);
  const [toCardId, setToCardId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const { addTransfer } = useLedgerStore();
  const { assets } = useAssetStore();
  const { cards } = useCardStore();

  const fiatAssets = assets.filter(isFiatAsset);
  const prepaidCards = cards.filter(c => c.type === 'prepaid');

  const amountNumber = parseInt(amount.replace(/[^0-9]/g, '')) || 0;

  const formatDateString = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const handleAmountChange = (text: string) => {
    const numbers = text.replace(/[^0-9]/g, '');
    if (numbers) {
      setAmount(parseInt(numbers).toLocaleString());
    } else {
      setAmount('');
    }
  };

  const handleDateChange = (_: unknown, date?: Date) => {
    if (Platform.OS === 'android') setShowDatePicker(false);
    if (date) setSelectedDate(date);
  };

  const handleSubmit = async () => {
    if (!amountNumber) {
      Alert.alert(t('common.error'), t('transfer.enterAmount'));
      return;
    }
    if (!fromAssetId) {
      Alert.alert(t('common.error'), t('transfer.selectFromAccount'));
      return;
    }

    if (tab === 'transfer') {
      if (!toAssetId) {
        Alert.alert(t('common.error'), t('transfer.selectToAccount'));
        return;
      }
      if (fromAssetId === toAssetId) {
        Alert.alert(t('common.error'), t('transfer.sameAccountError'));
        return;
      }
    } else {
      if (!toCardId) {
        Alert.alert(t('common.error'), t('transfer.selectCard'));
        return;
      }
    }

    setIsLoading(true);
    try {
      await addTransfer({
        date: formatDateString(selectedDate),
        amount: amountNumber,
        currency: 'KRW',
        fromAssetId,
        toAssetId: tab === 'transfer' ? toAssetId : null,
        toCardId: tab === 'topup' ? toCardId : null,
        memo: memo.trim() || null,
      });

      Alert.alert(
        t('transfer.success'),
        tab === 'transfer' ? t('transfer.transferDone') : t('transfer.topUpDone'),
        [{ text: t('common.confirm'), onPress: () => router.back() }]
      );
    } catch (error) {
      if (__DEV__) { console.log('[DEBUG] addTransfer 실패:', error); }
      Alert.alert(t('common.error'), t('transfer.failed'));
    } finally {
      setIsLoading(false);
    }
  };

  const selectedFromAsset = fiatAssets.find(a => a.id === fromAssetId);
  const selectedToAsset = fiatAssets.find(a => a.id === toAssetId);
  const selectedCard = prepaidCards.find(c => c.id === toCardId);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
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
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="close" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={{ fontSize: 18, fontWeight: 'bold', color: theme.text }}>
          {t('transfer.title')}
        </Text>
        <View style={{ width: 24 }} />
      </View>

      {/* 탭 */}
      <View
        style={{
          flexDirection: 'row',
          margin: 20,
          marginBottom: 0,
          backgroundColor: theme.backgroundSecondary,
          borderRadius: 12,
          padding: 4,
        }}
      >
        <TouchableOpacity
          style={{
            flex: 1,
            paddingVertical: 10,
            borderRadius: 10,
            alignItems: 'center',
            backgroundColor: tab === 'transfer' ? theme.success : 'transparent',
          }}
          onPress={() => { setTab('transfer'); setToCardId(null); }}
        >
          <Text style={{
            fontSize: 14,
            fontWeight: '600',
            color: tab === 'transfer' ? '#FFFFFF' : theme.textSecondary,
          }}>
            {t('transfer.tabTransfer')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={{
            flex: 1,
            paddingVertical: 10,
            borderRadius: 10,
            alignItems: 'center',
            backgroundColor: tab === 'topup' ? theme.primary : 'transparent',
          }}
          onPress={() => { setTab('topup'); setToAssetId(null); }}
        >
          <Text style={{
            fontSize: 14,
            fontWeight: '600',
            color: tab === 'topup' ? '#FFFFFF' : theme.textSecondary,
          }}>
            {t('transfer.tabTopUp')}
          </Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView style={{ flex: 1, padding: 20 }}>
          {/* 날짜 */}
          <View style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: theme.textSecondary, marginBottom: 8 }}>
              {t('transfer.date')}
            </Text>
            <TouchableOpacity
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderWidth: 1,
                borderColor: theme.inputBorder,
                borderRadius: 8,
                padding: 12,
              }}
              onPress={() => setShowDatePicker(true)}
            >
              <Text style={{ fontSize: 16, color: theme.text }}>
                {selectedDate.toLocaleDateString('ko-KR', {
                  year: 'numeric', month: 'long', day: 'numeric', weekday: 'short',
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

          {/* 출금 계좌 */}
          <View style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: theme.textSecondary, marginBottom: 8 }}>
              {t('transfer.fromAccount')}
            </Text>
            {fiatAssets.length === 0 ? (
              <Text style={{ color: theme.textMuted, padding: 12 }}>{t('transfer.noAccounts')}</Text>
            ) : (
              fiatAssets.map(asset => (
                <TouchableOpacity
                  key={asset.id}
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: 12,
                    borderRadius: 8,
                    marginBottom: 4,
                    backgroundColor: fromAssetId === asset.id ? theme.incomeButtonBg : theme.backgroundSecondary,
                    borderWidth: fromAssetId === asset.id ? 1 : 0,
                    borderColor: theme.success,
                  }}
                  onPress={() => setFromAssetId(asset.id)}
                >
                  <Text style={{ fontSize: 15, color: theme.text, fontWeight: fromAssetId === asset.id ? '600' : '400' }}>
                    {asset.name}
                  </Text>
                  <Text style={{ fontSize: 13, color: theme.textSecondary }}>
                    {formatKrw(asset.balance)}
                  </Text>
                </TouchableOpacity>
              ))
            )}
          </View>

          {/* 입금 대상 */}
          {tab === 'transfer' ? (
            <View style={{ marginBottom: 20 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: theme.textSecondary, marginBottom: 8 }}>
                {t('transfer.toAccount')}
              </Text>
              {fiatAssets.length === 0 ? (
                <Text style={{ color: theme.textMuted, padding: 12 }}>{t('transfer.noAccounts')}</Text>
              ) : (
                fiatAssets.filter(a => a.id !== fromAssetId).map(asset => (
                  <TouchableOpacity
                    key={asset.id}
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: 12,
                      borderRadius: 8,
                      marginBottom: 4,
                      backgroundColor: toAssetId === asset.id ? theme.incomeButtonBg : theme.backgroundSecondary,
                      borderWidth: toAssetId === asset.id ? 1 : 0,
                      borderColor: theme.success,
                    }}
                    onPress={() => setToAssetId(asset.id)}
                  >
                    <Text style={{ fontSize: 15, color: theme.text, fontWeight: toAssetId === asset.id ? '600' : '400' }}>
                      {asset.name}
                    </Text>
                    <Text style={{ fontSize: 13, color: theme.textSecondary }}>
                      {formatKrw(asset.balance)}
                    </Text>
                  </TouchableOpacity>
                ))
              )}
            </View>
          ) : (
            <View style={{ marginBottom: 20 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: theme.textSecondary, marginBottom: 8 }}>
                {t('transfer.toPrepaidCard')}
              </Text>
              {prepaidCards.length === 0 ? (
                <Text style={{ color: theme.textMuted, padding: 12 }}>{t('transfer.noPrepaidCards')}</Text>
              ) : (
                prepaidCards.map(card => (
                  <TouchableOpacity
                    key={card.id}
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: 12,
                      borderRadius: 8,
                      marginBottom: 4,
                      backgroundColor: toCardId === card.id ? theme.incomeButtonBg : theme.backgroundSecondary,
                      borderWidth: toCardId === card.id ? 1 : 0,
                      borderColor: theme.primary,
                    }}
                    onPress={() => setToCardId(card.id)}
                  >
                    <Text style={{ fontSize: 15, color: theme.text, fontWeight: toCardId === card.id ? '600' : '400' }}>
                      {card.name}
                    </Text>
                    <Text style={{ fontSize: 13, color: theme.textSecondary }}>
                      {t('transfer.balance', { balance: formatKrw(card.balance ?? 0) })}
                    </Text>
                  </TouchableOpacity>
                ))
              )}
            </View>
          )}

          {/* 금액 */}
          <View style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: theme.textSecondary, marginBottom: 8 }}>
              {t('transfer.amount')}
            </Text>
            <TextInput
              style={{
                borderWidth: 1,
                borderColor: theme.inputBorder,
                borderRadius: 8,
                padding: 12,
                fontSize: 24,
                fontWeight: 'bold',
                color: theme.text,
                textAlign: 'right',
              }}
              value={amount}
              onChangeText={handleAmountChange}
              placeholder="0"
              placeholderTextColor={theme.textMuted}
              keyboardType="number-pad"
            />
          </View>

          {/* 메모 */}
          <View style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: theme.textSecondary, marginBottom: 8 }}>
              {t('transfer.memo')}
            </Text>
            <TextInput
              style={{
                borderWidth: 1,
                borderColor: theme.inputBorder,
                borderRadius: 8,
                padding: 12,
                fontSize: 16,
                color: theme.text,
              }}
              value={memo}
              onChangeText={setMemo}
              placeholder={t('transfer.memoPlaceholder')}
              placeholderTextColor={theme.textMuted}
            />
          </View>

          {/* 요약 */}
          {fromAssetId && amountNumber > 0 && (tab === 'transfer' ? toAssetId : toCardId) && (
            <View style={{
              backgroundColor: theme.backgroundSecondary,
              borderRadius: 12,
              padding: 16,
              marginBottom: 20,
            }}>
              <Text style={{ fontSize: 13, color: theme.textSecondary, marginBottom: 4 }}>
                {selectedFromAsset?.name} → {tab === 'transfer' ? selectedToAsset?.name : selectedCard?.name}
              </Text>
              <Text style={{ fontSize: 20, fontWeight: 'bold', color: tab === 'transfer' ? theme.success : theme.primary }}>
                {formatKrw(amountNumber)}
              </Text>
            </View>
          )}

          {/* 제출 버튼 */}
          <TouchableOpacity
            style={{
              backgroundColor: tab === 'transfer' ? theme.success : theme.primary,
              borderRadius: 12,
              padding: 16,
              alignItems: 'center',
              opacity: isLoading ? 0.6 : 1,
              marginBottom: 40,
            }}
            onPress={handleSubmit}
            disabled={isLoading}
          >
            <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#FFFFFF' }}>
              {isLoading
                ? t('common.saving')
                : tab === 'transfer'
                  ? t('transfer.transferButton')
                  : t('transfer.topUpButton')
              }
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
