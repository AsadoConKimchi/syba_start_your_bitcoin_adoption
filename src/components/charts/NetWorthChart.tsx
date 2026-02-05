import { View, Text, Dimensions, TouchableOpacity } from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import { useMemo, useState } from 'react';
import { useSnapshotStore } from '../../stores/snapshotStore';
import { usePriceStore } from '../../stores/priceStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { formatKrw, formatSats } from '../../utils/formatters';
import { ChartEmptyState } from './ChartEmptyState';

const screenWidth = Dimensions.get('window').width;

type DisplayMode = 'KRW' | 'BTC';

export function NetWorthChart() {
  const { snapshots } = useSnapshotStore();
  const { btcKrw } = usePriceStore();
  const { settings } = useSettingsStore();

  const [showAssets, setShowAssets] = useState(true);
  const [showDebts, setShowDebts] = useState(true);
  const [showNetWorth, setShowNetWorth] = useState(true);
  const [displayMode, setDisplayMode] = useState<DisplayMode>(settings.displayUnit);

  // 최근 6개월 스냅샷 (오래된 순 정렬)
  const recentSnapshots = useMemo(() => {
    return [...snapshots]
      .sort((a, b) => a.yearMonth.localeCompare(b.yearMonth))
      .slice(-6);
  }, [snapshots]);

  const hasData = recentSnapshots.length > 0;

  if (!hasData) {
    return (
      <ChartEmptyState
        message="자산 히스토리가 없습니다\n앱을 사용하면 자동으로 기록됩니다"
        icon="📊"
      />
    );
  }

  const labels = recentSnapshots.map(s => {
    const month = parseInt(s.yearMonth.split('-')[1]);
    return `${month}월`;
  });

  // 데이터 변환 (KRW 또는 BTC 기준)
  const getData = (snapshot: typeof recentSnapshots[0]) => {
    if (displayMode === 'KRW') {
      return {
        asset: snapshot.totalAssetKrw / 10000, // 만원 단위
        debt: snapshot.totalDebt / 10000,
        netWorth: snapshot.netWorthKrw / 10000,
      };
    } else {
      // BTC 기준 - 각 스냅샷의 당시 시세 사용
      const btcPrice = snapshot.btcKrw || btcKrw || 150000000;
      const assetBtc = snapshot.totalAssetKrw / (btcPrice / 100_000_000);
      const debtBtc = snapshot.totalDebt / (btcPrice / 100_000_000);
      const netWorthBtc = assetBtc - debtBtc;
      return {
        asset: assetBtc / 1000, // K sats (천 사토시) 단위
        debt: debtBtc / 1000,
        netWorth: netWorthBtc / 1000,
      };
    }
  };

  const chartData = recentSnapshots.map(getData);

  // 꺾은선 그래프 데이터 (자산/부채/순자산 모두 라인으로)
  const datasets = [];

  if (showAssets) {
    datasets.push({
      data: chartData.map(d => d.asset || 0.1), // 0이면 차트 오류 방지
      color: () => '#22C55E', // 초록
      strokeWidth: 2,
    });
  }

  if (showDebts) {
    datasets.push({
      data: chartData.map(d => d.debt || 0.1),
      color: () => '#EF4444', // 빨강
      strokeWidth: 2,
    });
  }

  if (showNetWorth) {
    datasets.push({
      data: chartData.map(d => d.netWorth || 0.1),
      color: () => '#3B82F6', // 파랑
      strokeWidth: 3,
    });
  }

  // 아무것도 선택 안했으면 기본 데이터
  if (datasets.length === 0) {
    datasets.push({ data: [0], color: () => '#9CA3AF', strokeWidth: 1 });
  }

  const lineData = {
    labels,
    datasets,
    legend: [], // 범례는 커스텀으로
  };

  // 최신 스냅샷 정보
  const latestSnapshot = recentSnapshots[recentSnapshots.length - 1];
  const latestData = latestSnapshot ? getData(latestSnapshot) : null;

  // 변화율 계산 (첫 스냅샷 대비)
  const firstData = chartData[0];
  const lastData = chartData[chartData.length - 1];
  const netWorthChange = firstData && lastData && firstData.netWorth !== 0
    ? ((lastData.netWorth - firstData.netWorth) / Math.abs(firstData.netWorth)) * 100
    : 0;

  const unit = displayMode === 'KRW' ? '₩ (만원)' : 'sats (K)';

  const chartConfig = {
    backgroundColor: '#FFFFFF',
    backgroundGradientFrom: '#FFFFFF',
    backgroundGradientTo: '#FFFFFF',
    decimalPlaces: 0, // K sats면 정수로 충분
    color: (opacity = 1) => `rgba(102, 102, 102, ${opacity})`,
    labelColor: () => '#666666',
    propsForBackgroundLines: {
      strokeDasharray: '',
      stroke: '#E5E7EB',
    },
    propsForDots: {
      r: '4',
      strokeWidth: '2',
    },
  };

  return (
    <View
      style={{
        backgroundColor: '#F9FAFB',
        borderRadius: 12,
        padding: 16,
      }}
    >
      {/* 헤더 */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Text style={{ fontSize: 14, fontWeight: '600', color: '#1A1A1A' }}>
          자산 흐름 (최근 6개월)
        </Text>

        {/* BTC/KRW 토글 */}
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

      {/* 단위 표시 */}
      <Text style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 8 }}>
        단위: {unit}
      </Text>

      {/* 토글 버튼 */}
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <TouchableOpacity
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: 16,
            backgroundColor: showAssets ? '#DCFCE7' : '#F3F4F6',
          }}
          onPress={() => setShowAssets(!showAssets)}
        >
          <View
            style={{
              width: 10,
              height: 10,
              borderRadius: 5,
              backgroundColor: '#22C55E',
              marginRight: 6,
              opacity: showAssets ? 1 : 0.3,
            }}
          />
          <Text style={{ fontSize: 12, color: showAssets ? '#22C55E' : '#9CA3AF', fontWeight: '500' }}>
            자산
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: 16,
            backgroundColor: showDebts ? '#FEE2E2' : '#F3F4F6',
          }}
          onPress={() => setShowDebts(!showDebts)}
        >
          <View
            style={{
              width: 10,
              height: 10,
              borderRadius: 5,
              backgroundColor: '#EF4444',
              marginRight: 6,
              opacity: showDebts ? 1 : 0.3,
            }}
          />
          <Text style={{ fontSize: 12, color: showDebts ? '#EF4444' : '#9CA3AF', fontWeight: '500' }}>
            부채
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: 16,
            backgroundColor: showNetWorth ? '#DBEAFE' : '#F3F4F6',
          }}
          onPress={() => setShowNetWorth(!showNetWorth)}
        >
          <View
            style={{
              width: 10,
              height: 10,
              borderRadius: 5,
              backgroundColor: '#3B82F6',
              marginRight: 6,
              opacity: showNetWorth ? 1 : 0.3,
            }}
          />
          <Text style={{ fontSize: 12, color: showNetWorth ? '#3B82F6' : '#9CA3AF', fontWeight: '500' }}>
            순자산
          </Text>
        </TouchableOpacity>
      </View>

      {/* 꺾은선 그래프 */}
      {(showAssets || showDebts || showNetWorth) && (
        <View style={{ marginLeft: -16 }}>
          <LineChart
            data={lineData}
            width={screenWidth - 40}
            height={200}
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
      )}

      {/* 범례 */}
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: 8 }}>
        {showAssets && (
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ width: 16, height: 3, backgroundColor: '#22C55E', marginRight: 4 }} />
            <Text style={{ fontSize: 11, color: '#666666' }}>자산</Text>
          </View>
        )}
        {showDebts && (
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ width: 16, height: 3, backgroundColor: '#EF4444', marginRight: 4 }} />
            <Text style={{ fontSize: 11, color: '#666666' }}>부채</Text>
          </View>
        )}
        {showNetWorth && (
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ width: 16, height: 3, backgroundColor: '#3B82F6', marginRight: 4 }} />
            <Text style={{ fontSize: 11, color: '#666666' }}>순자산</Text>
          </View>
        )}
      </View>

      {/* 요약 정보 */}
      {latestData && (
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            marginTop: 16,
            paddingTop: 12,
            borderTopWidth: 1,
            borderTopColor: '#E5E7EB',
            gap: 8,
          }}
        >
          <View style={{ minWidth: 70 }}>
            <Text style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 4 }}>순자산</Text>
            <Text style={{ fontSize: 13, fontWeight: '600', color: latestData.netWorth >= 0 ? '#22C55E' : '#EF4444' }}>
              {displayMode === 'KRW'
                ? formatKrw(latestData.netWorth * 10000)
                : `${Math.round(latestData.netWorth).toLocaleString()} K`}
            </Text>
          </View>
          <View style={{ minWidth: 60, alignItems: 'center' }}>
            <Text style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 4 }}>자산</Text>
            <Text style={{ fontSize: 13, fontWeight: '600', color: '#22C55E' }}>
              {displayMode === 'KRW'
                ? formatKrw(latestData.asset * 10000)
                : `${Math.round(latestData.asset).toLocaleString()} K`}
            </Text>
          </View>
          <View style={{ minWidth: 60, alignItems: 'center' }}>
            <Text style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 4 }}>부채</Text>
            <Text style={{ fontSize: 13, fontWeight: '600', color: '#EF4444' }}>
              {displayMode === 'KRW'
                ? formatKrw(latestData.debt * 10000)
                : `${Math.round(latestData.debt).toLocaleString()} K`}
            </Text>
          </View>
          <View style={{ minWidth: 50, alignItems: 'flex-end' }}>
            <Text style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 4 }}>변화율</Text>
            <Text
              style={{
                fontSize: 13,
                fontWeight: '600',
                color: netWorthChange >= 0 ? '#22C55E' : '#EF4444',
              }}
            >
              {netWorthChange >= 0 ? '+' : ''}{netWorthChange.toFixed(1)}%
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}
