import { useEffect, useRef } from 'react';
import { Tabs } from 'expo-router';
import { Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../src/hooks/useTheme';
import { useAuthStore } from '../../src/stores/authStore';
import { useLedgerStore } from '../../src/stores/ledgerStore';
import { useCardStore } from '../../src/stores/cardStore';
import { useDebtStore } from '../../src/stores/debtStore';
import { useAssetStore } from '../../src/stores/assetStore';
import { usePriceStore } from '../../src/stores/priceStore';
import { useSnapshotStore } from '../../src/stores/snapshotStore';
import { useSubscriptionStore } from '../../src/stores/subscriptionStore';
import { useCategoryStore } from '../../src/stores/categoryStore';
// [BACKLOG] Push Notification - 대출/할부 상환 알림 + 월말 분석 알림
// Apple Developer Program 전환 후 구현 예정 (v0.2.x)
// import {
//   scheduleLoanRepaymentNotifications,
//   scheduleInstallmentPaymentNotifications,
// } from '../../src/services/debtAutoRecord';
// import { scheduleMonthlySummaryNotification } from '../../src/services/notifications';
import { processAllAutoDeductions } from '../../src/services/autoDeductionService';
import { useRecurringStore } from '../../src/stores/recurringStore';
import { checkDataIntegrity, deleteCorruptedFiles, FILE_PATHS } from '../../src/utils/storage';

export default function TabsLayout() {
  const { isAuthenticated, getEncryptionKey } = useAuthStore();
  const encryptionKey = getEncryptionKey();
  const { loadRecords } = useLedgerStore();
  const { loadCards } = useCardStore();
  const { loadDebts, loans, installments } = useDebtStore();
  const { cards } = useCardStore();
  const { loadAssets } = useAssetStore();
  const { loadCachedPrices, fetchPrices } = usePriceStore();
  const { loadSnapshots, checkAndSaveMonthlySnapshot } = useSnapshotStore();
  const { loadCategories } = useCategoryStore();
  const { loadRecurrings, executeOverdueRecurrings } = useRecurringStore();
  const { initialize: initSubscription } = useSubscriptionStore();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { theme } = useTheme();

  const autoDeductionProcessed = useRef(false);
  const snapshotChecked = useRef(false);
  const integrityChecked = useRef(false);

  useEffect(() => {
    const initPrices = async () => {
      await loadCachedPrices();
      fetchPrices();
    };
    initPrices();
  }, []);

  useEffect(() => {
    const initData = async () => {
      if (isAuthenticated && encryptionKey) {
        if (!integrityChecked.current) {
          integrityChecked.current = true;
          try {
            const { isHealthy, corruptedFiles } = await checkDataIntegrity(encryptionKey);
            if (!isHealthy) {
              const fileNames = corruptedFiles.map(f => f.split('/').pop()).join(', ');
              Alert.alert(
                t('integrity.corruptedTitle'),
                t('integrity.corruptedMessage', { files: fileNames }),
                [
                  { text: t('common.ignore'), style: 'cancel' },
                  {
                    text: t('integrity.deleteCorrupted'),
                    style: 'destructive',
                    onPress: async () => {
                      await deleteCorruptedFiles(corruptedFiles);
                      Alert.alert(t('common.done'), t('integrity.deleteDone'));
                    },
                  },
                ]
              );
            }
          } catch (error) {
            console.error('[TabsLayout] Integrity check error:', error);
          }
        }

        await Promise.all([
          loadRecords(),
          loadCards(),
          loadDebts(encryptionKey),
          loadAssets(encryptionKey),
          loadSnapshots(encryptionKey),
          loadCategories(encryptionKey),
          loadRecurrings(encryptionKey),
          initSubscription(),
        ]);

        if (!autoDeductionProcessed.current) {
          autoDeductionProcessed.current = true;
          try {
            const result = await processAllAutoDeductions();
            if (result.cards.processed > 0 || result.loans.processed > 0) {
              console.log('[TabsLayout] Auto deduction done:', result);
            }

            const allWarnings = [...result.cards.warnings, ...result.loans.warnings];
            if (allWarnings.length > 0) {
              const message = allWarnings.map(w => `${w.assetName}: ${w.requested.toLocaleString()} → ${w.actual.toLocaleString()}`).join('\n');
              Alert.alert(t('autoDeduction.insufficientBalanceTitle'), t('autoDeduction.insufficientBalanceMessage') + '\n\n' + message);
            }
          } catch (error) {
            console.error('[TabsLayout] Auto deduction error:', error);
          }

          // 고정비용 자동 실행
          try {
            const recurringResult = await executeOverdueRecurrings();
            if (recurringResult.executed.length > 0) {
              console.log('[TabsLayout] Recurring expenses executed:', recurringResult.executed.length);
            }
          } catch (error) {
            console.error('[TabsLayout] Recurring expense error:', error);
          }
        }

        if (!snapshotChecked.current) {
          snapshotChecked.current = true;
          try {
            const saved = await checkAndSaveMonthlySnapshot(encryptionKey);
            if (saved) {
              console.log('[TabsLayout] Monthly snapshot saved');
            }
          } catch (error) {
            console.error('[TabsLayout] Snapshot save error:', error);
          }

          // [BACKLOG] 월말 분석 알림 - v0.2.x에서 구현 예정
          // try {
          //   await scheduleMonthlySummaryNotification();
          // } catch (error) {
          //   console.error('[TabsLayout] Monthly notification scheduling error:', error);
          // }
        }
      }
    };
    initData();
  }, [isAuthenticated, encryptionKey]);

  // [BACKLOG] 대출/할부 상환 알림 스케줄링 - v0.2.x에서 구현 예정
  // useEffect(() => {
  //   if (loans.length > 0 || installments.length > 0) {
  //     scheduleLoanRepaymentNotifications(loans).catch(console.error);
  //
  //     const cardPaymentDays = new Map<string, number>();
  //     cards.forEach((card) => {
  //       if (card.paymentDay) {
  //         cardPaymentDays.set(card.id, card.paymentDay);
  //       }
  //     });
  //     scheduleInstallmentPaymentNotifications(installments, cardPaymentDays).catch(console.error);
  //   }
  // }, [loans, installments, cards]);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: theme.tabBarActive,
        tabBarInactiveTintColor: theme.tabBarInactive,
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: {
          backgroundColor: theme.tabBarBackground,
          borderTopWidth: 1,
          borderTopColor: theme.tabBarBorder,
          paddingBottom: insets.bottom || 8,
          paddingTop: 8,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs.home'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="records"
        options={{
          title: t('tabs.records'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="document-text-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="assets"
        options={{
          title: t('tabs.assets'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="wallet-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="debts"
        options={{
          title: t('tabs.debts'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="card-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t('tabs.settings'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
