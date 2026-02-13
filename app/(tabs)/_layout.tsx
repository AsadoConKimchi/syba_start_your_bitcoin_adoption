import { useEffect, useRef } from 'react';
import { Tabs } from 'expo-router';
import { Alert, Platform } from 'react-native';
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
// [TODO: 공식 배포 전 주석 해제] Push Notification - Personal 개발자 계정에서 미지원
// import {
//   scheduleLoanRepaymentNotifications,
//   scheduleInstallmentPaymentNotifications,
// } from '../../src/services/debtAutoRecord';
// import { scheduleMonthlySummaryNotification } from '../../src/services/notifications';
import { processAllAutoDeductions } from '../../src/services/autoDeductionService';
import { checkDataIntegrity, deleteCorruptedFiles, FILE_PATHS } from '../../src/utils/storage';

export default function TabsLayout() {
  const { isAuthenticated, encryptionKey } = useAuthStore();
  const { loadRecords } = useLedgerStore();
  const { loadCards } = useCardStore();
  const { loadDebts, loans, installments } = useDebtStore();
  const { cards } = useCardStore();
  const { loadAssets } = useAssetStore();
  const { loadCachedPrices, fetchPrices } = usePriceStore();
  const { loadSnapshots, checkAndSaveMonthlySnapshot } = useSnapshotStore();
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
        ]);

        if (!autoDeductionProcessed.current) {
          autoDeductionProcessed.current = true;
          try {
            const result = await processAllAutoDeductions();
            if (result.cards.processed > 0 || result.loans.processed > 0) {
              console.log('[TabsLayout] Auto deduction done:', result);
            }
          } catch (error) {
            console.error('[TabsLayout] Auto deduction error:', error);
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

          // [TODO: 공식 배포 전 주석 해제] Push Notification
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

  // [TODO: 공식 배포 전 주석 해제] Push Notification - 대출/할부 알림 스케줄링
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
