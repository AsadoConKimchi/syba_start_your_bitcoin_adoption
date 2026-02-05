import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { useState, useCallback, useMemo } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useLedgerStore } from '../../src/stores/ledgerStore';
import { usePriceStore } from '../../src/stores/priceStore';
import { useSettingsStore } from '../../src/stores/settingsStore';
import { useCardStore } from '../../src/stores/cardStore';
import { useDebtStore } from '../../src/stores/debtStore';
import { useSubscriptionStore } from '../../src/stores/subscriptionStore';
import { formatKrw, formatSats, formatDateWithDay, getTodayString } from '../../src/utils/formatters';
import { krwToSats } from '../../src/utils/calculations';
import { calculateAllCardsPayment } from '../../src/utils/cardPaymentCalculator';
import { NetWorthChart } from '../../src/components/charts';
import { PremiumBanner } from '../../src/components/PremiumGate';

export default function HomeScreen() {
  const [refreshing, setRefreshing] = useState(false);

  const { records, getMonthlyTotal, getTodayTotal, loadRecords } = useLedgerStore();
  const { btcKrw, fetchPrices, lastUpdated, isOffline, kimchiPremium } = usePriceStore();
  const { settings } = useSettingsStore();
  const { cards } = useCardStore();
  const { installments } = useDebtStore();
  const { isSubscribed } = useSubscriptionStore();

  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth() + 1;

  // 카드별 결제 예정액 계산
  const cardPayments = useMemo(() => {
    return calculateAllCardsPayment(cards, records, installments)
      .filter((p) => p.totalPayment > 0)
      .sort((a, b) => (a.daysUntilPayment || 999) - (b.daysUntilPayment || 999));
  }, [cards, records, installments]);

  const todayTotal = getTodayTotal();
  const monthlyTotal = getMonthlyTotal(year, month);

  // 오늘 sats 환산
  const todayExpenseSats = btcKrw ? krwToSats(todayTotal.expense, btcKrw) : 0;
  const todayIncomeSats = btcKrw ? krwToSats(todayTotal.income, btcKrw) : 0;

  // 순 저축
  const netSaving = monthlyTotal.income - monthlyTotal.expense;
  const netSavingSats = monthlyTotal.incomeSats - monthlyTotal.expenseSats;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadRecords(), fetchPrices()]);
    setRefreshing(false);
  }, []);

  // 최근 기록 (오늘)
  const todayRecords = records
    .filter(r => r.date === getTodayString())
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <ScrollView
        style={{ flex: 1 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#F7931A" />
        }
      >
        {/* 헤더 */}
        <View style={{ padding: 20 }}>
          <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#1A1A1A' }}>
            안녕하세요{settings.userName ? `, ${settings.userName}님` : ''} 👋
          </Text>
          <Text style={{ fontSize: 14, color: '#666666', marginTop: 4 }}>
            {formatDateWithDay(getTodayString())}
          </Text>
        </View>

        {/* 오늘 요약 */}
        <View style={{ paddingHorizontal: 20, marginBottom: 24 }}>
          <Text style={{ fontSize: 14, color: '#666666', marginBottom: 12 }}>오늘</Text>
          <View style={{ flexDirection: 'row' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, color: '#666666' }}>수입</Text>
              {settings.displayUnit === 'BTC' ? (
                <>
                  <Text style={{ fontSize: 20, fontWeight: '600', color: '#22C55E' }}>
                    {formatSats(todayIncomeSats)}
                  </Text>
                  <Text style={{ fontSize: 12, color: '#9CA3AF' }}>
                    {formatKrw(todayTotal.income)}
                  </Text>
                </>
              ) : (
                <>
                  <Text style={{ fontSize: 20, fontWeight: '600', color: '#22C55E' }}>
                    {formatKrw(todayTotal.income)}
                  </Text>
                  <Text style={{ fontSize: 12, color: '#9CA3AF' }}>
                    {formatSats(todayIncomeSats)}
                  </Text>
                </>
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, color: '#666666' }}>지출</Text>
              {settings.displayUnit === 'BTC' ? (
                <>
                  <Text style={{ fontSize: 20, fontWeight: '600', color: '#EF4444' }}>
                    {formatSats(todayExpenseSats)}
                  </Text>
                  <Text style={{ fontSize: 12, color: '#9CA3AF' }}>
                    {formatKrw(todayTotal.expense)}
                  </Text>
                </>
              ) : (
                <>
                  <Text style={{ fontSize: 20, fontWeight: '600', color: '#EF4444' }}>
                    {formatKrw(todayTotal.expense)}
                  </Text>
                  <Text style={{ fontSize: 12, color: '#9CA3AF' }}>
                    {formatSats(todayExpenseSats)}
                  </Text>
                </>
              )}
            </View>
          </View>
        </View>

        {/* 월간 현황 */}
        <View style={{ paddingHorizontal: 20, marginBottom: 24 }}>
          <Text style={{ fontSize: 14, color: '#666666', marginBottom: 12 }}>
            {month}월 현황
          </Text>
          <View
            style={{
              backgroundColor: '#F9FAFB',
              borderRadius: 12,
              padding: 16,
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
              <View>
                <Text style={{ fontSize: 12, color: '#666666' }}>수입</Text>
                {settings.displayUnit === 'BTC' ? (
                  <>
                    <Text style={{ fontSize: 18, fontWeight: '600', color: '#22C55E' }}>
                      {formatSats(monthlyTotal.incomeSats)}
                    </Text>
                    <Text style={{ fontSize: 11, color: '#9CA3AF' }}>
                      {formatKrw(monthlyTotal.income)}
                    </Text>
                  </>
                ) : (
                  <>
                    <Text style={{ fontSize: 18, fontWeight: '600', color: '#22C55E' }}>
                      {formatKrw(monthlyTotal.income)}
                    </Text>
                    <Text style={{ fontSize: 11, color: '#9CA3AF' }}>
                      {formatSats(monthlyTotal.incomeSats)}
                    </Text>
                  </>
                )}
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontSize: 12, color: '#666666' }}>지출</Text>
                {settings.displayUnit === 'BTC' ? (
                  <>
                    <Text style={{ fontSize: 18, fontWeight: '600', color: '#EF4444' }}>
                      {formatSats(monthlyTotal.expenseSats)}
                    </Text>
                    <Text style={{ fontSize: 11, color: '#9CA3AF' }}>
                      {formatKrw(monthlyTotal.expense)}
                    </Text>
                  </>
                ) : (
                  <>
                    <Text style={{ fontSize: 18, fontWeight: '600', color: '#EF4444' }}>
                      {formatKrw(monthlyTotal.expense)}
                    </Text>
                    <Text style={{ fontSize: 11, color: '#9CA3AF' }}>
                      {formatSats(monthlyTotal.expenseSats)}
                    </Text>
                  </>
                )}
              </View>
            </View>

            <View
              style={{
                borderTopWidth: 1,
                borderTopColor: '#E5E7EB',
                paddingTop: 16,
              }}
            >
              <Text style={{ fontSize: 12, color: '#666666' }}>순 저축</Text>
              {settings.displayUnit === 'BTC' ? (
                <>
                  <Text
                    style={{
                      fontSize: 24,
                      fontWeight: 'bold',
                      color: netSavingSats >= 0 ? '#22C55E' : '#EF4444',
                    }}
                  >
                    {formatSats(Math.abs(netSavingSats))} {netSavingSats >= 0 ? '✨' : ''}
                  </Text>
                  <Text style={{ fontSize: 12, color: '#9CA3AF' }}>
                    {formatKrw(netSaving)}
                  </Text>
                </>
              ) : (
                <>
                  <Text
                    style={{
                      fontSize: 24,
                      fontWeight: 'bold',
                      color: netSaving >= 0 ? '#22C55E' : '#EF4444',
                    }}
                  >
                    {formatKrw(netSaving)}
                  </Text>
                  <Text style={{ fontSize: 12, color: '#9CA3AF' }}>
                    {formatSats(Math.abs(netSavingSats))} {netSavingSats >= 0 ? '✨' : ''}
                  </Text>
                </>
              )}
            </View>
          </View>
        </View>

        {/* 자산 흐름 차트 - 프리미엄 기능 */}
        <View style={{ paddingHorizontal: 20, marginBottom: 24 }}>
          {isSubscribed ? (
            <NetWorthChart />
          ) : (
            <PremiumBanner feature="수입/지출 흐름 차트" />
          )}
        </View>

        {/* 카드 결제 예정액 */}
        {cardPayments.length > 0 && (
          <View style={{ paddingHorizontal: 20, marginBottom: 24 }}>
            <Text style={{ fontSize: 14, color: '#666666', marginBottom: 12 }}>카드 결제 예정</Text>
            {cardPayments.map((payment) => (
              <View
                key={payment.cardId}
                style={{
                  backgroundColor: '#F9FAFB',
                  borderRadius: 12,
                  padding: 16,
                  marginBottom: 8,
                  borderLeftWidth: 4,
                  borderLeftColor: payment.cardColor,
                }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: '#1A1A1A' }}>
                      {payment.cardName}
                    </Text>
                    <Text style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>
                      {payment.paymentDay}일 결제
                      {payment.daysUntilPayment !== null && payment.daysUntilPayment <= 7 && (
                        <Text style={{ color: '#F7931A' }}> (D-{payment.daysUntilPayment})</Text>
                      )}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    {settings.displayUnit === 'BTC' ? (
                      <>
                        <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#EF4444' }}>
                          {formatSats(payment.totalPaymentSats)}
                        </Text>
                        <Text style={{ fontSize: 11, color: '#9CA3AF' }}>
                          {formatKrw(payment.totalPayment)}
                        </Text>
                      </>
                    ) : (
                      <>
                        <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#EF4444' }}>
                          {formatKrw(payment.totalPayment)}
                        </Text>
                        {payment.totalPaymentSats > 0 && (
                          <Text style={{ fontSize: 11, color: '#9CA3AF' }}>
                            {formatSats(payment.totalPaymentSats)}
                          </Text>
                        )}
                      </>
                    )}
                  </View>
                </View>
                {/* 상세 내역 */}
                <View style={{ flexDirection: 'row', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#E5E7EB' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 11, color: '#666666' }}>일시불</Text>
                    <Text style={{ fontSize: 13, color: '#1A1A1A' }}>{formatKrw(payment.periodExpenses)}</Text>
                  </View>
                  {payment.installmentCount > 0 && (
                    <View style={{ flex: 1, alignItems: 'flex-end' }}>
                      <Text style={{ fontSize: 11, color: '#666666' }}>할부 ({payment.installmentCount}건)</Text>
                      <Text style={{ fontSize: 13, color: '#1A1A1A' }}>{formatKrw(payment.installmentPayments)}</Text>
                    </View>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}

        {/* 빠른 입력 */}
        <View style={{ paddingHorizontal: 20, marginBottom: 24 }}>
          <Text style={{ fontSize: 14, color: '#666666', marginBottom: 12 }}>빠른 입력</Text>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <TouchableOpacity
              style={{
                flex: 1,
                backgroundColor: '#FEF2F2',
                padding: 16,
                borderRadius: 12,
                alignItems: 'center',
              }}
              onPress={() => router.push('/(modals)/add-expense')}
            >
              <Text style={{ fontSize: 24, marginBottom: 4 }}>📤</Text>
              <Text style={{ fontSize: 14, fontWeight: '500', color: '#EF4444' }}>+ 지출</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={{
                flex: 1,
                backgroundColor: '#F0FDF4',
                padding: 16,
                borderRadius: 12,
                alignItems: 'center',
              }}
              onPress={() => router.push('/(modals)/add-income')}
            >
              <Text style={{ fontSize: 24, marginBottom: 4 }}>📥</Text>
              <Text style={{ fontSize: 14, fontWeight: '500', color: '#22C55E' }}>+ 수입</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 최근 기록 */}
        <View style={{ paddingHorizontal: 20, marginBottom: 32 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Text style={{ fontSize: 14, color: '#666666' }}>최근 기록</Text>
            <TouchableOpacity onPress={() => router.push('/(tabs)/records')}>
              <Text style={{ fontSize: 12, color: '#F7931A' }}>더보기 →</Text>
            </TouchableOpacity>
          </View>

          {todayRecords.length === 0 ? (
            <View
              style={{
                backgroundColor: '#F9FAFB',
                borderRadius: 12,
                padding: 32,
                alignItems: 'center',
              }}
            >
              <Text style={{ fontSize: 14, color: '#9CA3AF' }}>
                오늘 기록이 없습니다
              </Text>
            </View>
          ) : (
            todayRecords.map(record => (
              <View
                key={record.id}
                style={{
                  backgroundColor: '#F9FAFB',
                  borderRadius: 8,
                  padding: 12,
                  marginBottom: 8,
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <View>
                  <Text style={{ fontSize: 14, fontWeight: '500', color: '#1A1A1A' }}>
                    {record.category}
                  </Text>
                  <Text style={{ fontSize: 12, color: '#9CA3AF' }}>
                    {record.type === 'expense' && 'paymentMethod' in record
                      ? record.paymentMethod === 'card'
                        ? '카드'
                        : record.paymentMethod === 'cash'
                        ? '현금'
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
                          color: record.type === 'income' ? '#22C55E' : '#EF4444',
                        }}
                      >
                        {record.type === 'income' ? '+' : '-'}
                        {formatSats(record.satsEquivalent || 0)}
                      </Text>
                      <Text style={{ fontSize: 11, color: '#9CA3AF' }}>
                        {formatKrw(record.amount)}
                      </Text>
                    </>
                  ) : (
                    <>
                      <Text
                        style={{
                          fontSize: 14,
                          fontWeight: '600',
                          color: record.type === 'income' ? '#22C55E' : '#EF4444',
                        }}
                      >
                        {record.type === 'income' ? '+' : '-'}
                        {formatKrw(record.amount)}
                      </Text>
                      {record.satsEquivalent && (
                        <Text style={{ fontSize: 11, color: '#9CA3AF' }}>
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

        {/* BTC 시세 */}
        {btcKrw && (
          <View style={{ paddingHorizontal: 20, marginBottom: 32 }}>
            <View
              style={{
                backgroundColor: isOffline ? '#FEE2E2' : '#FEF3C7',
                borderRadius: 12,
                padding: 16,
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <View>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={{ fontSize: 12, color: isOffline ? '#991B1B' : '#92400E' }}>
                    BTC/KRW
                  </Text>
                  {isOffline && (
                    <View
                      style={{
                        backgroundColor: '#EF4444',
                        borderRadius: 4,
                        paddingHorizontal: 6,
                        paddingVertical: 2,
                        marginLeft: 8,
                      }}
                    >
                      <Text style={{ fontSize: 10, color: '#FFFFFF', fontWeight: '600' }}>
                        오프라인
                      </Text>
                    </View>
                  )}
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                  <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#F7931A' }}>
                    {formatKrw(btcKrw)}
                  </Text>
                  {kimchiPremium !== null && (
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: '600',
                        color: kimchiPremium >= 0 ? '#22C55E' : '#EF4444',
                        marginLeft: 8,
                      }}
                    >
                      (P{kimchiPremium >= 0 ? '+' : ''}{kimchiPremium.toFixed(1)}%)
                    </Text>
                  )}
                </View>
                {lastUpdated && (
                  <Text style={{ fontSize: 11, color: isOffline ? '#991B1B' : '#92400E', marginTop: 2 }}>
                    {new Date(lastUpdated).toLocaleString('ko-KR', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                )}
              </View>
              <Ionicons name="logo-bitcoin" size={32} color="#F7931A" />
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
