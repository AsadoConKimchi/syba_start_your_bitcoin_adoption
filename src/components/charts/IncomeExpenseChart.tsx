import { View, Text, Dimensions, TouchableOpacity } from 'react-native';
import { BarChart, LineChart } from 'react-native-chart-kit';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLedgerStore } from '../../stores/ledgerStore';
import { formatKrw } from '../../utils/formatters';
import { ChartEmptyState } from './ChartEmptyState';

const screenWidth = Dimensions.get('window').width;

const chartConfig = {
  backgroundColor: '#FFFFFF',
  backgroundGradientFrom: '#FFFFFF',
  backgroundGradientTo: '#FFFFFF',
  decimalPlaces: 0,
  color: (opacity = 1) => `rgba(59, 130, 246, ${opacity})`,
  labelColor: () => '#666666',
  propsForBackgroundLines: {
    strokeDasharray: '',
    stroke: '#E5E7EB',
  },
  barPercentage: 0.5,
};

export function IncomeExpenseChart() {
  const { t } = useTranslation();
  const { getMultiMonthTotals } = useLedgerStore();
  const [showIncome, setShowIncome] = useState(true);
  const [showExpense, setShowExpense] = useState(true);

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
              color: () => '#22C55E',
            },
          ]
        : []),
      ...(showExpense
        ? [
            {
              data: monthlyData.map(m => m.expense / 10000),
              color: () => '#EF4444',
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
              color: () => '#22C55E',
              strokeWidth: 2,
            },
          ]
        : []),
      ...(showExpense
        ? [
            {
              data: monthlyData.map(m => m.expense / 10000 || 0),
              color: () => '#EF4444',
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
        backgroundColor: '#F9FAFB',
        borderRadius: 12,
        padding: 16,
      }}
    >
      <Text style={{ fontSize: 14, fontWeight: '600', color: '#1A1A1A', marginBottom: 8 }}>
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
            backgroundColor: showIncome ? '#DCFCE7' : '#F3F4F6',
          }}
          onPress={() => setShowIncome(!showIncome)}
        >
          <View
            style={{
              width: 10,
              height: 10,
              borderRadius: 5,
              backgroundColor: '#22C55E',
              marginRight: 6,
              opacity: showIncome ? 1 : 0.3,
            }}
          />
          <Text
            style={{
              fontSize: 12,
              color: showIncome ? '#22C55E' : '#9CA3AF',
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
            backgroundColor: showExpense ? '#FEE2E2' : '#F3F4F6',
          }}
          onPress={() => setShowExpense(!showExpense)}
        >
          <View
            style={{
              width: 10,
              height: 10,
              borderRadius: 5,
              backgroundColor: '#EF4444',
              marginRight: 6,
              opacity: showExpense ? 1 : 0.3,
            }}
          />
          <Text
            style={{
              fontSize: 12,
              color: showExpense ? '#EF4444' : '#9CA3AF',
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
                if (!showIncome) return `rgba(239, 68, 68, ${opacity})`;
                if (!showExpense) return `rgba(34, 197, 94, ${opacity})`;
                return index === 0
                  ? `rgba(34, 197, 94, ${opacity})`
                  : `rgba(239, 68, 68, ${opacity})`;
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
              color: () => '#666666',
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
          borderTopColor: '#E5E7EB',
        }}
      >
        <View>
          <Text style={{ fontSize: 11, color: '#9CA3AF' }}>{t('charts.monthlyAvgIncome')}</Text>
          <Text style={{ fontSize: 14, fontWeight: '600', color: '#22C55E' }}>
            {formatKrw(Math.round(avgIncome))}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ fontSize: 11, color: '#9CA3AF' }}>{t('charts.monthlyAvgExpense')}</Text>
          <Text style={{ fontSize: 14, fontWeight: '600', color: '#EF4444' }}>
            {formatKrw(Math.round(avgExpense))}
          </Text>
        </View>
      </View>
    </View>
  );
}
