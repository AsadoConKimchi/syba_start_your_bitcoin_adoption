import { View, Text, TouchableOpacity, ScrollView, Alert, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../src/hooks/useTheme';
import { useRecurringStore } from '../../src/stores/recurringStore';
import { useAuthStore } from '../../src/stores/authStore';
import { useCardStore } from '../../src/stores/cardStore';
import { useAssetStore } from '../../src/stores/assetStore';
import { formatKrw } from '../../src/utils/formatters';
import { RecurringExpense } from '../../src/types/recurring';

export default function RecurringListScreen() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const { recurrings, updateRecurring, deleteRecurring, getMonthlyTotal } = useRecurringStore();
  const { getEncryptionKey } = useAuthStore();
  const { getCardById } = useCardStore();
  const { getAssetById } = useAssetStore();

  const monthlyTotal = getMonthlyTotal();
  const activeCount = recurrings.filter(r => r.isActive).length;

  const handleToggle = async (recurring: RecurringExpense) => {
    const encryptionKey = getEncryptionKey();
    if (!encryptionKey) return;
    await updateRecurring(recurring.id, { isActive: !recurring.isActive }, encryptionKey);
  };

  const handleDelete = (recurring: RecurringExpense) => {
    Alert.alert(
      t('recurring.deleteConfirm'),
      t('recurring.deleteMessage', { name: recurring.name }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            const encryptionKey = getEncryptionKey();
            if (encryptionKey) await deleteRecurring(recurring.id, encryptionKey);
          },
        },
      ]
    );
  };

  const getPaymentInfo = (recurring: RecurringExpense): string => {
    if (recurring.paymentMethod === 'card' && recurring.cardId) {
      const card = getCardById(recurring.cardId);
      return card?.name ?? t('expense.card');
    }
    if (recurring.paymentMethod === 'bank' && recurring.linkedAssetId) {
      const asset = getAssetById(recurring.linkedAssetId);
      return asset?.name ?? t('expense.bankTransfer');
    }
    return recurring.paymentMethod === 'cash' ? t('expense.cash') : t('expense.bankTransfer');
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: theme.border }}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={theme.textSecondary} />
        </TouchableOpacity>
        <Text style={{ fontSize: 18, fontWeight: 'bold', color: theme.text }}>{t('recurring.title')}</Text>
        <TouchableOpacity onPress={() => router.push('/(modals)/add-recurring')}>
          <Ionicons name="add" size={24} color={theme.primary} />
        </TouchableOpacity>
      </View>

      {/* Monthly summary */}
      <View style={{ padding: 20, backgroundColor: theme.backgroundSecondary, marginHorizontal: 20, marginTop: 20, borderRadius: 12 }}>
        <Text style={{ fontSize: 12, color: theme.textSecondary }}>{t('recurring.monthlyTotal')}</Text>
        <Text style={{ fontSize: 24, fontWeight: 'bold', color: theme.error, marginTop: 4 }}>{formatKrw(monthlyTotal)}</Text>
        <Text style={{ fontSize: 12, color: theme.textMuted, marginTop: 4 }}>
          {t('recurring.activeCount', { count: activeCount })}
        </Text>
      </View>

      <ScrollView style={{ flex: 1, padding: 20 }}>
        {recurrings.length === 0 ? (
          <View style={{ padding: 40, alignItems: 'center' }}>
            <Text style={{ fontSize: 48, marginBottom: 12 }}>📋</Text>
            <Text style={{ fontSize: 16, color: theme.textSecondary, textAlign: 'center', marginBottom: 20 }}>
              {t('recurring.noItems')}
            </Text>
            <TouchableOpacity
              style={{ backgroundColor: theme.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 }}
              onPress={() => router.push('/(modals)/add-recurring')}
            >
              <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '600' }}>{t('recurring.addFirst')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            {recurrings.map(recurring => (
              <View
                key={recurring.id}
                style={{ backgroundColor: theme.backgroundSecondary, borderRadius: 12, padding: 16, opacity: recurring.isActive ? 1 : 0.5 }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 16, fontWeight: '600', color: theme.text }}>{recurring.name}</Text>
                    <Text style={{ fontSize: 20, fontWeight: 'bold', color: theme.error, marginTop: 4 }}>
                      {formatKrw(recurring.amount)}
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                      <View style={{ backgroundColor: theme.backgroundTertiary, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 }}>
                        <Text style={{ fontSize: 11, color: theme.textSecondary }}>
                          {recurring.frequency === 'monthly'
                            ? t('recurring.everyMonth', { day: recurring.dayOfMonth })
                            : t('recurring.everyYearMonth', { month: recurring.monthOfYear, day: recurring.dayOfMonth })}
                        </Text>
                      </View>
                      <View style={{ backgroundColor: theme.backgroundTertiary, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 }}>
                        <Text style={{ fontSize: 11, color: theme.textSecondary }}>{getPaymentInfo(recurring)}</Text>
                      </View>
                      <View style={{ backgroundColor: theme.backgroundTertiary, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 }}>
                        <Text style={{ fontSize: 11, color: theme.textSecondary }}>{recurring.category}</Text>
                      </View>
                    </View>
                  </View>

                  <View style={{ alignItems: 'flex-end', gap: 8 }}>
                    <Switch
                      value={recurring.isActive}
                      onValueChange={() => handleToggle(recurring)}
                      trackColor={{ false: theme.border, true: theme.primary }}
                    />
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <TouchableOpacity onPress={() => router.push({ pathname: '/(modals)/edit-recurring', params: { recurringId: recurring.id } })}>
                        <Ionicons name="create-outline" size={18} color={theme.textSecondary} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => handleDelete(recurring)}>
                        <Ionicons name="trash-outline" size={18} color={theme.error} />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
