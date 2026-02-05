import { useEffect, useRef } from 'react';
import { Tabs } from 'expo-router';
import { Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../src/stores/authStore';
import { useLedgerStore } from '../../src/stores/ledgerStore';
import { useCardStore } from '../../src/stores/cardStore';
import { useDebtStore } from '../../src/stores/debtStore';
import { useAssetStore } from '../../src/stores/assetStore';
import { usePriceStore } from '../../src/stores/priceStore';
import { useSnapshotStore } from '../../src/stores/snapshotStore';
import {
  scheduleLoanRepaymentNotifications,
  scheduleInstallmentPaymentNotifications,
} from '../../src/services/debtAutoRecord';
import { processAllAutoDeductions } from '../../src/services/autoDeductionService';
import { scheduleMonthlySummaryNotification } from '../../src/services/notifications';
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

  // 자동 차감 처리 여부 추적
  const autoDeductionProcessed = useRef(false);
  // 스냅샷 체크 여부 추적
  const snapshotChecked = useRef(false);
  // 무결성 검사 여부 추적
  const integrityChecked = useRef(false);

  // 시세 초기화: 캐시 먼저 로드 → 네트워크에서 최신 데이터 시도
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
        // 데이터 무결성 검사 (한 세션에 한 번만)
        if (!integrityChecked.current) {
          integrityChecked.current = true;
          try {
            const { isHealthy, corruptedFiles } = await checkDataIntegrity(encryptionKey);
            if (!isHealthy) {
              const fileNames = corruptedFiles.map(f => f.split('/').pop()).join(', ');
              Alert.alert(
                '데이터 손상 감지',
                `일부 파일이 손상되었습니다:\n${fileNames}\n\n백업에서 복원하거나 손상된 파일을 삭제할 수 있습니다.`,
                [
                  { text: '무시', style: 'cancel' },
                  {
                    text: '손상된 파일 삭제',
                    style: 'destructive',
                    onPress: async () => {
                      await deleteCorruptedFiles(corruptedFiles);
                      Alert.alert('완료', '손상된 파일이 삭제되었습니다. 앱을 다시 시작해주세요.');
                    },
                  },
                ]
              );
            }
          } catch (error) {
            console.error('[TabsLayout] 무결성 검사 오류:', error);
          }
        }

        // 데이터 로드
        await Promise.all([
          loadRecords(),
          loadCards(),
          loadDebts(encryptionKey),
          loadAssets(encryptionKey),
          loadSnapshots(encryptionKey),
        ]);

        // 자동 차감 처리 (한 세션에 한 번만)
        if (!autoDeductionProcessed.current) {
          autoDeductionProcessed.current = true;
          try {
            const result = await processAllAutoDeductions();
            if (result.cards.processed > 0 || result.loans.processed > 0) {
              console.log('[TabsLayout] 자동 차감 완료:', result);
            }
          } catch (error) {
            console.error('[TabsLayout] 자동 차감 오류:', error);
          }
        }

        // 월별 스냅샷 체크 및 저장 (한 세션에 한 번만)
        if (!snapshotChecked.current) {
          snapshotChecked.current = true;
          try {
            const saved = await checkAndSaveMonthlySnapshot(encryptionKey);
            if (saved) {
              console.log('[TabsLayout] 월별 스냅샷 저장됨');
            }
          } catch (error) {
            console.error('[TabsLayout] 스냅샷 저장 오류:', error);
          }

          // 월말 알림 스케줄링
          try {
            await scheduleMonthlySummaryNotification();
          } catch (error) {
            console.error('[TabsLayout] 월말 알림 스케줄링 오류:', error);
          }
        }
      }
    };
    initData();
  }, [isAuthenticated, encryptionKey]);

  // 대출/할부 알림 스케줄링
  useEffect(() => {
    if (loans.length > 0 || installments.length > 0) {
      // 대출 상환 알림 스케줄링
      scheduleLoanRepaymentNotifications(loans).catch(console.error);

      // 할부 결제 알림 스케줄링 (카드 결제일 정보 필요)
      const cardPaymentDays = new Map<string, number>();
      cards.forEach((card) => {
        if (card.paymentDay) {
          cardPaymentDays.set(card.id, card.paymentDay);
        }
      });
      scheduleInstallmentPaymentNotifications(installments, cardPaymentDays).catch(console.error);
    }
  }, [loans, installments, cards]);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#F7931A',
        tabBarInactiveTintColor: '#9CA3AF',
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: {
          borderTopWidth: 1,
          borderTopColor: '#E5E7EB',
          height: 60,
          paddingBottom: 8,
          paddingTop: 8,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: '홈',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="records"
        options={{
          title: '기록',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="document-text-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="assets"
        options={{
          title: '자산',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="wallet-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="debts"
        options={{
          title: '부채',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="card-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: '설정',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
