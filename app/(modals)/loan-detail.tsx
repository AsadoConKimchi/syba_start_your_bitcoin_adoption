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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useTranslation } from 'react-i18next';
import { useDebtStore } from '../../src/stores/debtStore';
import { useAuthStore } from '../../src/stores/authStore';
import { useAssetStore } from '../../src/stores/assetStore';
import { isFiatAsset } from '../../src/types/asset';
import { formatKrw, formatKrwPlain } from '../../src/utils/formatters';
import { calculateLoanPayment, generateRepaymentSchedule } from '../../src/utils/debtCalculator';
import {
  RepaymentType,
  REPAYMENT_TYPE_LABELS,
  REPAYMENT_TYPE_DESCRIPTIONS,
} from '../../src/types/debt';
import { BANKS } from '../../src/constants/banks';

const LOAN_TERMS = [12, 24, 36, 48, 60, 120, 240, 360];

export default function LoanDetailScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { encryptionKey } = useAuthStore();
  const { loans, updateLoan, deleteLoan } = useDebtStore();
  const { assets } = useAssetStore();

  const loan = loans.find((l) => l.id === id);

  // 법정화폐 자산만 필터링 (대출 상환용)
  const fiatAssets = assets.filter(isFiatAsset);

  const [isEditing, setIsEditing] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
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
  const [memo, setMemo] = useState('');
  const [repaymentDay, setRepaymentDay] = useState<number | null>(null);
  const [linkedAssetId, setLinkedAssetId] = useState<string | null>(null);

  const [showBankPicker, setShowBankPicker] = useState(false);
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [showTermPicker, setShowTermPicker] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showRepaymentDayPicker, setShowRepaymentDayPicker] = useState(false);
  const [showAssetPicker, setShowAssetPicker] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 초기값 설정
  useEffect(() => {
    if (loan) {
      setName(loan.name);
      setInstitution(loan.institution);
      setPrincipal(loan.principal.toLocaleString());
      setInterestRate(loan.interestRate.toString());
      setRepaymentType(loan.repaymentType);
      setTermMonths(loan.termMonths);
      setStartDate(new Date(loan.startDate));
      setPaidMonths(loan.paidMonths.toString());
      setMemo(loan.memo || '');
      setRepaymentDay(loan.repaymentDay ?? null);
      setLinkedAssetId(loan.linkedAssetId ?? null);
    }
  }, [loan]);

  if (!loan) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: '#9CA3AF' }}>{t('common.notFound')}</Text>
        <TouchableOpacity
          style={{ marginTop: 16, padding: 12, backgroundColor: '#3B82F6', borderRadius: 8 }}
          onPress={() => router.back()}
        >
          <Text style={{ color: '#FFFFFF' }}>{t('common.back')}</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const actualTerm = customTerm ? parseInt(customTerm) || termMonths : termMonths;
  const amount = parseInt(principal.replace(/[^0-9]/g, '')) || 0;
  const rate = parseFloat(interestRate) || 0;

  const { monthlyPayment, totalInterest } = calculateLoanPayment(
    amount,
    rate,
    actualTerm,
    repaymentType
  );

  const progress = loan.paidMonths / loan.termMonths;
  const remainingMonths = loan.termMonths - loan.paidMonths;

  // 상환 스케줄 계산
  const schedule = generateRepaymentSchedule(
    loan.principal,
    loan.interestRate,
    loan.termMonths,
    loan.repaymentType,
    loan.startDate
  );

  const formatTermLabel = (months: number): string => {
    return t('installment.monthsFormat', { count: months });
  };

  const handleSave = async () => {
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
      await updateLoan(
        loan.id,
        {
          name: name.trim(),
          institution: institution.trim(),
          principal: amount,
          interestRate: rate,
          repaymentType,
          termMonths: actualTerm,
          startDate: startDate.toISOString().split('T')[0],
          paidMonths: parseInt(paidMonths) || 0,
          memo: memo.trim() || null,
          repaymentDay: repaymentDay ?? undefined,
          linkedAssetId: linkedAssetId ?? undefined,
        },
        encryptionKey
      );

      setIsEditing(false);
      Alert.alert(t('common.done'), t('loan.editDone'));
    } catch (error) {
      console.error('대출 수정 실패:', error);
      Alert.alert(t('common.error'), t('loan.editFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      t('loan.deleteConfirm'),
      t('loan.deleteMessage', { name: loan.name }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            if (!encryptionKey) return;
            try {
              await deleteLoan(loan.id, encryptionKey);
              router.back();
            } catch (error) {
              console.error('대출 삭제 실패:', error);
              Alert.alert(t('common.error'), t('loan.deleteFailed'));
            }
          },
        },
      ]
    );
  };

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
          <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#1A1A1A' }}>{t('loan.detailTitle')}</Text>
          <TouchableOpacity onPress={() => setIsEditing(true)}>
            <Text style={{ fontSize: 16, fontWeight: '600', color: '#3B82F6' }}>{t('common.edit')}</Text>
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
              {loan.name}
            </Text>
            <Text style={{ fontSize: 14, color: '#9CA3AF' }}>{loan.institution}</Text>
          </View>

          {/* 금액 정보 */}
          <View
            style={{
              backgroundColor: '#EFF6FF',
              borderRadius: 12,
              padding: 20,
              marginBottom: 16,
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
              <Text style={{ fontSize: 14, color: '#1E40AF' }}>{t('loan.principal')}</Text>
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#2563EB' }}>
                {formatKrw(loan.principal)}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
              <Text style={{ fontSize: 14, color: '#1E40AF' }}>
                {t('loan.monthlyPayment')} {loan.repaymentType === 'bullet' && `(${t('loan.monthlyPaymentInterest').replace(t('loan.monthlyPayment') + ' ', '')})`}
              </Text>
              <Text style={{ fontSize: 16, fontWeight: '600', color: '#2563EB' }}>
                {formatKrw(loan.monthlyPayment)}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 14, color: '#1E40AF' }}>{t('loan.remainingPrincipal')}</Text>
              <Text style={{ fontSize: 16, fontWeight: '600', color: '#EF4444' }}>
                {formatKrw(loan.remainingPrincipal)}
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
              {t('loan.progressStatus')}
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
                  backgroundColor: '#3B82F6',
                  borderRadius: 6,
                }}
              />
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 14, color: '#666666' }}>
                {t('debts.repaidMonths', { paid: loan.paidMonths, total: loan.termMonths })}
              </Text>
              <Text style={{ fontSize: 14, fontWeight: '600', color: '#3B82F6' }}>
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
              {t('loan.detailInfo')}
            </Text>
            <View style={{ marginBottom: 12 }}>
              <Text style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 4 }}>{t('loan.repaymentType')}</Text>
              <Text style={{ fontSize: 14, color: '#1A1A1A' }}>
                {REPAYMENT_TYPE_LABELS[loan.repaymentType]}
              </Text>
              <Text style={{ fontSize: 12, color: '#666666' }}>
                {REPAYMENT_TYPE_DESCRIPTIONS[loan.repaymentType]}
              </Text>
            </View>
            <View style={{ marginBottom: 12 }}>
              <Text style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 4 }}>{t('loan.annualRate')}</Text>
              <Text style={{ fontSize: 14, color: '#1A1A1A' }}>{loan.interestRate}%</Text>
            </View>
            <View style={{ marginBottom: 12 }}>
              <Text style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 4 }}>{t('loan.loanTerm')}</Text>
              <Text style={{ fontSize: 14, color: '#1A1A1A' }}>
                {formatTermLabel(loan.termMonths)}
              </Text>
            </View>
            <View style={{ marginBottom: 12 }}>
              <Text style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 4 }}>{t('loan.startEndDate')}</Text>
              <Text style={{ fontSize: 14, color: '#1A1A1A' }}>
                {new Date(loan.startDate).toLocaleDateString('ko-KR')} ~ {new Date(loan.endDate).toLocaleDateString('ko-KR')}
              </Text>
            </View>
            <View style={{ marginBottom: 12 }}>
              <Text style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 4 }}>{t('loan.repaymentDay')}</Text>
              <Text style={{ fontSize: 14, color: '#1A1A1A' }}>
                {loan.repaymentDay ? t('loan.repaymentDayFormat', { day: loan.repaymentDay }) : `${t('loan.repaymentDayDefault')} (${t('loan.repaymentDayFormat', { day: parseInt(loan.startDate.split('-')[2]) })})`}
              </Text>
            </View>
            <View style={{ marginBottom: 12 }}>
              <Text style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 4 }}>{t('loan.linkedAccount')}</Text>
              <Text style={{ fontSize: 14, color: loan.linkedAssetId ? '#1A1A1A' : '#9CA3AF' }}>
                {loan.linkedAssetId
                  ? fiatAssets.find((a) => a.id === loan.linkedAssetId)?.name || t('loan.unknownAccount')
                  : t('loan.noLinkedAccount')}
              </Text>
            </View>
            <View style={{ marginBottom: 12 }}>
              <Text style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 4 }}>{t('loan.totalInterest')}</Text>
              <Text style={{ fontSize: 14, color: '#EF4444' }}>
                {formatKrw(loan.totalInterest)}
              </Text>
            </View>
            {loan.memo && (
              <View>
                <Text style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 4 }}>{t('common.memo')}</Text>
                <Text style={{ fontSize: 14, color: '#1A1A1A' }}>{loan.memo}</Text>
              </View>
            )}
          </View>

          {/* 상환 스케줄 버튼 */}
          <TouchableOpacity
            style={{
              backgroundColor: '#EFF6FF',
              borderRadius: 12,
              padding: 16,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 16,
            }}
            onPress={() => setShowSchedule(true)}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="calendar-outline" size={24} color="#3B82F6" style={{ marginRight: 12 }} />
              <Text style={{ fontSize: 16, fontWeight: '600', color: '#2563EB' }}>{t('loan.viewSchedule')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#3B82F6" />
          </TouchableOpacity>

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
            <Text style={{ fontSize: 16, fontWeight: '600', color: '#DC2626' }}>{t('loan.deleteConfirm')}</Text>
          </TouchableOpacity>
        </ScrollView>

        {/* 상환 스케줄 모달 (바텀시트 스타일) */}
        <Modal visible={showSchedule} transparent animationType="slide">
          <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' }}>
            <View
              style={{
                backgroundColor: '#FFFFFF',
                borderTopLeftRadius: 20,
                borderTopRightRadius: 20,
                maxHeight: '80%',
              }}
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
                <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#1A1A1A' }}>{t('loan.repaymentSchedule')}</Text>
                <TouchableOpacity onPress={() => setShowSchedule(false)}>
                  <Ionicons name="close" size={24} color="#666666" />
                </TouchableOpacity>
              </View>

              <ScrollView style={{ flexGrow: 0 }}>
                {/* 테이블 헤더 */}
                <View
                  style={{
                    flexDirection: 'row',
                    padding: 16,
                    backgroundColor: '#F3F4F6',
                    borderBottomWidth: 1,
                    borderBottomColor: '#E5E7EB',
                  }}
                >
                  <Text style={{ flex: 1, fontSize: 12, fontWeight: '600', color: '#666666', textAlign: 'center' }}>
                    {t('loan.scheduleNumber')}
                  </Text>
                  <Text style={{ flex: 2, fontSize: 12, fontWeight: '600', color: '#666666', textAlign: 'center' }}>
                    {t('common.date')}
                  </Text>
                  <Text style={{ flex: 2, fontSize: 12, fontWeight: '600', color: '#666666', textAlign: 'right' }}>
                    {t('loan.schedulePrincipal')}
                  </Text>
                  <Text style={{ flex: 2, fontSize: 12, fontWeight: '600', color: '#666666', textAlign: 'right' }}>
                    {t('loan.scheduleInterest')}
                  </Text>
                  <Text style={{ flex: 2, fontSize: 12, fontWeight: '600', color: '#666666', textAlign: 'right' }}>
                    {t('loan.scheduleTotal')}
                  </Text>
                </View>

                {/* 스케줄 목록 */}
                {schedule.map((item) => {
                  const isPaid = item.month <= loan.paidMonths;
                  return (
                    <View
                      key={item.month}
                      style={{
                        flexDirection: 'row',
                        padding: 16,
                        borderBottomWidth: 1,
                        borderBottomColor: '#F3F4F6',
                        backgroundColor: isPaid ? '#F0FDF4' : '#FFFFFF',
                      }}
                    >
                      <Text
                        style={{
                          flex: 1,
                          fontSize: 12,
                          color: isPaid ? '#22C55E' : '#1A1A1A',
                          textAlign: 'center',
                        }}
                      >
                        {item.month}
                      </Text>
                      <Text
                        style={{
                          flex: 2,
                          fontSize: 12,
                          color: isPaid ? '#22C55E' : '#666666',
                          textAlign: 'center',
                        }}
                      >
                        {new Date(item.date).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}
                      </Text>
                      <Text
                        style={{
                          flex: 2,
                          fontSize: 12,
                          color: isPaid ? '#22C55E' : '#1A1A1A',
                          textAlign: 'right',
                        }}
                      >
                        {formatKrwPlain(item.principal)}
                      </Text>
                      <Text
                        style={{
                          flex: 2,
                          fontSize: 12,
                          color: isPaid ? '#22C55E' : '#9CA3AF',
                          textAlign: 'right',
                        }}
                      >
                        {formatKrwPlain(item.interest)}
                      </Text>
                      <Text
                        style={{
                          flex: 2,
                          fontSize: 12,
                          fontWeight: '600',
                          color: isPaid ? '#22C55E' : '#3B82F6',
                          textAlign: 'right',
                        }}
                      >
                        {formatKrwPlain(item.total)}
                      </Text>
                    </View>
                  );
                })}

                <View style={{ height: 40 }} />
              </ScrollView>
            </View>
          </View>
        </Modal>
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
        <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#1A1A1A' }}>{t('loan.editTitle')}</Text>
        <TouchableOpacity onPress={handleSave} disabled={isSubmitting}>
          <Text
            style={{
              fontSize: 16,
              fontWeight: '600',
              color: isSubmitting ? '#9CA3AF' : '#3B82F6',
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
            <Text style={{ fontSize: 14, color: '#666666', marginBottom: 8 }}>{t('loan.loanName')} *</Text>
            <TextInput
              style={{
                backgroundColor: '#F9FAFB',
                borderRadius: 8,
                padding: 16,
                fontSize: 16,
                color: '#1A1A1A',
              }}
              value={name}
              onChangeText={setName}
            />
          </View>

          {/* 대출 기관 */}
          <View style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 14, color: '#666666', marginBottom: 8 }}>{t('loan.lender')} *</Text>
            <TouchableOpacity
              style={{
                backgroundColor: '#F9FAFB',
                borderRadius: 8,
                padding: 16,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
              onPress={() => setShowBankPicker(true)}
            >
              <Text style={{ fontSize: 16, color: institution ? '#1A1A1A' : '#9CA3AF' }}>
                {institution || t('loan.selectLender')}
              </Text>
              <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
            </TouchableOpacity>
          </View>

          {/* 대출 원금 */}
          <View style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 14, color: '#666666', marginBottom: 8 }}>{t('loan.principal')} *</Text>
            <TextInput
              style={{
                backgroundColor: '#F9FAFB',
                borderRadius: 8,
                padding: 16,
                fontSize: 24,
                fontWeight: 'bold',
                color: '#3B82F6',
                textAlign: 'right',
              }}
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
          </View>

          {/* 연 이자율 */}
          <View style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 14, color: '#666666', marginBottom: 8 }}>{t('loan.annualRate')}</Text>
            <TextInput
              style={{
                backgroundColor: '#F9FAFB',
                borderRadius: 8,
                padding: 16,
                fontSize: 16,
                color: '#1A1A1A',
              }}
              keyboardType="decimal-pad"
              value={interestRate}
              onChangeText={setInterestRate}
            />
          </View>

          {/* 상환 방식 */}
          <View style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 14, color: '#666666', marginBottom: 8 }}>{t('loan.repaymentType')} *</Text>
            <TouchableOpacity
              style={{
                backgroundColor: '#F9FAFB',
                borderRadius: 8,
                padding: 16,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
              onPress={() => setShowTypePicker(true)}
            >
              <View>
                <Text style={{ fontSize: 16, color: '#1A1A1A' }}>
                  {REPAYMENT_TYPE_LABELS[repaymentType]}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
            </TouchableOpacity>
          </View>

          {/* 대출 기간 */}
          <View style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 14, color: '#666666', marginBottom: 8 }}>{t('loan.loanTerm')} *</Text>
            <TouchableOpacity
              style={{
                backgroundColor: '#F9FAFB',
                borderRadius: 8,
                padding: 16,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
              onPress={() => setShowTermPicker(true)}
            >
              <Text style={{ fontSize: 16, color: '#1A1A1A' }}>
                {formatTermLabel(customTerm ? parseInt(customTerm) || termMonths : termMonths)}
              </Text>
              <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
            </TouchableOpacity>
          </View>

          {/* 시작일 */}
          <View style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 14, color: '#666666', marginBottom: 8 }}>{t('loan.startDate')}</Text>
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

          {/* 이미 상환한 개월 */}
          <View style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 14, color: '#666666', marginBottom: 8 }}>
              {t('loan.paidMonths')}
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

          {/* 상환일 */}
          <View style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 14, color: '#666666', marginBottom: 8 }}>
              {t('loan.repaymentDay')}
            </Text>
            <TouchableOpacity
              style={{
                backgroundColor: '#F9FAFB',
                borderRadius: 8,
                padding: 16,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
              onPress={() => setShowRepaymentDayPicker(true)}
            >
              <Text style={{ fontSize: 16, color: repaymentDay ? '#1A1A1A' : '#9CA3AF' }}>
                {repaymentDay ? t('loan.repaymentDayFormat', { day: repaymentDay }) : t('loan.repaymentDayDefault')}
              </Text>
              <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
            </TouchableOpacity>
          </View>

          {/* 연결 계좌 */}
          <View style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 14, color: '#666666', marginBottom: 8 }}>
              {t('loan.linkedAccount')}
            </Text>
            <TouchableOpacity
              style={{
                backgroundColor: '#F9FAFB',
                borderRadius: 8,
                padding: 16,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
              onPress={() => setShowAssetPicker(true)}
            >
              <Text style={{ fontSize: 16, color: linkedAssetId ? '#1A1A1A' : '#9CA3AF' }}>
                {linkedAssetId
                  ? fiatAssets.find((a) => a.id === linkedAssetId)?.name || t('loan.selectAccount')
                  : t('loan.selectAccount')}
              </Text>
              <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
            </TouchableOpacity>
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
              placeholder={t('common.memo')}
              multiline
              value={memo}
              onChangeText={setMemo}
            />
          </View>

          {/* 계산 결과 */}
          {amount > 0 && rate > 0 && (
            <View
              style={{
                backgroundColor: '#EFF6FF',
                borderRadius: 12,
                padding: 16,
                marginBottom: 20,
              }}
            >
              <Text style={{ fontSize: 14, fontWeight: '600', color: '#1E40AF', marginBottom: 12 }}>
                {t('loan.calculationResult')}
              </Text>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                <Text style={{ color: '#1E40AF' }}>{t('loan.monthlyPayment')}</Text>
                <Text style={{ fontWeight: 'bold', color: '#2563EB' }}>
                  {formatKrw(monthlyPayment)}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ color: '#1E40AF' }}>{t('loan.totalInterest')}</Text>
                <Text style={{ color: '#2563EB' }}>{formatKrw(totalInterest)}</Text>
              </View>
            </View>
          )}
        </View>
      </ScrollView>

      {/* 은행 선택 모달 */}
      <Modal visible={showBankPicker} transparent animationType="slide">
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
              <Text style={{ fontSize: 18, fontWeight: 'bold' }}>{t('loan.selectLenderTitle')}</Text>
              <TouchableOpacity onPress={() => setShowBankPicker(false)}>
                <Ionicons name="close" size={24} color="#666666" />
              </TouchableOpacity>
            </View>

            <ScrollView>
              {BANKS.map((bank) => (
                <TouchableOpacity
                  key={bank.id}
                  style={{
                    padding: 16,
                    backgroundColor: institution === bank.name ? '#EFF6FF' : '#F9FAFB',
                    borderRadius: 8,
                    marginBottom: 8,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                  onPress={() => {
                    setSelectedBankId(bank.id);
                    setInstitution(bank.name);
                    setShowBankPicker(false);
                  }}
                >
                  <Text style={{ fontSize: 16, color: '#1A1A1A' }}>{bank.name}</Text>
                  {institution === bank.name && <Ionicons name="checkmark" size={20} color="#3B82F6" />}
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* 직접 입력 */}
            <View style={{ marginTop: 16 }}>
              <Text style={{ fontSize: 14, color: '#666666', marginBottom: 8 }}>{t('loan.customLender')}</Text>
              <View style={{ flexDirection: 'row' }}>
                <TextInput
                  style={{
                    flex: 1,
                    backgroundColor: '#F9FAFB',
                    borderRadius: 8,
                    padding: 16,
                    fontSize: 16,
                    color: '#1A1A1A',
                  }}
                  placeholder={t('loan.customLenderPlaceholder')}
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

      {/* 상환 방식 선택 모달 */}
      <Modal visible={showTypePicker} transparent animationType="slide">
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
              <Text style={{ fontSize: 18, fontWeight: 'bold' }}>{t('loan.selectRepaymentType')}</Text>
              <TouchableOpacity onPress={() => setShowTypePicker(false)}>
                <Ionicons name="close" size={24} color="#666666" />
              </TouchableOpacity>
            </View>

            {(Object.keys(REPAYMENT_TYPE_LABELS) as RepaymentType[]).map((type) => (
              <TouchableOpacity
                key={type}
                style={{
                  padding: 16,
                  backgroundColor: repaymentType === type ? '#EFF6FF' : '#F9FAFB',
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
                    <Text style={{ fontSize: 16, fontWeight: '500', color: '#1A1A1A' }}>
                      {REPAYMENT_TYPE_LABELS[type]}
                    </Text>
                    <Text style={{ fontSize: 12, color: '#666666', marginTop: 4 }}>
                      {REPAYMENT_TYPE_DESCRIPTIONS[type]}
                    </Text>
                  </View>
                  {repaymentType === type && <Ionicons name="checkmark-circle" size={24} color="#3B82F6" />}
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>

      {/* 대출 기간 선택 모달 */}
      <Modal visible={showTermPicker} transparent animationType="slide">
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
              <Text style={{ fontSize: 18, fontWeight: 'bold' }}>{t('loan.selectLoanTerm')}</Text>
              <TouchableOpacity onPress={() => setShowTermPicker(false)}>
                <Ionicons name="close" size={24} color="#666666" />
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 16 }}>
              {LOAN_TERMS.map((m) => (
                <TouchableOpacity
                  key={m}
                  style={{
                    width: '30%',
                    padding: 12,
                    backgroundColor: termMonths === m && !customTerm ? '#3B82F6' : '#F3F4F6',
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
                      color: termMonths === m && !customTerm ? '#FFFFFF' : '#1A1A1A',
                    }}
                  >
                    {formatTermLabel(m)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={{ fontSize: 14, color: '#666666', marginBottom: 8 }}>{t('loan.customTermInput')}</Text>
            <TextInput
              style={{
                backgroundColor: '#F9FAFB',
                borderRadius: 8,
                padding: 16,
                fontSize: 16,
                color: '#1A1A1A',
              }}
              placeholder={t('loan.customTermPlaceholder')}
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
              )}
            </View>
          </View>
        </Modal>
      )}

      {/* 상환일 선택 모달 */}
      <Modal visible={showRepaymentDayPicker} transparent animationType="slide">
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
              <Text style={{ fontSize: 18, fontWeight: 'bold' }}>{t('loan.selectRepaymentDay')}</Text>
              <TouchableOpacity onPress={() => setShowRepaymentDayPicker(false)}>
                <Ionicons name="close" size={24} color="#666666" />
              </TouchableOpacity>
            </View>

            {/* 기본값 (시작일 기준) */}
            <TouchableOpacity
              style={{
                padding: 16,
                backgroundColor: repaymentDay === null ? '#EFF6FF' : '#F9FAFB',
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
              <Text style={{ fontSize: 16, color: '#1A1A1A' }}>{t('loan.repaymentDayDefault')}</Text>
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
                      backgroundColor: repaymentDay === day ? '#3B82F6' : '#F3F4F6',
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
                      style={{
                        fontSize: 14,
                        fontWeight: '500',
                        color: repaymentDay === day ? '#FFFFFF' : '#1A1A1A',
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
              <Text style={{ fontSize: 18, fontWeight: 'bold' }}>{t('loan.selectAccountTitle')}</Text>
              <TouchableOpacity onPress={() => setShowAssetPicker(false)}>
                <Ionicons name="close" size={24} color="#666666" />
              </TouchableOpacity>
            </View>

            {/* 연결 안 함 */}
            <TouchableOpacity
              style={{
                padding: 16,
                backgroundColor: linkedAssetId === null ? '#EFF6FF' : '#F9FAFB',
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
              <Text style={{ fontSize: 16, color: '#1A1A1A' }}>{t('loan.noLinkedAccount')}</Text>
              {linkedAssetId === null && (
                <Ionicons name="checkmark-circle" size={24} color="#3B82F6" />
              )}
            </TouchableOpacity>

            {fiatAssets.length === 0 ? (
              <View style={{ padding: 20, alignItems: 'center' }}>
                <Ionicons name="wallet-outline" size={48} color="#9CA3AF" />
                <Text style={{ color: '#9CA3AF', marginTop: 8, textAlign: 'center' }}>
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
                      backgroundColor: linkedAssetId === asset.id ? '#EFF6FF' : '#F9FAFB',
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
                      <Text style={{ fontSize: 16, color: '#1A1A1A' }}>{asset.name}</Text>
                      <Text style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>
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
    </SafeAreaView>
  );
}
