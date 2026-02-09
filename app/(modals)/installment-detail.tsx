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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useTranslation } from 'react-i18next';
import { useDebtStore } from '../../src/stores/debtStore';
import { useCardStore } from '../../src/stores/cardStore';
import { useAuthStore } from '../../src/stores/authStore';
import { formatKrw } from '../../src/utils/formatters';
import { calculateInstallmentPayment, calculatePaidMonths } from '../../src/utils/debtCalculator';

const INSTALLMENT_MONTHS = [2, 3, 6, 12, 18, 24, 36];

export default function InstallmentDetailScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { encryptionKey } = useAuthStore();
  const { installments, updateInstallment, deleteInstallment } = useDebtStore();
  const { cards, getCardById } = useCardStore();

  const installment = installments.find((i) => i.id === id);

  const [isEditing, setIsEditing] = useState(false);
  const [storeName, setStoreName] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [months, setMonths] = useState(3);
  const [customMonths, setCustomMonths] = useState('');
  const [isInterestFree, setIsInterestFree] = useState(true);
  const [interestRate, setInterestRate] = useState('');
  const [startDate, setStartDate] = useState(new Date());
  const [paidMonths, setPaidMonths] = useState('0');
  const [memo, setMemo] = useState('');

  const [showCardPicker, setShowCardPicker] = useState(false);
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 초기값 설정
  useEffect(() => {
    if (installment) {
      setStoreName(installment.storeName);
      setTotalAmount(installment.totalAmount.toLocaleString());
      setSelectedCardId(installment.cardId);
      setMonths(installment.months);
      setIsInterestFree(installment.isInterestFree);
      setInterestRate(installment.interestRate.toString());
      setStartDate(new Date(installment.startDate));
      setPaidMonths(installment.paidMonths.toString());
      setMemo(installment.memo || '');
    }
  }, [installment]);

  if (!installment) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: '#9CA3AF' }}>{t('common.notFound')}</Text>
        <TouchableOpacity
          style={{ marginTop: 16, padding: 12, backgroundColor: '#F7931A', borderRadius: 8 }}
          onPress={() => router.back()}
        >
          <Text style={{ color: '#FFFFFF' }}>{t('common.back')}</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const card = getCardById(installment.cardId);
  const actualMonths = customMonths ? parseInt(customMonths) || months : months;
  const amount = parseInt(totalAmount.replace(/[^0-9]/g, '')) || 0;
  const rate = parseFloat(interestRate) || 0;

  const { monthlyPayment, totalInterest } = calculateInstallmentPayment(
    amount,
    actualMonths,
    isInterestFree,
    rate
  );

  const progress = installment.paidMonths / installment.months;
  const remainingMonths = installment.months - installment.paidMonths;

  const handleSave = async () => {
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
      await updateInstallment(
        installment.id,
        {
          cardId: selectedCardId,
          storeName: storeName.trim(),
          totalAmount: amount,
          months: actualMonths,
          isInterestFree,
          interestRate: isInterestFree ? 0 : rate,
          startDate: startDate.toISOString().split('T')[0],
          paidMonths: parseInt(paidMonths) || 0,
          memo: memo.trim() || null,
        },
        encryptionKey
      );

      setIsEditing(false);
      Alert.alert(t('common.done'), t('installment.editDone'));
    } catch (error) {
      console.error('할부 수정 실패:', error);
      Alert.alert(t('common.error'), t('installment.editFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      t('installment.deleteConfirm'),
      t('installment.deleteMessage', { name: installment.storeName }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            if (!encryptionKey) return;
            try {
              await deleteInstallment(installment.id, encryptionKey);
              router.back();
            } catch (error) {
              console.error('할부 삭제 실패:', error);
              Alert.alert(t('common.error'), t('installment.deleteFailed'));
            }
          },
        },
      ]
    );
  };

  const selectedCard = cards.find((c) => c.id === selectedCardId);

  // 보기 모드
  if (!isEditing) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
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
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#666666" />
          </TouchableOpacity>
          <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#1A1A1A' }}>{t('installment.detailTitle')}</Text>
          <TouchableOpacity onPress={() => setIsEditing(true)}>
            <Text style={{ fontSize: 16, fontWeight: '600', color: '#F7931A' }}>{t('common.edit')}</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={{ flex: 1, padding: 20 }}>
          {/* 기본 정보 */}
          <View
            style={{
              backgroundColor: '#F9FAFB',
              borderRadius: 12,
              padding: 20,
              marginBottom: 16,
            }}
          >
            <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#1A1A1A', marginBottom: 4 }}>
              {installment.storeName}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              {card && (
                <View
                  style={{
                    width: 16,
                    height: 10,
                    backgroundColor: card.color,
                    borderRadius: 2,
                    marginRight: 8,
                  }}
                />
              )}
              <Text style={{ fontSize: 14, color: '#9CA3AF' }}>
                {card?.name || t('debts.deletedCard')}
              </Text>
            </View>
          </View>

          {/* 금액 정보 */}
          <View
            style={{
              backgroundColor: '#FEF2F2',
              borderRadius: 12,
              padding: 20,
              marginBottom: 16,
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
              <Text style={{ fontSize: 14, color: '#991B1B' }}>{t('installment.totalAmount')}</Text>
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#EF4444' }}>
                {formatKrw(installment.totalAmount)}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
              <Text style={{ fontSize: 14, color: '#991B1B' }}>{t('installment.monthlyPayment')}</Text>
              <Text style={{ fontSize: 16, fontWeight: '600', color: '#EF4444' }}>
                {formatKrw(installment.monthlyPayment)}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 14, color: '#991B1B' }}>{t('installment.remainingAmount')}</Text>
              <Text style={{ fontSize: 16, fontWeight: '600', color: '#EF4444' }}>
                {formatKrw(installment.remainingAmount)}
              </Text>
            </View>
          </View>

          {/* 진행 상태 */}
          <View
            style={{
              backgroundColor: '#F9FAFB',
              borderRadius: 12,
              padding: 20,
              marginBottom: 16,
            }}
          >
            <Text style={{ fontSize: 14, fontWeight: '600', color: '#1A1A1A', marginBottom: 12 }}>
              {t('installment.progressStatus')}
            </Text>
            <View
              style={{
                height: 12,
                backgroundColor: '#E5E7EB',
                borderRadius: 6,
                overflow: 'hidden',
                marginBottom: 8,
              }}
            >
              <View
                style={{
                  height: '100%',
                  width: `${progress * 100}%`,
                  backgroundColor: '#F7931A',
                  borderRadius: 6,
                }}
              />
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 14, color: '#666666' }}>
                {t('debts.paidMonths', { paid: installment.paidMonths, total: installment.months })}
              </Text>
              <Text style={{ fontSize: 14, fontWeight: '600', color: '#F7931A' }}>
                {t('debts.remainingMonths', { count: remainingMonths })}
              </Text>
            </View>
          </View>

          {/* 상세 정보 */}
          <View
            style={{
              backgroundColor: '#F9FAFB',
              borderRadius: 12,
              padding: 20,
              marginBottom: 16,
            }}
          >
            <Text style={{ fontSize: 14, fontWeight: '600', color: '#1A1A1A', marginBottom: 12 }}>
              {t('installment.detailInfo')}
            </Text>
            <View style={{ marginBottom: 12 }}>
              <Text style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 4 }}>{t('installment.conditions')}</Text>
              <Text style={{ fontSize: 14, color: '#1A1A1A' }}>
                {t('installment.monthsFormat', { count: installment.months })} • {installment.isInterestFree ? t('common.interestFree') : t('installment.annualRateValue', { rate: installment.interestRate })}
              </Text>
            </View>
            <View style={{ marginBottom: 12 }}>
              <Text style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 4 }}>{t('installment.startEndDate')}</Text>
              <Text style={{ fontSize: 14, color: '#1A1A1A' }}>
                {new Date(installment.startDate).toLocaleDateString('ko-KR')} ~ {new Date(installment.endDate).toLocaleDateString('ko-KR')}
              </Text>
            </View>
            {!installment.isInterestFree && installment.totalInterest > 0 && (
              <View style={{ marginBottom: 12 }}>
                <Text style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 4 }}>{t('installment.totalInterest')}</Text>
                <Text style={{ fontSize: 14, color: '#EF4444' }}>
                  {formatKrw(installment.totalInterest)}
                </Text>
              </View>
            )}
            {installment.memo && (
              <View>
                <Text style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 4 }}>{t('common.memo')}</Text>
                <Text style={{ fontSize: 14, color: '#1A1A1A' }}>{installment.memo}</Text>
              </View>
            )}
          </View>

          {/* 삭제 버튼 */}
          <TouchableOpacity
            style={{
              backgroundColor: '#FEE2E2',
              borderRadius: 12,
              padding: 16,
              alignItems: 'center',
              marginBottom: 40,
            }}
            onPress={handleDelete}
          >
            <Text style={{ fontSize: 16, fontWeight: '600', color: '#DC2626' }}>{t('installment.deleteConfirm')}</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // 수정 모드
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
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
        <TouchableOpacity onPress={() => setIsEditing(false)}>
          <Text style={{ fontSize: 16, color: '#666666' }}>{t('common.cancel')}</Text>
        </TouchableOpacity>
        <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#1A1A1A' }}>{t('installment.editTitle')}</Text>
        <TouchableOpacity onPress={handleSave} disabled={isSubmitting}>
          <Text
            style={{
              fontSize: 16,
              fontWeight: '600',
              color: isSubmitting ? '#9CA3AF' : '#F7931A',
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
            <Text style={{ fontSize: 14, color: '#666666', marginBottom: 8 }}>{t('installment.storeName')} *</Text>
            <TextInput
              style={{
                backgroundColor: '#F9FAFB',
                borderRadius: 8,
                padding: 16,
                fontSize: 16,
                color: '#1A1A1A',
              }}
              value={storeName}
              onChangeText={setStoreName}
            />
          </View>

          {/* 결제 금액 */}
          <View style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 14, color: '#666666', marginBottom: 8 }}>{t('installment.totalAmount')} *</Text>
            <TextInput
              style={{
                backgroundColor: '#F9FAFB',
                borderRadius: 8,
                padding: 16,
                fontSize: 24,
                fontWeight: 'bold',
                color: '#EF4444',
                textAlign: 'right',
              }}
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
          </View>

          {/* 카드 선택 */}
          <View style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 14, color: '#666666', marginBottom: 8 }}>{t('installment.selectCard')} *</Text>
            <TouchableOpacity
              style={{
                backgroundColor: '#F9FAFB',
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
                <Text style={{ fontSize: 16, color: '#1A1A1A' }}>
                  {selectedCard?.name || t('installment.selectCard')}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
            </TouchableOpacity>
          </View>

          {/* 할부 개월 */}
          <View style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 14, color: '#666666', marginBottom: 8 }}>{t('installment.months')} *</Text>
            <TouchableOpacity
              style={{
                backgroundColor: '#F9FAFB',
                borderRadius: 8,
                padding: 16,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
              onPress={() => setShowMonthPicker(true)}
            >
              <Text style={{ fontSize: 16, color: '#1A1A1A' }}>
                {t('installment.monthsFormat', { count: Number(customMonths) || months })}
              </Text>
              <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
            </TouchableOpacity>
          </View>

          {/* 무이자/유이자 */}
          <View style={{ marginBottom: 20 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 14, color: '#666666' }}>{t('installment.interestFree')}</Text>
              <Switch
                value={isInterestFree}
                onValueChange={setIsInterestFree}
                trackColor={{ true: '#F7931A' }}
              />
            </View>

            {!isInterestFree && (
              <View style={{ marginTop: 12 }}>
                <Text style={{ fontSize: 12, color: '#666666', marginBottom: 8 }}>{t('installment.annualRate')}</Text>
                <TextInput
                  style={{
                    backgroundColor: '#F9FAFB',
                    borderRadius: 8,
                    padding: 16,
                    fontSize: 16,
                    color: '#1A1A1A',
                  }}
                  placeholder={t('installment.annualRatePlaceholder')}
                  keyboardType="decimal-pad"
                  value={interestRate}
                  onChangeText={setInterestRate}
                />
              </View>
            )}
          </View>

          {/* 시작일 */}
          <View style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 14, color: '#666666', marginBottom: 8 }}>{t('installment.startDate')}</Text>
            <TouchableOpacity
              style={{
                backgroundColor: '#F9FAFB',
                borderRadius: 8,
                padding: 16,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
              onPress={() => setShowDatePicker(true)}
            >
              <Text style={{ fontSize: 16, color: '#1A1A1A' }}>
                {startDate.toLocaleDateString('ko-KR')}
              </Text>
              <Ionicons name="calendar-outline" size={20} color="#9CA3AF" />
            </TouchableOpacity>
          </View>

          {/* 이미 납부한 개월 */}
          <View style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 14, color: '#666666', marginBottom: 8 }}>
              {t('installment.paidMonths')}
            </Text>
            <TextInput
              style={{
                backgroundColor: '#F9FAFB',
                borderRadius: 8,
                padding: 16,
                fontSize: 16,
                color: '#1A1A1A',
              }}
              keyboardType="number-pad"
              value={paidMonths}
              onChangeText={setPaidMonths}
            />
          </View>

          {/* 메모 */}
          <View style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 14, color: '#666666', marginBottom: 8 }}>{t('common.memo')}</Text>
            <TextInput
              style={{
                backgroundColor: '#F9FAFB',
                borderRadius: 8,
                padding: 16,
                fontSize: 16,
                color: '#1A1A1A',
                minHeight: 80,
              }}
              placeholder={t('common.memoPlaceholder')}
              multiline
              value={memo}
              onChangeText={setMemo}
            />
          </View>

          {/* 계산 결과 */}
          {amount > 0 && (
            <View
              style={{
                backgroundColor: '#FEF3C7',
                borderRadius: 12,
                padding: 16,
                marginBottom: 20,
              }}
            >
              <Text style={{ fontSize: 14, fontWeight: '600', color: '#92400E', marginBottom: 12 }}>
                {t('installment.calculationResult')}
              </Text>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                <Text style={{ color: '#92400E' }}>{t('installment.monthlyPayment')}</Text>
                <Text style={{ fontWeight: 'bold', color: '#B45309' }}>
                  {formatKrw(monthlyPayment)}
                </Text>
              </View>
              {!isInterestFree && totalInterest > 0 && (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ color: '#92400E' }}>{t('installment.totalInterest')}</Text>
                  <Text style={{ color: '#B45309' }}>{formatKrw(totalInterest)}</Text>
                </View>
              )}
            </View>
          )}
        </View>
      </ScrollView>

      {/* 카드 선택 모달 */}
      <Modal visible={showCardPicker} transparent animationType="slide">
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
              <Text style={{ fontSize: 18, fontWeight: 'bold' }}>{t('installment.selectCardTitle')}</Text>
              <TouchableOpacity onPress={() => setShowCardPicker(false)}>
                <Ionicons name="close" size={24} color="#666666" />
              </TouchableOpacity>
            </View>

            <ScrollView>
              {cards.map((c) => (
                <TouchableOpacity
                  key={c.id}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    padding: 16,
                    backgroundColor: selectedCardId === c.id ? '#FEF3C7' : '#F9FAFB',
                    borderRadius: 8,
                    marginBottom: 8,
                  }}
                  onPress={() => {
                    setSelectedCardId(c.id);
                    setShowCardPicker(false);
                  }}
                >
                  <View
                    style={{
                      width: 40,
                      height: 26,
                      backgroundColor: c.color,
                      borderRadius: 4,
                      marginRight: 12,
                    }}
                  />
                  <Text style={{ flex: 1, fontSize: 16, color: '#1A1A1A' }}>{c.name}</Text>
                  {selectedCardId === c.id && <Ionicons name="checkmark" size={20} color="#F7931A" />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* 개월 선택 모달 */}
      <Modal visible={showMonthPicker} transparent animationType="slide">
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <View
            style={{
              backgroundColor: '#FFFFFF',
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              padding: 20,
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
              <Text style={{ fontSize: 18, fontWeight: 'bold' }}>{t('installment.selectMonths')}</Text>
              <TouchableOpacity onPress={() => setShowMonthPicker(false)}>
                <Ionicons name="close" size={24} color="#666666" />
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 16 }}>
              {INSTALLMENT_MONTHS.map((m) => (
                <TouchableOpacity
                  key={m}
                  style={{
                    width: '30%',
                    padding: 12,
                    backgroundColor: months === m && !customMonths ? '#F7931A' : '#F3F4F6',
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
                      color: months === m && !customMonths ? '#FFFFFF' : '#1A1A1A',
                    }}
                  >
                    {t('installment.monthsFormat', { count: m })}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={{ fontSize: 14, color: '#666666', marginBottom: 8 }}>{t('installment.customInput')}</Text>
            <TextInput
              style={{
                backgroundColor: '#F9FAFB',
                borderRadius: 8,
                padding: 16,
                fontSize: 16,
                color: '#1A1A1A',
              }}
              placeholder={t('installment.customMonthsPlaceholder')}
              keyboardType="number-pad"
              value={customMonths}
              onChangeText={setCustomMonths}
            />

            <TouchableOpacity
              style={{
                backgroundColor: '#F7931A',
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

      {/* 날짜 선택 */}
      {showDatePicker && (
        <Modal visible={showDatePicker} transparent animationType="fade">
          <View style={{ flex: 1, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)' }}>
            <View
              style={{
                backgroundColor: '#FFFFFF',
                margin: 20,
                borderRadius: 16,
                padding: 20,
              }}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
                <Text style={{ fontSize: 18, fontWeight: 'bold' }}>{t('common.selectDate')}</Text>
                <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                  <Ionicons name="close" size={24} color="#666666" />
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={startDate}
                mode="date"
                display={Platform.OS === 'ios' ? 'inline' : 'default'}
                onChange={(event, date) => {
                  if (Platform.OS === 'android') {
                    setShowDatePicker(false);
                  }
                  if (date) setStartDate(date);
                }}
                locale="ko-KR"
              />
              {Platform.OS === 'ios' && (
                <TouchableOpacity
                  style={{
                    backgroundColor: '#F7931A',
                    padding: 16,
                    borderRadius: 8,
                    alignItems: 'center',
                    marginTop: 16,
                  }}
                  onPress={() => setShowDatePicker(false)}
                >
                  <Text style={{ color: '#FFFFFF', fontWeight: '600' }}>{t('common.confirm')}</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
}
