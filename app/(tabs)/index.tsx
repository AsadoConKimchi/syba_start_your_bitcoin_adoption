import { View, Text, ScrollView, TouchableOpacity, RefreshControl, LayoutAnimation, Platform, UIManager } from 'react-native';
import { useState, useCallback, useMemo } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../src/hooks/useTheme';
import { useLedgerStore } from '../../src/stores/ledgerStore';
import { Expense, Income } from '../../src/types/ledger';
import { usePriceStore } from '../../src/stores/priceStore';
import { useSettingsStore } from '../../src/stores/settingsStore';
import { useCardStore } from '../../src/stores/cardStore';
import { useDebtStore } from '../../src/stores/debtStore';
import { useSubscriptionStore } from '../../src/stores/subscriptionStore';
import { formatKrw, formatSats, formatDateWithDay, getTodayString } from '../../src/utils/formatters';
import { krwToSats, satsToKrw } from '../../src/utils/calculations';

// SATS 기록은 amount가 sats 값이므로 btcKrwAtTime으로 원화 환산 필요
function getKrwAmount(record: any): number {
  if (record.currency === 'SATS' && record.btcKrwAtTime) {
    return satsToKrw(record.amount, record.btcKrwAtTime);
  }
  return record.amount;
}
import { calculateAllCardsPayment, CardPaymentWithNextCycle } from '../../src/utils/cardPaymentCalculator';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
import { NetWorthChart } from '../../src/components/charts';
import { PremiumBanner } from '../../src/components/PremiumGate';

export default function HomeScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const { t } = useTranslation();
  const { theme } = useTheme();

  const { records, getMonthlyTotal, getTodayTotal, loadRecords } = useLedgerStore();
  const { btcKrw, fetchPrices, lastUpdated, isOffline, kimchiPremium } = usePriceStore();
  const { settings } = useSettingsStore();
  const { cards } = useCardStore();
  const { installments } = useDebtStore();
  const { isSubscribed } = useSubscriptionStore();

  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth() + 1;

  const [expandedNextCards, setExpandedNextCards] = useState<Record<string, boolean>>({});

  const cardPayments = useMemo(() => {
    return calculateAllCardsPayment(cards, records, installments, new Date(), btcKrw || undefined)
      .filter((p) => p.current.totalPayment > 0 || p.next.totalPayment > 0)
      .sort((a, b) => (a.current.daysUntilPayment || 999) - (b.current.daysUntilPayment || 999));
  }, [cards, records, installments, btcKrw]);

  const toggleNextCard = (cardId: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedNextCards(prev => ({ ...prev, [cardId]: !prev[cardId] }));
  };

  const todayTotal = getTodayTotal();
  const monthlyTotal = getMonthlyTotal(year, month);

  const todayExpenseSats = btcKrw ? krwToSats(todayTotal.expense, btcKrw) : 0;
  const todayIncomeSats = btcKrw ? krwToSats(todayTotal.income, btcKrw) : 0;

  const netSaving = monthlyTotal.income - monthlyTotal.expense;
  const netSavingSats = monthlyTotal.incomeSats - monthlyTotal.expenseSats;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadRecords(), fetchPrices()]);
    setRefreshing(false);
  }, []);

  const todayRecords = records
    .filter((r): r is Expense | Income => r.date === getTodayString() && r.type !== 'transfer')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 8 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#F7931A" />
        }
      >
        {/* Header */}
        <View style={{ padding: 20 }}>
          <Text style={{ fontSize: 28, fontWeight: 'bold', color: theme.text }}>
            SYBA
          </Text>
          <Text style={{ fontSize: 14, color: theme.textSecondary, marginTop: 2 }}>
            Start Your Bitcoin Adoption
          </Text>
          <Text style={{ fontSize: 13, color: theme.textSecondary, marginTop: 4 }}>
            {formatDateWithDay(getTodayString())}
          </Text>
        </View>

        {/* Today summary */}
        <View style={{ paddingHorizontal: 20, marginBottom: 24 }}>
          <Text style={{ fontSize: 14, color: theme.textSecondary, marginBottom: 12 }}>{t('home.today')}</Text>
          <View style={{ flexDirection: 'row' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, color: theme.textSecondary }}>{t('home.income')}</Text>
              {settings.displayUnit === 'BTC' ? (
                <>
                  <Text style={{ fontSize: 20, fontWeight: '600', color: theme.success }}>
                    {formatSats(todayIncomeSats)}
                  </Text>
                  <Text style={{ fontSize: 12, color: theme.textMuted }}>
                    {formatKrw(todayTotal.income)}
                  </Text>
                </>
              ) : (
                <>
                  <Text style={{ fontSize: 20, fontWeight: '600', color: theme.success }}>
                    {formatKrw(todayTotal.income)}
                  </Text>
                  <Text style={{ fontSize: 12, color: theme.textMuted }}>
                    {formatSats(todayIncomeSats)}
                  </Text>
                </>
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, color: theme.textSecondary }}>{t('home.expense')}</Text>
              {settings.displayUnit === 'BTC' ? (
                <>
                  <Text style={{ fontSize: 20, fontWeight: '600', color: theme.error }}>
                    {formatSats(todayExpenseSats)}
                  </Text>
                  <Text style={{ fontSize: 12, color: theme.textMuted }}>
                    {formatKrw(todayTotal.expense)}
                  </Text>
                </>
              ) : (
                <>
                  <Text style={{ fontSize: 20, fontWeight: '600', color: theme.error }}>
                    {formatKrw(todayTotal.expense)}
                  </Text>
                  <Text style={{ fontSize: 12, color: theme.textMuted }}>
                    {formatSats(todayExpenseSats)}
                  </Text>
                </>
              )}
            </View>
          </View>
        </View>

        {/* Monthly status */}
        <View style={{ paddingHorizontal: 20, marginBottom: 24 }}>
          <Text style={{ fontSize: 14, color: theme.textSecondary, marginBottom: 12 }}>
            {t('home.monthStatus', { month })}
          </Text>
          <View
            style={{
              backgroundColor: theme.backgroundSecondary,
              borderRadius: 12,
              padding: 16,
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
              <View>
                <Text style={{ fontSize: 12, color: theme.textSecondary }}>{t('home.income')}</Text>
                {settings.displayUnit === 'BTC' ? (
                  <>
                    <Text style={{ fontSize: 18, fontWeight: '600', color: theme.success }}>
                      {formatSats(monthlyTotal.incomeSats)}
                    </Text>
                    <Text style={{ fontSize: 11, color: theme.textMuted }}>
                      {formatKrw(monthlyTotal.income)}
                    </Text>
                  </>
                ) : (
                  <>
                    <Text style={{ fontSize: 18, fontWeight: '600', color: theme.success }}>
                      {formatKrw(monthlyTotal.income)}
                    </Text>
                    <Text style={{ fontSize: 11, color: theme.textMuted }}>
                      {formatSats(monthlyTotal.incomeSats)}
                    </Text>
                  </>
                )}
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontSize: 12, color: theme.textSecondary }}>{t('home.expense')}</Text>
                {settings.displayUnit === 'BTC' ? (
                  <>
                    <Text style={{ fontSize: 18, fontWeight: '600', color: theme.error }}>
                      {formatSats(monthlyTotal.expenseSats)}
                    </Text>
                    <Text style={{ fontSize: 11, color: theme.textMuted }}>
                      {formatKrw(monthlyTotal.expense)}
                    </Text>
                  </>
                ) : (
                  <>
                    <Text style={{ fontSize: 18, fontWeight: '600', color: theme.error }}>
                      {formatKrw(monthlyTotal.expense)}
                    </Text>
                    <Text style={{ fontSize: 11, color: theme.textMuted }}>
                      {formatSats(monthlyTotal.expenseSats)}
                    </Text>
                  </>
                )}
              </View>
            </View>

            <View
              style={{
                borderTopWidth: 1,
                borderTopColor: theme.border,
                paddingTop: 16,
              }}
            >
              <Text style={{ fontSize: 12, color: theme.textSecondary }}>{t('home.netSaving')}</Text>
              {settings.displayUnit === 'BTC' ? (
                <>
                  <Text
                    style={{
                      fontSize: 24,
                      fontWeight: 'bold',
                      color: netSavingSats >= 0 ? theme.success : theme.error,
                    }}
                  >
                    {formatSats(Math.abs(netSavingSats))} {netSavingSats >= 0 ? '✨' : ''}
                  </Text>
                  <Text style={{ fontSize: 12, color: theme.textMuted }}>
                    {formatKrw(netSaving)}
                  </Text>
                </>
              ) : (
                <>
                  <Text
                    style={{
                      fontSize: 24,
                      fontWeight: 'bold',
                      color: netSaving >= 0 ? theme.success : theme.error,
                    }}
                  >
                    {formatKrw(netSaving)}
                  </Text>
                  <Text style={{ fontSize: 12, color: theme.textMuted }}>
                    {formatSats(Math.abs(netSavingSats))} {netSavingSats >= 0 ? '✨' : ''}
                  </Text>
                </>
              )}
            </View>
          </View>
        </View>

        {/* Net worth chart - Premium */}
        <View style={{ paddingHorizontal: 20, marginBottom: 24 }}>
          {isSubscribed ? (
            <NetWorthChart />
          ) : (
            <PremiumBanner feature={t('home.chartFeature')} />
          )}
        </View>

        {/* Card payment schedule */}
        {cardPayments.length > 0 && (
          <View style={{ paddingHorizontal: 20, marginBottom: 24 }}>
            <Text style={{ fontSize: 14, color: theme.textSecondary, marginBottom: 12 }}>{t('home.cardPaymentSchedule')}</Text>
            {cardPayments.map(({ current: payment, next: nextPayment }) => {
              const isNextExpanded = expandedNextCards[payment.cardId] || false;
              const billingStart = payment.billingPeriodStart;
              const billingEnd = payment.billingPeriodEnd;
              const billingRangeText = billingStart && billingEnd
                ? `(${new Date(billingStart).getMonth() + 1}/${new Date(billingStart).getDate()}~${new Date(billingEnd).getMonth() + 1}/${new Date(billingEnd).getDate()})`
                : '';

              return (
              <View
                key={payment.cardId}
                style={{
                  backgroundColor: theme.backgroundSecondary,
                  borderRadius: 12,
                  padding: 16,
                  marginBottom: 8,
                  borderLeftWidth: 4,
                  borderLeftColor: payment.cardColor,
                }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: theme.text }}>
                      {payment.cardName}
                    </Text>
                    <Text style={{ fontSize: 11, color: theme.textMuted, marginTop: 2 }}>
                      {t('home.paymentDay', { day: payment.paymentDay })}
                      {payment.daysUntilPayment !== null && payment.daysUntilPayment <= 7 && (
                        <Text style={{ color: theme.primary }}> (D-{payment.daysUntilPayment})</Text>
                      )}
                    </Text>
                    {billingRangeText ? (
                      <Text style={{ fontSize: 10, color: theme.textMuted, marginTop: 2 }}>
                        {t('home.billingPeriod')} {billingRangeText}
                      </Text>
                    ) : null}
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    {settings.displayUnit === 'BTC' ? (
                      <>
                        <Text style={{ fontSize: 18, fontWeight: 'bold', color: theme.error }}>
                          {formatSats(payment.totalPaymentSats)}
                        </Text>
                        <Text style={{ fontSize: 11, color: theme.textMuted }}>
                          {formatKrw(payment.totalPayment)}
                        </Text>
                      </>
                    ) : (
                      <>
                        <Text style={{ fontSize: 18, fontWeight: 'bold', color: theme.error }}>
                          {formatKrw(payment.totalPayment)}
                        </Text>
                        {payment.totalPaymentSats > 0 && (
                          <Text style={{ fontSize: 11, color: theme.textMuted }}>
                            {formatSats(payment.totalPaymentSats)}
                          </Text>
                        )}
                      </>
                    )}
                  </View>
                </View>
                <View style={{ flexDirection: 'row', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: theme.border }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 11, color: theme.textSecondary }}>{t('home.lumpSum')}</Text>
                    <Text style={{ fontSize: 13, color: theme.text }}>{formatKrw(payment.periodExpenses)}</Text>
                  </View>
                  {payment.installmentCount > 0 && (
                    <View style={{ flex: 1, alignItems: 'flex-end' }}>
                      <Text style={{ fontSize: 11, color: theme.textSecondary }}>{t('home.installment', { count: payment.installmentCount })}</Text>
                      <Text style={{ fontSize: 13, color: theme.text }}>{formatKrw(payment.installmentPayments)}</Text>
                    </View>
                  )}
                </View>

                {/* 다음 결제 accordion */}
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 12, paddingTop: 8, borderTopWidth: 1, borderTopColor: theme.border }}
                  onPress={() => toggleNextCard(payment.cardId)}
                >
                  <Text style={{ fontSize: 12, color: theme.textSecondary, marginRight: 4 }}>{t('home.nextPayment')}</Text>
                  <Ionicons name={isNextExpanded ? 'chevron-up' : 'chevron-down'} size={14} color={theme.textSecondary} />
                </TouchableOpacity>

                {isNextExpanded && (
                  <View style={{ marginTop: 8 }}>
                    {nextPayment.billingPeriodStart && nextPayment.billingPeriodEnd && (
                      <Text style={{ fontSize: 10, color: theme.textMuted, marginBottom: 4 }}>
                        {t('home.billingPeriod')} ({new Date(nextPayment.billingPeriodStart).getMonth() + 1}/{new Date(nextPayment.billingPeriodStart).getDate()}~{new Date(nextPayment.billingPeriodEnd).getMonth() + 1}/{new Date(nextPayment.billingPeriodEnd).getDate()})
                      </Text>
                    )}
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <View>
                        <Text style={{ fontSize: 11, color: theme.textSecondary }}>{t('home.lumpSum')}</Text>
                        <Text style={{ fontSize: 13, color: theme.text }}>{formatKrw(nextPayment.periodExpenses)}</Text>
                      </View>
                      {nextPayment.installmentCount > 0 && (
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={{ fontSize: 11, color: theme.textSecondary }}>{t('home.installment', { count: nextPayment.installmentCount })}</Text>
                          <Text style={{ fontSize: 13, color: theme.text }}>{formatKrw(nextPayment.installmentPayments)}</Text>
                        </View>
                      )}
                    </View>
                    <View style={{ alignItems: 'flex-end', marginTop: 4 }}>
                      <Text style={{ fontSize: 15, fontWeight: 'bold', color: theme.error }}>
                        {formatKrw(nextPayment.totalPayment)}
                      </Text>
                    </View>
                  </View>
                )}
              </View>
              );
            })}
          </View>
        )}

        {/* Quick input */}
        <View style={{ paddingHorizontal: 20, marginBottom: 24 }}>
          <Text style={{ fontSize: 14, color: theme.textSecondary, marginBottom: 12 }}>{t('home.quickInput')}</Text>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <TouchableOpacity
              style={{
                flex: 1,
                backgroundColor: theme.expenseButtonBg,
                padding: 16,
                borderRadius: 12,
                alignItems: 'center',
              }}
              onPress={() => router.push('/(modals)/add-expense')}
            >
              <Text style={{ fontSize: 24, marginBottom: 4 }}>📤</Text>
              <Text style={{ fontSize: 14, fontWeight: '500', color: theme.error }}>{t('home.addExpense')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={{
                flex: 1,
                backgroundColor: theme.incomeButtonBg,
                padding: 16,
                borderRadius: 12,
                alignItems: 'center',
              }}
              onPress={() => router.push('/(modals)/add-income')}
            >
              <Text style={{ fontSize: 24, marginBottom: 4 }}>📥</Text>
              <Text style={{ fontSize: 14, fontWeight: '500', color: theme.success }}>{t('home.addIncome')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={{
                flex: 1,
                backgroundColor: theme.backgroundSecondary,
                padding: 16,
                borderRadius: 12,
                alignItems: 'center',
              }}
              onPress={() => router.push('/(modals)/add-transfer')}
            >
              <Text style={{ fontSize: 24, marginBottom: 4 }}>🔄</Text>
              <Text style={{ fontSize: 14, fontWeight: '500', color: theme.primary }}>{t('home.transfer')}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Recent records */}
        <View style={{ paddingHorizontal: 20, marginBottom: 24 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Text style={{ fontSize: 14, color: theme.textSecondary }}>{t('home.recentRecords')}</Text>
            <TouchableOpacity onPress={() => router.push('/(tabs)/records')}>
              <Text style={{ fontSize: 12, color: theme.primary }}>{t('home.viewMore')}</Text>
            </TouchableOpacity>
          </View>

          {todayRecords.length === 0 ? (
            <View
              style={{
                backgroundColor: theme.backgroundSecondary,
                borderRadius: 12,
                padding: 32,
                alignItems: 'center',
              }}
            >
              <Text style={{ fontSize: 14, color: theme.textMuted }}>
                {t('home.noRecordsToday')}
              </Text>
            </View>
          ) : (
            todayRecords.map(record => (
              <View
                key={record.id}
                style={{
                  backgroundColor: theme.backgroundSecondary,
                  borderRadius: 8,
                  padding: 12,
                  marginBottom: 8,
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <View>
                  <Text style={{ fontSize: 14, fontWeight: '500', color: theme.text }}>
                    {record.category}
                  </Text>
                  <Text style={{ fontSize: 12, color: theme.textMuted }}>
                    {record.type === 'expense' && 'paymentMethod' in record
                      ? record.paymentMethod === 'card'
                        ? t('home.card')
                        : record.paymentMethod === 'cash'
                        ? t('home.cash')
                        : record.paymentMethod
                      : record.type === 'income' && 'source' in record && record.source
                      ? record.source
                      : ''}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  {settings.displayUnit === 'BTC' ? (
                    <>
                      <Text
                        style={{
                          fontSize: 14,
                          fontWeight: '600',
                          color: record.type === 'income' ? theme.success : theme.error,
                        }}
                      >
                        {record.type === 'income' ? '+' : '-'}
                        {formatSats(record.satsEquivalent || 0)}
                      </Text>
                      <Text style={{ fontSize: 11, color: theme.textMuted }}>
                        {formatKrw(getKrwAmount(record))}
                      </Text>
                    </>
                  ) : (
                    <>
                      <Text
                        style={{
                          fontSize: 14,
                          fontWeight: '600',
                          color: record.type === 'income' ? theme.success : theme.error,
                        }}
                      >
                        {record.type === 'income' ? '+' : '-'}
                        {formatKrw(getKrwAmount(record))}
                      </Text>
                      {record.satsEquivalent && (
                        <Text style={{ fontSize: 11, color: theme.textMuted }}>
                          {formatSats(record.satsEquivalent)}
                        </Text>
                      )}
                    </>
                  )}
                </View>
              </View>
            ))
          )}
        </View>

        {/* BTC price */}
        {btcKrw && (
          <View style={{ paddingHorizontal: 20, marginBottom: 24 }}>
            <View
              style={{
                backgroundColor: isOffline ? theme.offlineBannerBg : theme.priceBannerBg,
                borderRadius: 12,
                padding: 16,
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <View>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={{ fontSize: 12, color: isOffline ? theme.offlineBannerText : theme.priceBannerText }}>
                    BTC/KRW
                  </Text>
                  {isOffline && (
                    <View
                      style={{
                        backgroundColor: theme.error,
                        borderRadius: 4,
                        paddingHorizontal: 6,
                        paddingVertical: 2,
                        marginLeft: 8,
                      }}
                    >
                      <Text style={{ fontSize: 10, color: theme.textInverse, fontWeight: '600' }}>
                        {t('common.offline')}
                      </Text>
                    </View>
                  )}
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                  <Text style={{ fontSize: 18, fontWeight: 'bold', color: theme.primary }}>
                    {formatKrw(btcKrw)}
                  </Text>
                  {kimchiPremium !== null && (
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: '600',
                        color: kimchiPremium >= 0 ? theme.success : theme.error,
                        marginLeft: 8,
                      }}
                    >
                      (P{kimchiPremium >= 0 ? '+' : ''}{kimchiPremium.toFixed(1)}%)
                    </Text>
                  )}
                </View>
                {lastUpdated && (
                  <Text style={{ fontSize: 11, color: isOffline ? theme.offlineBannerText : theme.priceBannerText, marginTop: 2 }}>
                    {new Date(lastUpdated).toLocaleString('ko-KR', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                )}
              </View>
              <Ionicons name="logo-bitcoin" size={32} color={theme.primary} />
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
