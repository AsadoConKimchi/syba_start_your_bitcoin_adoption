import { View, Text, TouchableOpacity, ScrollView, Alert, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../src/hooks/useTheme';
import { useRecurringTransferStore } from '../../src/stores/recurringTransferStore';
import { useAuthStore } from '../../src/stores/authStore';
import { useAssetStore } from '../../src/stores/assetStore';
import { useCardStore } from '../../src/stores/cardStore';
import { formatKrw } from '../../src/utils/formatters';
import { RecurringTransfer } from '../../src/types/recurringTransfer';

export default function RecurringTransferListScreen() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const { recurringTransfers, updateRecurringTransfer, deleteRecurringTransfer, getMonthlyTotal } = useRecurringTransferStore();
  const { getEncryptionKey } = useAuthStore();
  const { getAssetById } = useAssetStore();
  const { getCardById } = useCardStore();

  const monthlyTotal = getMonthlyTotal();
  const activeCount = recurringTransfers.filter(r => r.isActive).length;

  const handleToggle = async (item: RecurringTransfer) => {
    const encryptionKey = getEncryptionKey();
    if (!encryptionKey) return;
    await updateRecurringTransfer(item.id, { isActive: !item.isActive }, encryptionKey);
  };

  const handleDelete = (item: RecurringTransfer) => {
    Alert.alert(
      t('recurringTransfer.deleteConfirm'),
      t('recurringTransfer.deleteMessage', { name: item.name }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('delete.deleteRecords'),
          style: 'destructive',
          onPress: async () => {
            const encryptionKey = getEncryptionKey();
            if (encryptionKey) await deleteRecurringTransfer(item.id, encryptionKey, { deleteRecords: true });
          },
        },
        {
          text: t('delete.keepRecords'),
          onPress: async () => {
            const encryptionKey = getEncryptionKey();
            if (encryptionKey) await deleteRecurringTransfer(item.id, encryptionKey, { deleteRecords: false });
          },
        },
      ]
    );
  };

  const getTransferInfo = (item: RecurringTransfer): string => {
    const from = item.fromAssetId ? getAssetById(item.fromAssetId)?.name : '?';
    if (item.toAssetId) {
      const to = getAssetById(item.toAssetId)?.name ?? '?';
      return `${from} → ${to}`;
    }
    if (item.toCardId) {
      const to = getCardById(item.toCardId)?.name ?? '?';
      return `${from} → ${to}`;
    }
    return from ?? '?';
  };

  return (
    <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={{ flex: 1, backgroundColor: theme.background }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: theme.border }}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={theme.textSecondary} />
        </TouchableOpacity>
        <Text style={{ fontSize: 18, fontWeight: 'bold', color: theme.text }}>{t('recurringTransfer.title')}</Text>
        <TouchableOpacity onPress={() => router.push('/(modals)/add-recurring-transfer')}>
          <Ionicons name="add" size={24} color={theme.primary} />
        </TouchableOpacity>
      </View>

      {/* Monthly summary */}
      <View style={{ padding: 20, backgroundColor: theme.backgroundSecondary, marginHorizontal: 20, marginTop: 20, borderRadius: 12 }}>
        <Text style={{ fontSize: 12, color: theme.textSecondary }}>{t('recurringTransfer.monthlyTotal')}</Text>
        <Text style={{ fontSize: 24, fontWeight: 'bold', color: theme.primary, marginTop: 4 }}>{formatKrw(monthlyTotal)}</Text>
        <Text style={{ fontSize: 12, color: theme.textMuted, marginTop: 4 }}>
          {t('recurringTransfer.activeCount', { count: activeCount })}
        </Text>
      </View>

      <ScrollView style={{ flex: 1, padding: 20 }}>
        {recurringTransfers.length === 0 ? (
          <View style={{ padding: 40, alignItems: 'center' }}>
            <Text style={{ fontSize: 48, marginBottom: 12 }}>🔄</Text>
            <Text style={{ fontSize: 16, color: theme.textSecondary, textAlign: 'center', marginBottom: 20 }}>
              {t('recurringTransfer.noItems')}
            </Text>
            <TouchableOpacity
              style={{ backgroundColor: theme.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 }}
              onPress={() => router.push('/(modals)/add-recurring-transfer')}
            >
              <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '600' }}>{t('recurringTransfer.addFirst')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            {recurringTransfers.map(item => (
              <View
                key={item.id}
                style={{ backgroundColor: theme.backgroundSecondary, borderRadius: 12, padding: 16, opacity: item.isActive ? 1 : 0.5 }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 16, fontWeight: '600', color: theme.text }}>{item.name}</Text>
                    <Text style={{ fontSize: 20, fontWeight: 'bold', color: theme.primary, marginTop: 4 }}>
                      {formatKrw(item.amount)}
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                      <View style={{ backgroundColor: theme.backgroundTertiary, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 }}>
                        <Text style={{ fontSize: 11, color: theme.textSecondary }}>
                          {item.frequency === 'monthly'
                            ? t('recurring.everyMonth', { day: item.dayOfMonth })
                            : t('recurring.everyYearMonth', { month: item.monthOfYear, day: item.dayOfMonth })}
                        </Text>
                      </View>
                      <View style={{ backgroundColor: theme.backgroundTertiary, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 }}>
                        <Text style={{ fontSize: 11, color: theme.textSecondary }}>{getTransferInfo(item)}</Text>
                      </View>
                    </View>
                  </View>

                  <View style={{ alignItems: 'flex-end', gap: 8 }}>
                    <Switch
                      value={item.isActive}
                      onValueChange={() => handleToggle(item)}
                      trackColor={{ false: theme.border, true: theme.primary }}
                    />
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <TouchableOpacity onPress={() => router.push({ pathname: '/(modals)/edit-recurring-transfer', params: { id: item.id } })}>
                        <Ionicons name="create-outline" size={18} color={theme.textSecondary} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => handleDelete(item)}>
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
