import { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Modal,
  Switch,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../src/hooks/useTheme';
import { useDebtStore } from '../../src/stores/debtStore';
import { useCardStore } from '../../src/stores/cardStore';
import { useAuthStore } from '../../src/stores/authStore';
import { formatKrw } from '../../src/utils/formatters';
import { calculateInstallmentPayment, calculatePaidMonths } from '../../src/utils/debtCalculator';

const INSTALLMENT_MONTHS = [2, 3, 6, 12, 18, 24, 36];

export default function AddInstallmentScreen() {
  const { t } = useTranslation();
  const { theme, isDark } = useTheme();
  const { getEncryptionKey } = useAuthStore();
  const encryptionKey = getEncryptionKey();
  const { addInstallment } = useDebtStore();
  const { cards } = useCardStore();

  const [storeName, setStoreName] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [selectedCardId, setSelectedCardId] = useState<string | null>(
    cards.find((c) => c.isDefault)?.id || cards[0]?.id || null
  );
  const [months, setMonths] = useState(3);
  const [customMonths, setCustomMonths] = useState('');
  const [isInterestFree, setIsInterestFree] = useState(true);
  const [interestRate, setInterestRate] = useState('');
  const [startDate, setStartDate] = useState(new Date());
  const [paidMonths, setPaidMonths] = useState('0');
  const [paidMonthsEdited, setPaidMonthsEdited] = useState(false);
  const [memo, setMemo] = useState('');

  const [showCardPicker, setShowCardPicker] = useState(false);
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 시작일 변경 시 자동으로 납부 개월 수 계산 (사용자가 수정하지 않은 경우만)
  useEffect(() => {
    if (!paidMonthsEdited) {
      const calculated = calculatePaidMonths(startDate.toISOString().split('T')[0]);
      setPaidMonths(calculated.toString());
    }
  }, [startDate, paidMonthsEdited]);

  const actualMonths = customMonths ? parseInt(customMonths) || months : months;
  const amount = parseInt(totalAmount.replace(/[^0-9]/g, '')) || 0;
  const rate = parseFloat(interestRate) || 0;

  const { monthlyPayment, totalInterest } = calculateInstallmentPayment(
    amount,
    actualMonths,
    isInterestFree,
    rate
  );

  const handleSubmit = async () => {
    if (!encryptionKey) {
      Alert.alert(t('common.error'), t('common.authRequired'));
      return;
    }

    if (!storeName.trim()) {
      Alert.alert(t('common.error'), t('installment.storeRequired'));
      return;
    }

    if (amount <= 0) {
      Alert.alert(t('common.error'), t('installment.amountRequired'));
      return;
    }

    if (!selectedCardId) {
      Alert.alert(t('common.error'), t('installment.cardRequired'));
      return;
    }

    setIsSubmitting(true);
    try {
      await addInstallment(
        {
          cardId: selectedCardId,
          storeName: storeName.trim(),
          totalAmount: amount,
          months: actualMonths,
          isInterestFree,
          interestRate: isInterestFree ? 0 : rate,
          startDate: startDate.toISOString().split('T')[0],
          paidMonths: parseInt(paidMonths) || 0,
          memo: memo.trim() || undefined,
        },
        encryptionKey
      );

      Alert.alert(t('common.done'), t('installment.addDone'), [
        { text: t('common.confirm'), onPress: () => router.back() },
      ]);
    } catch (error) {
      console.error('할부 추가 실패:', error);
      Alert.alert(t('common.error'), t('installment.addFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedCard = cards.find((c) => c.id === selectedCardId);

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
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="close" size={24} color={theme.textSecondary} />
        </TouchableOpacity>
        <Text style={{ fontSize: 18, fontWeight: 'bold', color: theme.text }}>
          {t('installment.addTitle')}
        </Text>
        <TouchableOpacity onPress={handleSubmit} disabled={isSubmitting}>
          <Text
            style={{
              fontSize: 16,
              fontWeight: '600',
              color: isSubmitting ? theme.textMuted : theme.primary,
            }}
          >
            {t('common.save')}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
        <View style={{ padding: 20 }}>
          {/* 상점명 */}
          <View style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 14, color: theme.textSecondary, marginBottom: 8 }}>{t('installment.storeName')} *</Text>
            <TextInput
              style={{
                backgroundColor: theme.backgroundSecondary,
                borderRadius: 8,
                padding: 16,
                fontSize: 16,
                color: theme.inputText,
              }}
              placeholder={t('installment.storeNamePlaceholder')}
              placeholderTextColor={theme.placeholder}
              value={storeName}
              onChangeText={setStoreName}
            />
          </View>

          {/* 결제 금액 */}
          <View style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 14, color: theme.textSecondary, marginBottom: 8 }}>{t('installment.totalAmount')} *</Text>
            <TextInput
              style={{
                backgroundColor: theme.backgroundSecondary,
                borderRadius: 8,
                padding: 16,
                fontSize: 24,
                fontWeight: 'bold',
                color: theme.error,
                textAlign: 'right',
              }}
              placeholder="0"
              placeholderTextColor={theme.placeholder}
              keyboardType="number-pad"
              value={totalAmount}
              onChangeText={(text) => {
                const num = text.replace(/[^0-9]/g, '');
                if (num) {
                  setTotalAmount(parseInt(num).toLocaleString());
                } else {
                  setTotalAmount('');
                }
              }}
            />
            <Text style={{ fontSize: 12, color: theme.textMuted, textAlign: 'right', marginTop: 4 }}>
              {t('common.won')}
            </Text>
          </View>

          {/* 카드 선택 */}
          <View style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 14, color: theme.textSecondary, marginBottom: 8 }}>{t('installment.selectCard')} *</Text>
            <TouchableOpacity
              style={{
                backgroundColor: theme.backgroundSecondary,
                borderRadius: 8,
                padding: 16,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
              onPress={() => setShowCardPicker(true)}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                {selectedCard && (
                  <View
                    style={{
                      width: 24,
                      height: 16,
                      backgroundColor: selectedCard.color,
                      borderRadius: 2,
                      marginRight: 12,
                    }}
                  />
                )}
                <Text style={{ fontSize: 16, color: selectedCard ? theme.text : theme.textMuted }}>
                  {selectedCard?.name || t('installment.selectCard')}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={theme.textMuted} />
            </TouchableOpacity>
          </View>

          {/* 할부 개월 */}
          <View style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 14, color: theme.textSecondary, marginBottom: 8 }}>{t('installment.months')} *</Text>
            <TouchableOpacity
              style={{
                backgroundColor: theme.backgroundSecondary,
                borderRadius: 8,
                padding: 16,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
              onPress={() => setShowMonthPicker(true)}
            >
              <Text style={{ fontSize: 16, color: theme.text }}>
                {t('installment.monthsFormat', { count: Number(customMonths) || months })}
              </Text>
              <Ionicons name="chevron-forward" size={20} color={theme.textMuted} />
            </TouchableOpacity>
          </View>

          {/* 무이자/유이자 */}
          <View style={{ marginBottom: 20 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 14, color: theme.textSecondary }}>{t('installment.interestFree')}</Text>
              <Switch
                value={isInterestFree}
                onValueChange={setIsInterestFree}
                trackColor={{ false: theme.toggleTrack, true: theme.switchTrackOn }}
              />
            </View>

            {!isInterestFree && (
              <View style={{ marginTop: 12 }}>
                <Text style={{ fontSize: 12, color: theme.textSecondary, marginBottom: 8 }}>{t('installment.annualRate')}</Text>
                <TextInput
                  style={{
                    backgroundColor: theme.backgroundSecondary,
                    borderRadius: 8,
                    padding: 16,
                    fontSize: 16,
                    color: theme.inputText,
                  }}
                  placeholder={t('installment.annualRatePlaceholder')}
                  placeholderTextColor={theme.placeholder}
                  keyboardType="decimal-pad"
                  value={interestRate}
                  onChangeText={setInterestRate}
                />
              </View>
            )}
          </View>

          {/* 시작일 */}
          <View style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 14, color: theme.textSecondary, marginBottom: 8 }}>{t('installment.startDate')}</Text>
            <TouchableOpacity
              style={{
                backgroundColor: theme.backgroundSecondary,
                borderRadius: 8,
                padding: 16,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
              onPress={() => setShowDatePicker(true)}
            >
              <Text style={{ fontSize: 16, color: theme.text }}>
                {startDate.toLocaleDateString('ko-KR')}
              </Text>
              <Ionicons name="calendar-outline" size={20} color={theme.textMuted} />
            </TouchableOpacity>
          </View>

          {/* 이미 납부한 개월 */}
          <View style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 14, color: theme.textSecondary, marginBottom: 8 }}>
              {t('installment.paidMonths')}
            </Text>
            <TextInput
              style={{
                backgroundColor: theme.backgroundSecondary,
                borderRadius: 8,
                padding: 16,
                fontSize: 16,
                color: theme.inputText,
              }}
              placeholder="0"
              placeholderTextColor={theme.placeholder}
              keyboardType="number-pad"
              value={paidMonths}
              onChangeText={(text) => {
                setPaidMonths(text);
                setPaidMonthsEdited(true);
              }}
            />
            {!paidMonthsEdited && parseInt(paidMonths) > 0 && (
              <Text style={{ fontSize: 11, color: theme.textMuted, marginTop: 4 }}>
                {t('installment.autoCalculated')}
              </Text>
            )}
          </View>

          {/* 메모 */}
          <View style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 14, color: theme.textSecondary, marginBottom: 8 }}>{t('common.memo')}</Text>
            <TextInput
              style={{
                backgroundColor: theme.backgroundSecondary,
                borderRadius: 8,
                padding: 16,
                fontSize: 16,
                color: theme.inputText,
                minHeight: 80,
              }}
              placeholder={t('common.memoPlaceholder')}
              placeholderTextColor={theme.placeholder}
              multiline
              value={memo}
              onChangeText={setMemo}
            />
          </View>

          {/* 계산 결과 */}
          {amount > 0 && (
            <View
              style={{
                backgroundColor: theme.warningBanner,
                borderRadius: 12,
                padding: 16,
                marginBottom: 20,
              }}
            >
              <Text style={{ fontSize: 14, fontWeight: '600', color: theme.warningBannerText, marginBottom: 12 }}>
                {t('installment.calculationResult')}
              </Text>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                <Text style={{ color: theme.warningBannerText }}>{t('installment.monthlyPayment')}</Text>
                <Text style={{ fontWeight: 'bold', color: theme.warningBannerText }}>
                  {formatKrw(monthlyPayment)}
                </Text>
              </View>
              {!isInterestFree && totalInterest > 0 && (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ color: theme.warningBannerText }}>{t('installment.totalInterest')}</Text>
                  <Text style={{ color: theme.warningBannerText }}>{formatKrw(totalInterest)}</Text>
                </View>
              )}
            </View>
          )}
        </View>
      </ScrollView>

      {/* 카드 선택 모달 */}
      <Modal visible={showCardPicker} transparent animationType="slide">
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
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: theme.text }}>{t('installment.selectCardTitle')}</Text>
              <TouchableOpacity onPress={() => setShowCardPicker(false)}>
                <Ionicons name="close" size={24} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView>
              {cards.map((card) => (
                <TouchableOpacity
                  key={card.id}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    padding: 16,
                    backgroundColor: selectedCardId === card.id ? theme.warningBanner : theme.backgroundSecondary,
                    borderRadius: 8,
                    marginBottom: 8,
                  }}
                  onPress={() => {
                    setSelectedCardId(card.id);
                    setShowCardPicker(false);
                  }}
                >
                  <View
                    style={{
                      width: 40,
                      height: 26,
                      backgroundColor: card.color,
                      borderRadius: 4,
                      marginRight: 12,
                    }}
                  />
                  <Text style={{ flex: 1, fontSize: 16, color: theme.text }}>{card.name}</Text>
                  {selectedCardId === card.id && (
                    <Ionicons name="checkmark" size={20} color={theme.primary} />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* 개월 선택 모달 */}
      <Modal visible={showMonthPicker} transparent animationType="slide">
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: theme.modalOverlay }}>
          <View
            style={{
              backgroundColor: theme.modalBackground,
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              padding: 20,
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: theme.text }}>{t('installment.selectMonths')}</Text>
              <TouchableOpacity onPress={() => setShowMonthPicker(false)}>
                <Ionicons name="close" size={24} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 16 }}>
              {INSTALLMENT_MONTHS.map((m) => (
                <TouchableOpacity
                  key={m}
                  style={{
                    width: '30%',
                    padding: 12,
                    backgroundColor: months === m && !customMonths ? theme.primary : theme.backgroundTertiary,
                    borderRadius: 8,
                    margin: '1.5%',
                    alignItems: 'center',
                  }}
                  onPress={() => {
                    setMonths(m);
                    setCustomMonths('');
                    setShowMonthPicker(false);
                  }}
                >
                  <Text
                    style={{
                      fontSize: 16,
                      color: months === m && !customMonths ? '#FFFFFF' : theme.text,
                    }}
                  >
                    {t('installment.monthsFormat', { count: m })}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={{ fontSize: 14, color: theme.textSecondary, marginBottom: 8 }}>{t('installment.customInput')}</Text>
            <TextInput
              style={{
                backgroundColor: theme.backgroundSecondary,
                borderRadius: 8,
                padding: 16,
                fontSize: 16,
                color: theme.inputText,
              }}
              placeholder={t('installment.customMonthsPlaceholder')}
              placeholderTextColor={theme.placeholder}
              keyboardType="number-pad"
              value={customMonths}
              onChangeText={setCustomMonths}
            />

            <TouchableOpacity
              style={{
                backgroundColor: theme.primary,
                padding: 16,
                borderRadius: 8,
                alignItems: 'center',
                marginTop: 16,
              }}
              onPress={() => setShowMonthPicker(false)}
            >
              <Text style={{ color: '#FFFFFF', fontWeight: '600' }}>{t('common.confirm')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 날짜 선택 (캘린더) */}
      {Platform.OS === 'ios' ? (
        showDatePicker && (
          <Modal visible={showDatePicker} transparent animationType="fade">
            <View style={{ flex: 1, justifyContent: 'center', backgroundColor: theme.modalOverlay }}>
              <View
                style={{
                  backgroundColor: theme.modalBackground,
                  margin: 20,
                  borderRadius: 16,
                  padding: 20,
                }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
                  <Text style={{ fontSize: 18, fontWeight: 'bold', color: theme.text }}>{t('common.selectDate')}</Text>
                  <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                    <Ionicons name="close" size={24} color={theme.textSecondary} />
                  </TouchableOpacity>
                </View>
                <DateTimePicker
                  value={startDate}
                  mode="date"
                  display="inline"
                  onChange={(event, date) => {
                    if (date) {
                      setStartDate(date);
                      setPaidMonthsEdited(false);
                    }
                  }}
                  locale="ko-KR"
                  themeVariant={isDark ? 'dark' : 'light'}
                />
                <TouchableOpacity
                  style={{
                    backgroundColor: theme.primary,
                    padding: 16,
                    borderRadius: 8,
                    alignItems: 'center',
                    marginTop: 16,
                  }}
                  onPress={() => setShowDatePicker(false)}
                >
                  <Text style={{ color: '#FFFFFF', fontWeight: '600' }}>{t('common.confirm')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
        )
      ) : (
        showDatePicker && (
          <DateTimePicker
            value={startDate}
            mode="date"
            display="default"
            onChange={(event, date) => {
              setShowDatePicker(false);
              if (date) {
                setStartDate(date);
                setPaidMonthsEdited(false);
              }
            }}
            locale="ko-KR"
            themeVariant={isDark ? 'dark' : 'light'}
          />
        )
      )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
