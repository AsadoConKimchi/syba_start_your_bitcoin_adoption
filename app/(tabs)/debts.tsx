import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useDebtStore } from '../../src/stores/debtStore';
import { useCardStore } from '../../src/stores/cardStore';
import { useAuthStore } from '../../src/stores/authStore';
import { usePriceStore } from '../../src/stores/priceStore';
import { useSubscriptionStore } from '../../src/stores/subscriptionStore';
import { formatKrw, formatSats } from '../../src/utils/formatters';
import { Installment, Loan, REPAYMENT_TYPE_LABELS } from '../../src/types/debt';
import { PremiumGate } from '../../src/components/PremiumGate';

export default function DebtsScreen() {
  const { encryptionKey } = useAuthStore();
  const { isSubscribed } = useSubscriptionStore();
  const { t } = useTranslation();
  const {
    installments,
    loans,
    isLoading,
    loadDebts,
    getActiveInstallments,
    getActiveLoans,
    getThisMonthDue,
    getTotalDebt,
  } = useDebtStore();
  const { cards, getCardById } = useCardStore();
  const { btcKrw, subscribeRealTimePrice, unsubscribeRealTimePrice } = usePriceStore();

  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'installment' | 'loan'>('installment');

  const krwToSats = (krw: number) => btcKrw ? Math.round(krw / (btcKrw / 100_000_000)) : 0;

  useFocusEffect(
    useCallback(() => {
      subscribeRealTimePrice();
      return () => {
        unsubscribeRealTimePrice();
      };
    }, [])
  );

  useEffect(() => {
    if (encryptionKey) {
      loadDebts(encryptionKey);
    }
  }, [encryptionKey]);

  const onRefresh = async () => {
    if (!encryptionKey) return;
    setRefreshing(true);
    await loadDebts(encryptionKey);
    setRefreshing(false);
  };

  const activeInstallments = getActiveInstallments();
  const activeLoans = getActiveLoans();
  const thisMonthDue = getThisMonthDue();
  const totalDebt = getTotalDebt();

  const thisMonthInstallmentTotal = thisMonthDue.installments.reduce(
    (sum, i) => sum + i.monthlyPayment,
    0
  );
  const thisMonthLoanTotal = thisMonthDue.loans.reduce(
    (sum, l) => sum + l.monthlyPayment,
    0
  );
  const thisMonthTotal = thisMonthInstallmentTotal + thisMonthLoanTotal;

  const getCardName = (cardId: string) => {
    const card = getCardById(cardId);
    return card?.name || t('debts.deletedCard');
  };

  const renderInstallmentItem = (item: Installment) => {
    const card = getCardById(item.cardId);
    const progress = item.paidMonths / item.months;
    const remainingMonths = item.months - item.paidMonths;

    return (
      <TouchableOpacity
        key={item.id}
        style={{
          backgroundColor: '#F9FAFB',
          borderRadius: 12,
          padding: 16,
          marginBottom: 12,
        }}
        onPress={() => router.push(`/(modals)/installment-detail?id=${item.id}`)}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, fontWeight: '600', color: '#1A1A1A' }}>
              {item.storeName}
            </Text>
            <Text style={{ fontSize: 12, color: '#9CA3AF' }}>
              {card?.name || t('debts.deletedCard')} • {item.isInterestFree ? t('common.noInterest') : `${t('loan.annualRate').replace(' *', '')} ${item.interestRate}%`}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#EF4444' }}>
              {formatKrw(item.remainingAmount)}
            </Text>
            <Text style={{ fontSize: 12, color: '#9CA3AF' }}>
              {t('debts.monthlyPayment')} {formatKrw(item.monthlyPayment)}
            </Text>
            {btcKrw && (
              <Text style={{ fontSize: 10, color: '#D1D5DB' }}>
                ≈ {formatSats(krwToSats(item.remainingAmount))}
              </Text>
            )}
          </View>
        </View>

        <View style={{ marginTop: 8 }}>
          <View
            style={{
              height: 6,
              backgroundColor: '#E5E7EB',
              borderRadius: 3,
              overflow: 'hidden',
            }}
          >
            <View
              style={{
                height: '100%',
                width: `${progress * 100}%`,
                backgroundColor: '#F7931A',
                borderRadius: 3,
              }}
            />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
            <Text style={{ fontSize: 11, color: '#9CA3AF' }}>
              {t('debts.paidMonths', { paid: item.paidMonths, total: item.months })}
            </Text>
            <Text style={{ fontSize: 11, color: '#666666' }}>
              {t('debts.remainingMonths', { count: remainingMonths })}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderLoanItem = (item: Loan) => {
    const progress = item.paidMonths / item.termMonths;
    const remainingMonths = item.termMonths - item.paidMonths;

    return (
      <TouchableOpacity
        key={item.id}
        style={{
          backgroundColor: '#F9FAFB',
          borderRadius: 12,
          padding: 16,
          marginBottom: 12,
        }}
        onPress={() => router.push(`/(modals)/loan-detail?id=${item.id}`)}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, fontWeight: '600', color: '#1A1A1A' }}>
              {item.name}
            </Text>
            <Text style={{ fontSize: 12, color: '#9CA3AF' }}>
              {item.institution} • {REPAYMENT_TYPE_LABELS[item.repaymentType]}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#EF4444' }}>
              {formatKrw(item.remainingPrincipal)}
            </Text>
            <Text style={{ fontSize: 12, color: '#9CA3AF' }}>
              {t('debts.monthlyPayment')} {formatKrw(item.monthlyPayment)}
            </Text>
            {btcKrw && (
              <Text style={{ fontSize: 10, color: '#D1D5DB' }}>
                ≈ {formatSats(krwToSats(item.remainingPrincipal))}
              </Text>
            )}
          </View>
        </View>

        <View style={{ flexDirection: 'row', marginBottom: 8 }}>
          <View
            style={{
              backgroundColor: '#E5E7EB',
              paddingHorizontal: 8,
              paddingVertical: 2,
              borderRadius: 4,
              marginRight: 8,
            }}
          >
            <Text style={{ fontSize: 11, color: '#666666' }}>{t('loan.annualRate').replace(' *', '')} {item.interestRate}%</Text>
          </View>
          <View
            style={{
              backgroundColor: '#E5E7EB',
              paddingHorizontal: 8,
              paddingVertical: 2,
              borderRadius: 4,
            }}
          >
            <Text style={{ fontSize: 11, color: '#666666' }}>
              {t('loan.principal')} {formatKrw(item.principal)}
            </Text>
          </View>
        </View>

        <View>
          <View
            style={{
              height: 6,
              backgroundColor: '#E5E7EB',
              borderRadius: 3,
              overflow: 'hidden',
            }}
          >
            <View
              style={{
                height: '100%',
                width: `${progress * 100}%`,
                backgroundColor: '#3B82F6',
                borderRadius: 3,
              }}
            />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
            <Text style={{ fontSize: 11, color: '#9CA3AF' }}>
              {t('debts.repaidMonths', { paid: item.paidMonths, total: item.termMonths })}
            </Text>
            <Text style={{ fontSize: 11, color: '#666666' }}>
              {t('debts.remainingMonths', { count: remainingMonths })}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (!isSubscribed) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
        <PremiumGate feature={t('debts.management')} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
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
        <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#1A1A1A' }}>{t('debts.title')}</Text>
        <TouchableOpacity
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: '#F7931A',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onPress={() => {
            Alert.alert(
              t('debts.addDebt'),
              t('debts.addDebtDescription'),
              [
                {
                  text: t('debts.addInstallment'),
                  onPress: () => router.push('/(modals)/add-installment'),
                },
                {
                  text: t('debts.addLoan'),
                  onPress: () => router.push('/(modals)/add-loan'),
                },
                { text: t('common.cancel'), style: 'cancel' },
              ]
            );
          }}
        >
          <Ionicons name="add" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View style={{ padding: 20 }}>
          <View
            style={{
              backgroundColor: '#FEF2F2',
              borderRadius: 16,
              padding: 20,
              marginBottom: 16,
            }}
          >
            <Text style={{ fontSize: 14, color: '#991B1B', marginBottom: 4 }}>{t('debts.totalDebt')}</Text>
            <Text style={{ fontSize: 32, fontWeight: 'bold', color: '#EF4444' }}>
              {formatKrw(totalDebt)}
            </Text>
            {btcKrw && (
              <Text style={{ fontSize: 12, color: '#9CA3AF' }}>
                ≈ {formatSats(krwToSats(totalDebt))}
              </Text>
            )}

            <View
              style={{
                flexDirection: 'row',
                marginTop: 16,
                paddingTop: 16,
                borderTopWidth: 1,
                borderTopColor: '#FECACA',
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, color: '#991B1B' }}>{t('debts.installments')}</Text>
                <Text style={{ fontSize: 16, fontWeight: '600', color: '#EF4444' }}>
                  {formatKrw(activeInstallments.reduce((s, i) => s + i.remainingAmount, 0))}
                </Text>
                <Text style={{ fontSize: 11, color: '#9CA3AF' }}>
                  {t('debts.inProgress', { count: activeInstallments.length })}
                </Text>
              </View>
              <View style={{ width: 1, backgroundColor: '#FECACA', marginHorizontal: 16 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, color: '#991B1B' }}>{t('debts.loans')}</Text>
                <Text style={{ fontSize: 16, fontWeight: '600', color: '#EF4444' }}>
                  {formatKrw(activeLoans.reduce((s, l) => s + l.remainingPrincipal, 0))}
                </Text>
                <Text style={{ fontSize: 11, color: '#9CA3AF' }}>
                  {t('debts.inProgress', { count: activeLoans.length })}
                </Text>
              </View>
            </View>
          </View>

          {thisMonthTotal > 0 && (
            <View
              style={{
                backgroundColor: '#FEF3C7',
                borderRadius: 12,
                padding: 16,
                marginBottom: 16,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                <Ionicons name="calendar" size={20} color="#92400E" style={{ marginRight: 8 }} />
                <Text style={{ fontSize: 14, fontWeight: '600', color: '#92400E' }}>
                  {t('debts.thisMonthDue')}
                </Text>
              </View>
              <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#B45309' }}>
                {formatKrw(thisMonthTotal)}
              </Text>
              {btcKrw && (
                <Text style={{ fontSize: 11, color: '#92400E' }}>
                  ≈ {formatSats(krwToSats(thisMonthTotal))}
                </Text>
              )}
              <Text style={{ fontSize: 12, color: '#92400E', marginTop: 4 }}>
                {t('debts.thisMonthDueDetail', {
                  installments: thisMonthDue.installments.length,
                  loans: thisMonthDue.loans.length,
                })}
              </Text>
            </View>
          )}
        </View>

        {/* Tabs */}
        <View style={{ flexDirection: 'row', paddingHorizontal: 20, marginBottom: 16 }}>
          <TouchableOpacity
            style={{
              flex: 1,
              paddingVertical: 12,
              backgroundColor: activeTab === 'installment' ? '#F7931A' : '#F3F4F6',
              borderRadius: 8,
              marginRight: 8,
              alignItems: 'center',
            }}
            onPress={() => setActiveTab('installment')}
          >
            <Text
              style={{
                fontSize: 14,
                fontWeight: '600',
                color: activeTab === 'installment' ? '#FFFFFF' : '#666666',
              }}
            >
              {t('debts.installmentCount', { count: activeInstallments.length })}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={{
              flex: 1,
              paddingVertical: 12,
              backgroundColor: activeTab === 'loan' ? '#3B82F6' : '#F3F4F6',
              borderRadius: 8,
              alignItems: 'center',
            }}
            onPress={() => setActiveTab('loan')}
          >
            <Text
              style={{
                fontSize: 14,
                fontWeight: '600',
                color: activeTab === 'loan' ? '#FFFFFF' : '#666666',
              }}
            >
              {t('debts.loanCount', { count: activeLoans.length })}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={{ paddingHorizontal: 20, paddingBottom: 40 }}>
          {activeTab === 'installment' ? (
            activeInstallments.length > 0 ? (
              activeInstallments.map(renderInstallmentItem)
            ) : (
              <View
                style={{
                  backgroundColor: '#F9FAFB',
                  borderRadius: 12,
                  padding: 40,
                  alignItems: 'center',
                }}
              >
                <Ionicons name="card-outline" size={48} color="#D1D5DB" />
                <Text style={{ fontSize: 14, color: '#9CA3AF', marginTop: 12 }}>
                  {t('debts.noInstallments')}
                </Text>
                <TouchableOpacity
                  style={{
                    marginTop: 16,
                    paddingHorizontal: 20,
                    paddingVertical: 10,
                    backgroundColor: '#F7931A',
                    borderRadius: 8,
                  }}
                  onPress={() => router.push('/(modals)/add-installment')}
                >
                  <Text style={{ color: '#FFFFFF', fontWeight: '600' }}>{t('debts.addInstallment')}</Text>
                </TouchableOpacity>
              </View>
            )
          ) : activeLoans.length > 0 ? (
            activeLoans.map(renderLoanItem)
          ) : (
            <View
              style={{
                backgroundColor: '#F9FAFB',
                borderRadius: 12,
                padding: 40,
                alignItems: 'center',
              }}
            >
              <Ionicons name="business-outline" size={48} color="#D1D5DB" />
              <Text style={{ fontSize: 14, color: '#9CA3AF', marginTop: 12 }}>
                {t('debts.noLoans')}
              </Text>
              <TouchableOpacity
                style={{
                  marginTop: 16,
                  paddingHorizontal: 20,
                  paddingVertical: 10,
                  backgroundColor: '#3B82F6',
                  borderRadius: 8,
                }}
                onPress={() => router.push('/(modals)/add-loan')}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '600' }}>{t('debts.addLoan')}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
