import { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Modal,
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
import { useAuthStore } from '../../src/stores/authStore';
import { useAssetStore } from '../../src/stores/assetStore';
import { formatKrw } from '../../src/utils/formatters';
import { isFiatAsset } from '../../src/types/asset';
import { calculateLoanPayment, calculatePaidMonths } from '../../src/utils/debtCalculator';
import {
  RepaymentType,
  REPAYMENT_TYPE_LABELS,
  REPAYMENT_TYPE_DESCRIPTIONS,
} from '../../src/types/debt';
import { getCurrentRegion } from '../../src/regions';

const LOAN_TERMS = [12, 24, 36, 48, 60, 120, 240, 360]; // 개월

export default function AddLoanScreen() {
  const { t } = useTranslation();
  const { theme, isDark } = useTheme();
  const { getEncryptionKey } = useAuthStore();
  const encryptionKey = getEncryptionKey();
  const { addLoan } = useDebtStore();
  const { assets } = useAssetStore();
  const region = getCurrentRegion();

  const [name, setName] = useState('');
  const [institution, setInstitution] = useState('');
  const [selectedBankId, setSelectedBankId] = useState<string | null>(null);
  const [principal, setPrincipal] = useState('');
  const [interestRate, setInterestRate] = useState('');
  const [repaymentType, setRepaymentType] = useState<RepaymentType>('equalPrincipalAndInterest');
  const [termMonths, setTermMonths] = useState(36);
  const [customTerm, setCustomTerm] = useState('');
  const [startDate, setStartDate] = useState(new Date());
  const [paidMonths, setPaidMonths] = useState('0');
  const [paidMonthsEdited, setPaidMonthsEdited] = useState(false);
  const [memo, setMemo] = useState('');
  const [repaymentDay, setRepaymentDay] = useState<number | null>(null);
  const [linkedAssetId, setLinkedAssetId] = useState<string | null>(null);

  const [showBankPicker, setShowBankPicker] = useState(false);
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [showTermPicker, setShowTermPicker] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showRepaymentDayPicker, setShowRepaymentDayPicker] = useState(false);
  const [showAssetPicker, setShowAssetPicker] = useState(false);
  const [interestPaymentDay, setInterestPaymentDay] = useState<number | null>(null);
  const [showInterestPaymentDayPicker, setShowInterestPaymentDayPicker] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 법정화폐 자산만 필터링 (대출 상환용)
  const fiatAssets = assets.filter(isFiatAsset);

  // 시작일 변경 시 자동으로 납부 개월 수 계산 (사용자가 수정하지 않은 경우만)
  useEffect(() => {
    if (!paidMonthsEdited) {
      const calculated = calculatePaidMonths(startDate.toISOString().split('T')[0]);
      setPaidMonths(calculated.toString());
    }
  }, [startDate, paidMonthsEdited]);

  const actualTerm = customTerm ? parseInt(customTerm) || termMonths : termMonths;
  const amount = parseInt(principal.replace(/[^0-9]/g, '')) || 0;
  const rate = parseFloat(interestRate) || 0;

  const { monthlyPayment, totalInterest } = calculateLoanPayment(
    amount,
    rate,
    actualTerm,
    repaymentType
  );

  const handleSubmit = async () => {
    if (!encryptionKey) {
      Alert.alert(t('common.error'), t('common.authRequired'));
      return;
    }

    if (!name.trim()) {
      Alert.alert(t('common.error'), t('loan.nameRequired'));
      return;
    }

    if (!institution.trim()) {
      Alert.alert(t('common.error'), t('loan.lenderRequired'));
      return;
    }

    if (amount <= 0) {
      Alert.alert(t('common.error'), t('loan.principalRequired'));
      return;
    }

    if (rate <= 0) {
      Alert.alert(t('common.error'), t('loan.rateRequired'));
      return;
    }

    setIsSubmitting(true);
    try {
      await addLoan(
        {
          name: name.trim(),
          institution: institution.trim(),
          principal: amount,
          interestRate: rate,
          repaymentType,
          termMonths: actualTerm,
          startDate: startDate.toISOString().split('T')[0],
          paidMonths: parseInt(paidMonths) || 0,
          memo: memo.trim() || undefined,
          repaymentDay: repaymentDay ?? undefined,
          linkedAssetId: linkedAssetId ?? undefined,
          interestPaymentDay: interestPaymentDay ?? undefined,
        },
        encryptionKey
      );

      Alert.alert(t('common.done'), t('loan.addDone'), [
        { text: t('common.confirm'), onPress: () => router.back() },
      ]);
    } catch (error) {
      console.error('대출 추가 실패:', error);
      Alert.alert(t('common.error'), t('loan.addFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatTermLabel = (months: number): string => {
    return t('installment.monthsFormat', { count: months });
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
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="close" size={24} color={theme.textSecondary} />
        </TouchableOpacity>
        <Text style={{ fontSize: 18, fontWeight: 'bold', color: theme.text }}>
          {t('loan.addTitle')}
        </Text>
        <TouchableOpacity onPress={handleSubmit} disabled={isSubmitting}>
          <Text
            style={{
              fontSize: 16,
              fontWeight: '600',
              color: isSubmitting ? theme.textMuted : '#3B82F6',
            }}
          >
            {t('common.save')}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
        <View style={{ padding: 20 }}>
          {/* 대출명 */}
          <View style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 14, color: theme.textSecondary, marginBottom: 8 }}>{t('loan.loanName')} *</Text>
            <TextInput
              style={{
                backgroundColor: theme.backgroundSecondary,
                borderRadius: 8,
                padding: 16,
                fontSize: 16,
                color: theme.inputText,
              }}
              placeholder={t('loan.loanNamePlaceholder')}
              placeholderTextColor={theme.placeholder}
              value={name}
              onChangeText={setName}
            />
          </View>

          {/* 대출 기관 */}
          <View style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 14, color: theme.textSecondary, marginBottom: 8 }}>{t('loan.lender')} *</Text>
            <TouchableOpacity
              style={{
                backgroundColor: theme.backgroundSecondary,
                borderRadius: 8,
                padding: 16,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
              onPress={() => setShowBankPicker(true)}
            >
              <Text style={{ fontSize: 16, color: institution ? theme.text : theme.textMuted }}>
                {institution || t('loan.selectLender')}
              </Text>
              <Ionicons name="chevron-forward" size={20} color={theme.textMuted} />
            </TouchableOpacity>
          </View>

          {/* 대출 원금 */}
          <View style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 14, color: theme.textSecondary, marginBottom: 8 }}>{t('loan.principal')} *</Text>
            <TextInput
              style={{
                backgroundColor: theme.backgroundSecondary,
                borderRadius: 8,
                padding: 16,
                fontSize: 24,
                fontWeight: 'bold',
                color: '#3B82F6',
                textAlign: 'right',
              }}
              placeholder="0"
              placeholderTextColor={theme.placeholder}
              keyboardType="number-pad"
              value={principal}
              onChangeText={(text) => {
                const num = text.replace(/[^0-9]/g, '');
                if (num) {
                  setPrincipal(parseInt(num).toLocaleString());
                } else {
                  setPrincipal('');
                }
              }}
            />
            <Text style={{ fontSize: 12, color: theme.textMuted, textAlign: 'right', marginTop: 4 }}>
              {t('common.won')}
            </Text>
          </View>

          {/* 연 이자율 */}
          <View style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 14, color: theme.textSecondary, marginBottom: 8 }}>{t('loan.annualRate')}</Text>
            <TextInput
              style={{
                backgroundColor: theme.backgroundSecondary,
                borderRadius: 8,
                padding: 16,
                fontSize: 16,
                color: theme.inputText,
              }}
              placeholder={t('loan.annualRatePlaceholder')}
              placeholderTextColor={theme.placeholder}
              keyboardType="decimal-pad"
              value={interestRate}
              onChangeText={setInterestRate}
            />
          </View>

          {/* 상환 방식 */}
          <View style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 14, color: theme.textSecondary, marginBottom: 8 }}>{t('loan.repaymentType')} *</Text>
            <TouchableOpacity
              style={{
                backgroundColor: theme.backgroundSecondary,
                borderRadius: 8,
                padding: 16,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
              onPress={() => setShowTypePicker(true)}
            >
              <View>
                <Text style={{ fontSize: 16, color: theme.text }}>
                  {REPAYMENT_TYPE_LABELS[repaymentType]}
                </Text>
                <Text style={{ fontSize: 12, color: theme.textMuted, marginTop: 2 }}>
                  {REPAYMENT_TYPE_DESCRIPTIONS[repaymentType]}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={theme.textMuted} />
            </TouchableOpacity>
          </View>

          {/* 대출 기간 */}
          <View style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 14, color: theme.textSecondary, marginBottom: 8 }}>{t('loan.loanTerm')} *</Text>
            <TouchableOpacity
              style={{
                backgroundColor: theme.backgroundSecondary,
                borderRadius: 8,
                padding: 16,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
              onPress={() => setShowTermPicker(true)}
            >
              <Text style={{ fontSize: 16, color: theme.text }}>
                {formatTermLabel(customTerm ? parseInt(customTerm) || termMonths : termMonths)}
              </Text>
              <Ionicons name="chevron-forward" size={20} color={theme.textMuted} />
            </TouchableOpacity>
          </View>

          {/* 시작일 */}
          <View style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 14, color: theme.textSecondary, marginBottom: 8 }}>{t('loan.startDate')}</Text>
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

          {/* 이미 상환한 개월 */}
          <View style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 14, color: theme.textSecondary, marginBottom: 8 }}>
              {t('loan.paidMonths')}
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
                {t('loan.autoCalculated')}
              </Text>
            )}
          </View>

          {/* 상환일 */}
          <View style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 14, color: theme.textSecondary, marginBottom: 8 }}>
              {t('loan.repaymentDay')}
            </Text>
            <TouchableOpacity
              style={{
                backgroundColor: theme.backgroundSecondary,
                borderRadius: 8,
                padding: 16,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
              onPress={() => setShowRepaymentDayPicker(true)}
            >
              <Text style={{ fontSize: 16, color: repaymentDay ? theme.text : theme.textMuted }}>
                {repaymentDay ? t('loan.repaymentDayFormat', { day: repaymentDay }) : t('loan.repaymentDayDefault')}
              </Text>
              <Ionicons name="chevron-forward" size={20} color={theme.textMuted} />
            </TouchableOpacity>
            <Text style={{ fontSize: 11, color: theme.textMuted, marginTop: 4 }}>
              {t('loan.repaymentDayHint')}
            </Text>
          </View>

          {/* 이자 납부일 (만기일시상환 시) */}
          {repaymentType === 'bullet' && (
            <View style={{ marginBottom: 20 }}>
              <Text style={{ fontSize: 14, color: theme.textSecondary, marginBottom: 8 }}>
                {t('loan.interestPaymentDay')}
              </Text>
              <TouchableOpacity
                style={{
                  backgroundColor: theme.backgroundSecondary,
                  borderRadius: 8,
                  padding: 16,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
                onPress={() => setShowInterestPaymentDayPicker(true)}
              >
                <Text style={{ fontSize: 16, color: interestPaymentDay ? theme.text : theme.textMuted }}>
                  {interestPaymentDay ? t('loan.interestPaymentDayFormat', { day: interestPaymentDay }) : t('loan.interestPaymentDayDefault')}
                </Text>
                <Ionicons name="chevron-forward" size={20} color={theme.textMuted} />
              </TouchableOpacity>
              <Text style={{ fontSize: 11, color: theme.textMuted, marginTop: 4 }}>
                {t('loan.interestPaymentDayHint')}
              </Text>
            </View>
          )}

          {/* 연결 계좌 (자동 차감용) */}
          <View style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 14, color: theme.textSecondary, marginBottom: 8 }}>
              {t('loan.linkedAccount')}
            </Text>
            <TouchableOpacity
              style={{
                backgroundColor: theme.backgroundSecondary,
                borderRadius: 8,
                padding: 16,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
              onPress={() => setShowAssetPicker(true)}
            >
              <Text style={{ fontSize: 16, color: linkedAssetId ? theme.text : theme.textMuted }}>
                {linkedAssetId
                  ? fiatAssets.find((a) => a.id === linkedAssetId)?.name || t('loan.selectAccount')
                  : t('loan.selectAccount')}
              </Text>
              <Ionicons name="chevron-forward" size={20} color={theme.textMuted} />
            </TouchableOpacity>
            <Text style={{ fontSize: 11, color: theme.textMuted, marginTop: 4 }}>
              {t('loan.autoDeductHint')}
            </Text>
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
              placeholder={t('common.memo')}
              placeholderTextColor={theme.placeholder}
              multiline
              value={memo}
              onChangeText={setMemo}
            />
          </View>

          {/* 계산 결과 */}
          {amount > 0 && rate > 0 && (
            <View
              style={{
                backgroundColor: theme.infoBanner,
                borderRadius: 12,
                padding: 16,
                marginBottom: 20,
              }}
            >
              <Text style={{ fontSize: 14, fontWeight: '600', color: theme.infoBannerSubtext, marginBottom: 12 }}>
                {t('loan.calculationResult')}
              </Text>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                <Text style={{ color: theme.infoBannerSubtext }}>
                  {t('loan.monthlyPayment')} {repaymentType === 'bullet' && `(${t('loan.monthlyPaymentInterest').replace(t('loan.monthlyPayment') + ' ', '')})`}
                </Text>
                <Text style={{ fontWeight: 'bold', color: theme.infoBannerText }}>
                  {formatKrw(monthlyPayment)}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                <Text style={{ color: theme.infoBannerSubtext }}>{t('loan.totalInterest')}</Text>
                <Text style={{ color: theme.infoBannerText }}>{formatKrw(totalInterest)}</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ color: theme.infoBannerSubtext }}>{t('loan.totalRepayment')}</Text>
                <Text style={{ color: theme.infoBannerText }}>{formatKrw(amount + totalInterest)}</Text>
              </View>
              {repaymentType === 'bullet' && (
                <Text style={{ fontSize: 11, color: theme.textMuted, marginTop: 8 }}>
                  {t('loan.bulletNote', { amount: formatKrw(amount) })}
                </Text>
              )}
            </View>
          )}
        </View>
      </ScrollView>

      {/* 상환 방식 선택 모달 */}
      <Modal visible={showTypePicker} transparent animationType="slide">
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
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: theme.text }}>{t('loan.selectRepaymentType')}</Text>
              <TouchableOpacity onPress={() => setShowTypePicker(false)}>
                <Ionicons name="close" size={24} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            {(Object.keys(REPAYMENT_TYPE_LABELS) as RepaymentType[]).map((type) => (
              <TouchableOpacity
                key={type}
                style={{
                  padding: 16,
                  backgroundColor: repaymentType === type ? theme.infoBanner : theme.backgroundSecondary,
                  borderRadius: 8,
                  marginBottom: 8,
                  borderWidth: repaymentType === type ? 1 : 0,
                  borderColor: '#3B82F6',
                }}
                onPress={() => {
                  setRepaymentType(type);
                  setShowTypePicker(false);
                }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 16, fontWeight: '500', color: theme.text }}>
                      {REPAYMENT_TYPE_LABELS[type]}
                    </Text>
                    <Text style={{ fontSize: 12, color: theme.textSecondary, marginTop: 4 }}>
                      {REPAYMENT_TYPE_DESCRIPTIONS[type]}
                    </Text>
                  </View>
                  {repaymentType === type && (
                    <Ionicons name="checkmark-circle" size={24} color="#3B82F6" />
                  )}
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>

      {/* 대출 기간 선택 모달 */}
      <Modal visible={showTermPicker} transparent animationType="slide">
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
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: theme.text }}>{t('loan.selectLoanTerm')}</Text>
              <TouchableOpacity onPress={() => setShowTermPicker(false)}>
                <Ionicons name="close" size={24} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 16 }}>
              {LOAN_TERMS.map((m) => (
                <TouchableOpacity
                  key={m}
                  style={{
                    width: '30%',
                    padding: 12,
                    backgroundColor: termMonths === m && !customTerm ? '#3B82F6' : theme.backgroundTertiary,
                    borderRadius: 8,
                    margin: '1.5%',
                    alignItems: 'center',
                  }}
                  onPress={() => {
                    setTermMonths(m);
                    setCustomTerm('');
                    setShowTermPicker(false);
                  }}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      color: termMonths === m && !customTerm ? '#FFFFFF' : theme.text,
                    }}
                  >
                    {formatTermLabel(m)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={{ fontSize: 14, color: theme.textSecondary, marginBottom: 8 }}>{t('loan.customTermInput')}</Text>
            <TextInput
              style={{
                backgroundColor: theme.backgroundSecondary,
                borderRadius: 8,
                padding: 16,
                fontSize: 16,
                color: theme.inputText,
              }}
              placeholder={t('loan.customTermPlaceholder')}
              placeholderTextColor={theme.placeholder}
              keyboardType="number-pad"
              value={customTerm}
              onChangeText={setCustomTerm}
            />

            <TouchableOpacity
              style={{
                backgroundColor: '#3B82F6',
                padding: 16,
                borderRadius: 8,
                alignItems: 'center',
                marginTop: 16,
              }}
              onPress={() => setShowTermPicker(false)}
            >
              <Text style={{ color: '#FFFFFF', fontWeight: '600' }}>{t('common.confirm')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 은행 선택 모달 */}
      <Modal visible={showBankPicker} transparent animationType="slide">
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
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: theme.text }}>{t('loan.selectLenderTitle')}</Text>
              <TouchableOpacity onPress={() => setShowBankPicker(false)}>
                <Ionicons name="close" size={24} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView>
              {region.banks.map((bank) => (
                <TouchableOpacity
                  key={bank.id}
                  style={{
                    padding: 16,
                    backgroundColor: selectedBankId === bank.id ? theme.infoBanner : theme.backgroundSecondary,
                    borderRadius: 8,
                    marginBottom: 8,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                  onPress={() => {
                    setSelectedBankId(bank.id);
                    setInstitution(bank.id);
                    setShowBankPicker(false);
                  }}
                >
                  <Text style={{ fontSize: 16, color: theme.text }}>{t('banks.' + bank.id)}</Text>
                  {selectedBankId === bank.id && (
                    <Ionicons name="checkmark" size={20} color="#3B82F6" />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* 직접 입력 */}
            <View style={{ marginTop: 16 }}>
              <Text style={{ fontSize: 14, color: theme.textSecondary, marginBottom: 8 }}>{t('loan.customLender')}</Text>
              <View style={{ flexDirection: 'row' }}>
                <TextInput
                  style={{
                    flex: 1,
                    backgroundColor: theme.backgroundSecondary,
                    borderRadius: 8,
                    padding: 16,
                    fontSize: 16,
                    color: theme.inputText,
                  }}
                  placeholder={t('loan.customLenderPlaceholder')}
                  placeholderTextColor={theme.placeholder}
                  value={selectedBankId === 'custom' ? institution : ''}
                  onChangeText={(text) => {
                    setSelectedBankId('custom');
                    setInstitution(text);
                  }}
                />
                <TouchableOpacity
                  style={{
                    backgroundColor: '#3B82F6',
                    paddingHorizontal: 20,
                    borderRadius: 8,
                    marginLeft: 8,
                    justifyContent: 'center',
                  }}
                  onPress={() => setShowBankPicker(false)}
                >
                  <Text style={{ color: '#FFFFFF', fontWeight: '600' }}>{t('common.confirm')}</Text>
                </TouchableOpacity>
              </View>
            </View>
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
                    backgroundColor: '#3B82F6',
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

      {/* 상환일 선택 모달 */}
      <Modal visible={showRepaymentDayPicker} transparent animationType="slide">
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
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: theme.text }}>{t('loan.selectRepaymentDay')}</Text>
              <TouchableOpacity onPress={() => setShowRepaymentDayPicker(false)}>
                <Ionicons name="close" size={24} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* 기본값 (시작일 기준) */}
            <TouchableOpacity
              style={{
                padding: 16,
                backgroundColor: repaymentDay === null ? theme.infoBanner : theme.backgroundSecondary,
                borderRadius: 8,
                marginBottom: 12,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderWidth: repaymentDay === null ? 1 : 0,
                borderColor: '#3B82F6',
              }}
              onPress={() => {
                setRepaymentDay(null);
                setShowRepaymentDayPicker(false);
              }}
            >
              <Text style={{ fontSize: 16, color: theme.text }}>{t('loan.repaymentDayDefault')}</Text>
              {repaymentDay === null && (
                <Ionicons name="checkmark-circle" size={24} color="#3B82F6" />
              )}
            </TouchableOpacity>

            <ScrollView style={{ maxHeight: 300 }}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
                  <TouchableOpacity
                    key={day}
                    style={{
                      width: '14%',
                      aspectRatio: 1,
                      margin: '0.5%',
                      backgroundColor: repaymentDay === day ? '#3B82F6' : theme.backgroundTertiary,
                      borderRadius: 8,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                    onPress={() => {
                      setRepaymentDay(day);
                      setShowRepaymentDayPicker(false);
                    }}
                  >
                    <Text
                      maxFontSizeMultiplier={1.2}
                      style={{
                        fontSize: 14,
                        fontWeight: '500',
                        color: repaymentDay === day ? '#FFFFFF' : theme.text,
                      }}
                    >
                      {day}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* 이자 납부일 선택 모달 */}
      <Modal visible={showInterestPaymentDayPicker} transparent animationType="slide">
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
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: theme.text }}>{t('loan.selectInterestPaymentDay')}</Text>
              <TouchableOpacity onPress={() => setShowInterestPaymentDayPicker(false)}>
                <Ionicons name="close" size={24} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* 기본값 */}
            <TouchableOpacity
              style={{
                padding: 16,
                backgroundColor: interestPaymentDay === null ? theme.infoBanner : theme.backgroundSecondary,
                borderRadius: 8,
                marginBottom: 12,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderWidth: interestPaymentDay === null ? 1 : 0,
                borderColor: '#3B82F6',
              }}
              onPress={() => {
                setInterestPaymentDay(null);
                setShowInterestPaymentDayPicker(false);
              }}
            >
              <Text style={{ fontSize: 16, color: theme.text }}>{t('loan.interestPaymentDayDefault')}</Text>
              {interestPaymentDay === null && (
                <Ionicons name="checkmark-circle" size={24} color="#3B82F6" />
              )}
            </TouchableOpacity>

            <ScrollView style={{ maxHeight: 300 }}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
                  <TouchableOpacity
                    key={day}
                    style={{
                      width: '14%',
                      aspectRatio: 1,
                      margin: '0.5%',
                      backgroundColor: interestPaymentDay === day ? '#3B82F6' : theme.backgroundTertiary,
                      borderRadius: 8,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                    onPress={() => {
                      setInterestPaymentDay(day);
                      setShowInterestPaymentDayPicker(false);
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: '500',
                        color: interestPaymentDay === day ? '#FFFFFF' : theme.text,
                      }}
                    >
                      {day}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* 연결 계좌 선택 모달 */}
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
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: theme.text }}>{t('loan.selectAccountTitle')}</Text>
              <TouchableOpacity onPress={() => setShowAssetPicker(false)}>
                <Ionicons name="close" size={24} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* 연결 안 함 */}
            <TouchableOpacity
              style={{
                padding: 16,
                backgroundColor: linkedAssetId === null ? theme.infoBanner : theme.backgroundSecondary,
                borderRadius: 8,
                marginBottom: 12,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderWidth: linkedAssetId === null ? 1 : 0,
                borderColor: '#3B82F6',
              }}
              onPress={() => {
                setLinkedAssetId(null);
                setShowAssetPicker(false);
              }}
            >
              <Text style={{ fontSize: 16, color: theme.text }}>{t('loan.noLinkedAccount')}</Text>
              {linkedAssetId === null && (
                <Ionicons name="checkmark-circle" size={24} color="#3B82F6" />
              )}
            </TouchableOpacity>

            {fiatAssets.length === 0 ? (
              <View style={{ padding: 20, alignItems: 'center' }}>
                <Ionicons name="wallet-outline" size={48} color={theme.textMuted} />
                <Text style={{ color: theme.textMuted, marginTop: 8, textAlign: 'center' }}>
                  {t('loan.noAccountsHint')}
                </Text>
              </View>
            ) : (
              <ScrollView>
                {fiatAssets.map((asset) => (
                  <TouchableOpacity
                    key={asset.id}
                    style={{
                      padding: 16,
                      backgroundColor: linkedAssetId === asset.id ? theme.infoBanner : theme.backgroundSecondary,
                      borderRadius: 8,
                      marginBottom: 8,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      borderWidth: linkedAssetId === asset.id ? 1 : 0,
                      borderColor: '#3B82F6',
                    }}
                    onPress={() => {
                      setLinkedAssetId(asset.id);
                      setShowAssetPicker(false);
                    }}
                  >
                    <View>
                      <Text style={{ fontSize: 16, color: theme.text }}>{asset.name}</Text>
                      <Text style={{ fontSize: 12, color: theme.textMuted, marginTop: 2 }}>
                        {asset.balance.toLocaleString()}{t('common.won')}
                        {asset.isOverdraft && ` (${t('assets.overdraft')})`}
                      </Text>
                    </View>
                    {linkedAssetId === asset.id && (
                      <Ionicons name="checkmark-circle" size={24} color="#3B82F6" />
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
