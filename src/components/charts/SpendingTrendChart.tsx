import { View, Text, Dimensions, TouchableOpacity } from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import { useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useLedgerStore } from '../../stores/ledgerStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { formatKrw, formatSats } from '../../utils/formatters';
import { ChartEmptyState } from './ChartEmptyState';

const screenWidth = Dimensions.get('window').width;

type DisplayMode = 'KRW' | 'BTC';

export function SpendingTrendChart() {
  const { t } = useTranslation();
  const { getMultiMonthTotals } = useLedgerStore();
  const { settings } = useSettingsStore();
  const [isExpanded, setIsExpanded] = useState(false);
  const [displayMode, setDisplayMode] = useState<DisplayMode>(settings.displayUnit);

  // Filter months with data (max 6 months)
  const monthlyData = useMemo(() => {
    const allMonths = getMultiMonthTotals(6);
    return allMonths.filter(m => m.expense > 0 || m.expenseSats > 0);
  }, [getMultiMonthTotals]);

  const hasData = monthlyData.length > 0;

  // Toggle header
  const header = (
    <TouchableOpacity
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        backgroundColor: '#F9FAFB',
        borderRadius: isExpanded ? 0 : 12,
        borderTopLeftRadius: 12,
        borderTopRightRadius: 12,
      }}
      onPress={() => setIsExpanded(!isExpanded)}
    >
      <Text style={{ fontSize: 14, fontWeight: '600', color: '#1A1A1A' }}>
        {t('charts.monthlySpendingFlow')} {monthlyData.length > 1 ? `(${t('charts.recentMonths', { count: monthlyData.length })})` : ''}
      </Text>
      <Ionicons
        name={isExpanded ? 'chevron-up' : 'chevron-down'}
        size={20}
        color="#666666"
      />
    </TouchableOpacity>
  );

  if (!isExpanded) {
    return <View style={{ backgroundColor: '#F9FAFB', borderRadius: 12 }}>{header}</View>;
  }

  if (!hasData) {
    return (
      <View style={{ backgroundColor: '#F9FAFB', borderRadius: 12 }}>
        {header}
        <View style={{ padding: 16, paddingTop: 0 }}>
          <ChartEmptyState
            message={t('charts.noSpending')}
            icon="📉"
          />
        </View>
      </View>
    );
  }

  const labels = monthlyData.map(m => m.month);

  // Data based on display mode
  const getExpenseValue = (m: typeof monthlyData[0]) => {
    if (displayMode === 'KRW') {
      return m.expense / 10000;
    } else {
      return m.expenseSats / 1000;
    }
  };

  const expenses = monthlyData.map(m => getExpenseValue(m) || 0.1);

  const lineData = {
    labels,
    datasets: [
      {
        data: expenses,
        color: () => '#EF4444',
        strokeWidth: 2,
      },
    ],
  };

  const chartConfig = {
    backgroundColor: '#FFFFFF',
    backgroundGradientFrom: '#FFFFFF',
    backgroundGradientTo: '#FFFFFF',
    decimalPlaces: 0,
    color: (opacity = 1) => `rgba(239, 68, 68, ${opacity})`,
    labelColor: () => '#666666',
    propsForBackgroundLines: {
      strokeDasharray: '',
      stroke: '#E5E7EB',
    },
    propsForDots: {
      r: '4',
      strokeWidth: '2',
      stroke: '#EF4444',
    },
  };

  // Trend calculation (recent half vs previous half)
  const halfIndex = Math.floor(monthlyData.length / 2);
  const canShowTrend = monthlyData.length >= 2;
  const recentHalf = monthlyData.slice(halfIndex);
  const prevHalf = monthlyData.slice(0, halfIndex || 1);
  const recentAvg = displayMode === 'KRW'
    ? recentHalf.reduce((sum, m) => sum + m.expense, 0) / recentHalf.length
    : recentHalf.reduce((sum, m) => sum + m.expenseSats, 0) / recentHalf.length;
  const prevAvg = displayMode === 'KRW'
    ? prevHalf.reduce((sum, m) => sum + m.expense, 0) / prevHalf.length
    : prevHalf.reduce((sum, m) => sum + m.expenseSats, 0) / prevHalf.length;
  const trendPercent = canShowTrend && prevAvg > 0 ? ((recentAvg - prevAvg) / prevAvg) * 100 : 0;

  // Max/min spending month
  const getExpenseForComparison = (m: typeof monthlyData[0]) =>
    displayMode === 'KRW' ? m.expense : m.expenseSats;

  const expenseValues = monthlyData.map(m => getExpenseForComparison(m));
  const maxExpense = Math.max(...expenseValues);
  const minExpense = Math.min(...expenseValues.filter(v => v > 0));
  const maxMonth = monthlyData.find(m => getExpenseForComparison(m) === maxExpense);
  const minMonth = monthlyData.find(m => getExpenseForComparison(m) === minExpense);

  const unit = displayMode === 'KRW' ? t('charts.tenThousandWon') : `sats (K)`;

  return (
    <View style={{ backgroundColor: '#F9FAFB', borderRadius: 12 }}>
      {header}

      <View style={{ padding: 16, paddingTop: 0 }}>
        {/* BTC/KRW toggle */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <Text style={{ fontSize: 11, color: '#9CA3AF' }}>{unit}</Text>
          <View style={{ flexDirection: 'row', backgroundColor: '#E5E7EB', borderRadius: 8, padding: 2 }}>
            <TouchableOpacity
              style={{
                paddingHorizontal: 12,
                paddingVertical: 4,
                borderRadius: 6,
                backgroundColor: displayMode === 'BTC' ? '#F7931A' : 'transparent',
              }}
              onPress={() => setDisplayMode('BTC')}
            >
              <Text style={{ fontSize: 12, fontWeight: '500', color: displayMode === 'BTC' ? '#FFFFFF' : '#9CA3AF' }}>
                BTC
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{
                paddingHorizontal: 12,
                paddingVertical: 4,
                borderRadius: 6,
                backgroundColor: displayMode === 'KRW' ? '#FFFFFF' : 'transparent',
              }}
              onPress={() => setDisplayMode('KRW')}
            >
              <Text style={{ fontSize: 12, fontWeight: '500', color: displayMode === 'KRW' ? '#1A1A1A' : '#9CA3AF' }}>
                KRW
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Line chart */}
        <View style={{ marginLeft: -16, marginBottom: 16 }}>
          <LineChart
            data={lineData}
            width={screenWidth - 40}
            height={160}
            yAxisLabel=""
            yAxisSuffix=""
            chartConfig={chartConfig}
            bezier
            fromZero
            withDots
            withShadow={false}
            style={{ borderRadius: 8 }}
            formatYLabel={(value) => Number(value).toLocaleString('ko-KR')}
          />
        </View>

        {/* Stats summary */}
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            paddingTop: 12,
            borderTopWidth: 1,
            borderTopColor: '#E5E7EB',
          }}
        >
          {/* Trend (shown only when 2+ months) */}
          {canShowTrend ? (
            <View>
              <Text style={{ fontSize: 11, color: '#9CA3AF' }}>{t('charts.spendingTrend')}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons
                  name={trendPercent > 0 ? 'trending-up' : trendPercent < 0 ? 'trending-down' : 'remove'}
                  size={16}
                  color={trendPercent > 0 ? '#EF4444' : trendPercent < 0 ? '#22C55E' : '#9CA3AF'}
                />
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: '600',
                    color: trendPercent > 0 ? '#EF4444' : trendPercent < 0 ? '#22C55E' : '#9CA3AF',
                    marginLeft: 4,
                  }}
                >
                  {trendPercent > 0 ? '+' : ''}{trendPercent.toFixed(1)}%
                </Text>
              </View>
            </View>
          ) : (
            <View>
              <Text style={{ fontSize: 11, color: '#9CA3AF' }}>{t('charts.spendingTrend')}</Text>
              <Text style={{ fontSize: 12, color: '#9CA3AF' }}>{t('charts.collectingData')}</Text>
            </View>
          )}

          {/* Highest spending */}
          {maxMonth && maxExpense > 0 && (
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontSize: 11, color: '#9CA3AF' }}>{t('charts.highest')}</Text>
              <Text style={{ fontSize: 12, fontWeight: '500', color: '#EF4444' }}>
                {maxMonth.month}
              </Text>
              <Text style={{ fontSize: 11, color: '#666666' }}>
                {displayMode === 'KRW' ? formatKrw(maxExpense) : formatSats(maxExpense)}
              </Text>
            </View>
          )}

          {/* Lowest spending */}
          {minMonth && minExpense > 0 && (
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ fontSize: 11, color: '#9CA3AF' }}>{t('charts.lowest')}</Text>
              <Text style={{ fontSize: 12, fontWeight: '500', color: '#22C55E' }}>
                {minMonth.month}
              </Text>
              <Text style={{ fontSize: 11, color: '#666666' }}>
                {displayMode === 'KRW' ? formatKrw(minExpense) : formatSats(minExpense)}
              </Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}
