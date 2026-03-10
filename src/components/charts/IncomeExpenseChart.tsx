import { View, Text, Dimensions, TouchableOpacity } from 'react-native';
import { BarChart, LineChart } from 'react-native-chart-kit';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLedgerStore } from '../../stores/ledgerStore';
import { formatKrw } from '../../utils/formatters';
import { ChartEmptyState } from './ChartEmptyState';
import { useTheme } from '../../hooks/useTheme';

const screenWidth = Dimensions.get('window').width;

export function IncomeExpenseChart() {
  const { t } = useTranslation();
  const { getMultiMonthTotals } = useLedgerStore();
  const { theme, isDark } = useTheme();
  const [showIncome, setShowIncome] = useState(true);
  const [showExpense, setShowExpense] = useState(true);

  const chartConfig = {
    backgroundColor: theme.chartBackground,
    backgroundGradientFrom: theme.chartBackground,
    backgroundGradientTo: theme.chartBackground,
    decimalPlaces: 0,
    color: (opacity = 1) => isDark ? `rgba(96, 165, 250, ${opacity})` : `rgba(59, 130, 246, ${opacity})`,
    labelColor: () => theme.chartLabelColor,
    propsForBackgroundLines: {
      strokeDasharray: '',
      stroke: theme.chartGridLine,
    },
    barPercentage: 0.5,
  };

  // Filter months with data (max 6 months)
  const monthlyData = useMemo(() => {
    const allMonths = getMultiMonthTotals(6);
    return allMonths.filter(m => m.income > 0 || m.expense > 0);
  }, [getMultiMonthTotals]);

  if (monthlyData.length === 0) {
    return (
      <ChartEmptyState
        message={t('charts.noRecords')}
        icon="📈"
      />
    );
  }

  const labels = monthlyData.map(m => m.month);

  // Bar chart data (income/expense side by side)
  const barData = {
    labels,
    datasets: [
      ...(showIncome
        ? [
            {
              data: monthlyData.map(m => m.income / 10000),
              color: () => theme.success,
            },
          ]
        : []),
      ...(showExpense
        ? [
            {
              data: monthlyData.map(m => m.expense / 10000),
              color: () => theme.error,
            },
          ]
        : []),
    ],
    legend: [],
  };

  // Line chart data
  const lineData = {
    labels,
    datasets: [
      ...(showIncome
        ? [
            {
              data: monthlyData.map(m => m.income / 10000 || 0),
              color: () => theme.success,
              strokeWidth: 2,
            },
          ]
        : []),
      ...(showExpense
        ? [
            {
              data: monthlyData.map(m => m.expense / 10000 || 0),
              color: () => theme.error,
              strokeWidth: 2,
            },
          ]
        : []),
    ],
  };

  // Average calculation (based on months with data)
  const avgIncome = monthlyData.reduce((sum, m) => sum + m.income, 0) / monthlyData.length;
  const avgExpense = monthlyData.reduce((sum, m) => sum + m.expense, 0) / monthlyData.length;

  return (
    <View
      style={{
        backgroundColor: theme.backgroundSecondary,
        borderRadius: 12,
        padding: 16,
      }}
    >
      <Text style={{ fontSize: 14, fontWeight: '600', color: theme.text, marginBottom: 8 }}>
        {t('charts.incomeVsExpense')} {monthlyData.length > 1 ? `(${t('charts.recentMonths', { count: monthlyData.length })})` : ''}
      </Text>

      {/* Toggle buttons */}
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
        <TouchableOpacity
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: 16,
            backgroundColor: showIncome ? (isDark ? '#15372D' : '#DCFCE7') : theme.backgroundTertiary,
          }}
          onPress={() => setShowIncome(!showIncome)}
        >
          <View
            style={{
              width: 10,
              height: 10,
              borderRadius: 5,
              backgroundColor: theme.success,
              marginRight: 6,
              opacity: showIncome ? 1 : 0.3,
            }}
          />
          <Text
            style={{
              fontSize: 12,
              color: showIncome ? theme.success : theme.textMuted,
              fontWeight: '500',
            }}
          >
            {t('charts.income')}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: 16,
            backgroundColor: showExpense ? theme.expenseButtonBg : theme.backgroundTertiary,
          }}
          onPress={() => setShowExpense(!showExpense)}
        >
          <View
            style={{
              width: 10,
              height: 10,
              borderRadius: 5,
              backgroundColor: theme.error,
              marginRight: 6,
              opacity: showExpense ? 1 : 0.3,
            }}
          />
          <Text
            style={{
              fontSize: 12,
              color: showExpense ? theme.error : theme.textMuted,
              fontWeight: '500',
            }}
          >
            {t('charts.expense')}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Bar chart */}
      {(showIncome || showExpense) && (
        <View style={{ marginLeft: -16 }}>
          <BarChart
            data={barData}
            width={screenWidth - 40}
            height={180}
            yAxisLabel=""
            yAxisSuffix=""
            chartConfig={{
              ...chartConfig,
              color: (opacity = 1, index) => {
                if (!showIncome) return isDark ? `rgba(248, 113, 113, ${opacity})` : `rgba(239, 68, 68, ${opacity})`;
                if (!showExpense) return isDark ? `rgba(74, 222, 128, ${opacity})` : `rgba(34, 197, 94, ${opacity})`;
                return index === 0
                  ? (isDark ? `rgba(74, 222, 128, ${opacity})` : `rgba(34, 197, 94, ${opacity})`)
                  : (isDark ? `rgba(248, 113, 113, ${opacity})` : `rgba(239, 68, 68, ${opacity})`);
              },
            }}
            fromZero
            showValuesOnTopOfBars={false}
            withInnerLines={true}
            style={{ borderRadius: 8 }}
          />
        </View>
      )}

      {/* Line chart (overlay) */}
      {(showIncome || showExpense) && lineData.datasets.length > 0 && (
        <View style={{ marginTop: 16, marginLeft: -16 }}>
          <LineChart
            data={lineData}
            width={screenWidth - 40}
            height={140}
            yAxisLabel=""
            yAxisSuffix=""
            chartConfig={{
              ...chartConfig,
              color: () => theme.textSecondary,
            }}
            bezier
            fromZero
            withDots
            withShadow={false}
            style={{ borderRadius: 8 }}
          />
        </View>
      )}

      {/* Average display */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          marginTop: 16,
          paddingTop: 12,
          borderTopWidth: 1,
          borderTopColor: theme.border,
        }}
      >
        <View>
          <Text style={{ fontSize: 11, color: theme.textMuted }}>{t('charts.monthlyAvgIncome')}</Text>
          <Text style={{ fontSize: 14, fontWeight: '600', color: theme.success }}>
            {formatKrw(Math.round(avgIncome))}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ fontSize: 11, color: theme.textMuted }}>{t('charts.monthlyAvgExpense')}</Text>
          <Text style={{ fontSize: 14, fontWeight: '600', color: theme.error }}>
            {formatKrw(Math.round(avgExpense))}
          </Text>
        </View>
      </View>
    </View>
  );
}
