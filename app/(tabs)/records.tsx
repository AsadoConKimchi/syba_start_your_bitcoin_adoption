import { View, Text, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useLedgerStore } from '../../src/stores/ledgerStore';
import { useSettingsStore } from '../../src/stores/settingsStore';
import { useSubscriptionStore } from '../../src/stores/subscriptionStore';
import { formatKrw, formatSats } from '../../src/utils/formatters';
import { CategoryPieChart, SpendingTrendChart } from '../../src/components/charts';
import { PremiumBanner } from '../../src/components/PremiumGate';

export default function RecordsScreen() {
  const { records, getRecordsByMonth } = useLedgerStore();
  const { settings } = useSettingsStore();
  const { isSubscribed } = useSubscriptionStore();
  const { t } = useTranslation();

  const [selectedDate, setSelectedDate] = useState(new Date());
  const year = selectedDate.getFullYear();
  const month = selectedDate.getMonth() + 1;

  const now = new Date();
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1;

  const monthRecords = getRecordsByMonth(year, month);

  const recordsByDate = monthRecords.reduce((acc, record) => {
    if (!acc[record.date]) {
      acc[record.date] = [];
    }
    acc[record.date].push(record);
    return acc;
  }, {} as Record<string, typeof monthRecords>);

  const sortedDates = Object.keys(recordsByDate).sort((a, b) => b.localeCompare(a));

  const goToPrevMonth = () => {
    if (!isSubscribed) {
      Alert.alert(
        t('records.premiumRequired'),
        t('records.premiumDescription'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('records.subscribe'),
            onPress: () => router.push('/(modals)/subscription'),
          },
        ]
      );
      return;
    }
    setSelectedDate(new Date(year, month - 2, 1));
  };

  const goToNextMonth = () => {
    const nextMonth = new Date(year, month, 1);
    const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    if (nextMonth > currentMonth) return;

    setSelectedDate(new Date(year, month, 1));
  };

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
        <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#1A1A1A' }}>{t('records.title')}</Text>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <TouchableOpacity onPress={() => router.push('/(modals)/add-income')}>
            <Ionicons name="add-circle" size={28} color="#22C55E" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/(modals)/add-expense')}>
            <Ionicons name="remove-circle" size={28} color="#EF4444" />
          </TouchableOpacity>
        </View>
      </View>

      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'center',
          alignItems: 'center',
          padding: 16,
          gap: 24,
        }}
      >
        <TouchableOpacity onPress={goToPrevMonth}>
          <Ionicons name="chevron-back" size={24} color="#666666" />
        </TouchableOpacity>
        <Text style={{ fontSize: 18, fontWeight: '600', color: '#1A1A1A' }}>
          {t('records.yearMonth', { year, month })}
        </Text>
        <TouchableOpacity onPress={goToNextMonth}>
          <Ionicons name="chevron-forward" size={24} color="#666666" />
        </TouchableOpacity>
      </View>

      <ScrollView style={{ flex: 1, padding: 20 }}>
        <View style={{ marginBottom: 20 }}>
          {isSubscribed ? (
            <CategoryPieChart year={year} month={month} />
          ) : (
            <PremiumBanner feature={t('records.title')} />
          )}
        </View>

        <View style={{ marginBottom: 20 }}>
          {isSubscribed ? (
            <SpendingTrendChart />
          ) : (
            <PremiumBanner feature={t('records.title')} />
          )}
        </View>

        {sortedDates.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 48 }}>
            <Text style={{ fontSize: 48, marginBottom: 16 }}>📝</Text>
            <Text style={{ fontSize: 16, color: '#9CA3AF', textAlign: 'center' }}>
              {t('records.noRecords')}
            </Text>
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
              <TouchableOpacity
                style={{
                  backgroundColor: '#22C55E',
                  paddingHorizontal: 24,
                  paddingVertical: 12,
                  borderRadius: 8,
                }}
                onPress={() => router.push('/(modals)/add-income')}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '600' }}>{t('records.addIncome')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{
                  backgroundColor: '#EF4444',
                  paddingHorizontal: 24,
                  paddingVertical: 12,
                  borderRadius: 8,
                }}
                onPress={() => router.push('/(modals)/add-expense')}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '600' }}>{t('records.subtractExpense')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          sortedDates.map(date => (
            <View key={date} style={{ marginBottom: 24 }}>
              <Text style={{ fontSize: 14, color: '#666666', marginBottom: 8 }}>
                {new Date(date).toLocaleDateString('ko-KR', {
                  month: 'long',
                  day: 'numeric',
                  weekday: 'short',
                })}
              </Text>

              {recordsByDate[date].map(record => (
                <TouchableOpacity
                  key={record.id}
                  style={{
                    backgroundColor: '#F9FAFB',
                    borderRadius: 8,
                    padding: 12,
                    marginBottom: 8,
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                  }}
                  onPress={() => router.push({ pathname: '/(modals)/edit-record', params: { id: record.id } })}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '500', color: '#1A1A1A' }}>
                      {record.category}
                    </Text>
                    {record.memo && (
                      <Text style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>
                        {record.memo}
                      </Text>
                    )}
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
                          {record.satsEquivalent ? formatSats(record.satsEquivalent) : '-'}
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
                </TouchableOpacity>
              ))}
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
