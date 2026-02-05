import { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  Modal,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';
import * as Clipboard from 'expo-clipboard';
import { useAuthStore } from '../../src/stores/authStore';
import { useSettingsStore } from '../../src/stores/settingsStore';
import { useCardStore } from '../../src/stores/cardStore';
import { useLedgerStore } from '../../src/stores/ledgerStore';
import { useDebtStore } from '../../src/stores/debtStore';
import { useSubscriptionStore } from '../../src/stores/subscriptionStore';
import { createBackup, restoreBackup } from '../../src/utils/storage';
import { CONFIG, AutoLockTime } from '../../src/constants/config';
import {
  requestNotificationPermissions,
  cancelAllSubscriptionNotifications,
  scheduleSubscriptionExpiryNotifications,
  sendTestNotification,
  scheduleDailyReminder,
  cancelDailyReminder,
  sendRandomDailyReminder,
} from '../../src/services/notifications';
import {
  addDummyData,
  removeDummyData,
  hasDummyData,
} from '../../src/services/dummyDataService';
import { useSnapshotStore } from '../../src/stores/snapshotStore';
import { useAssetStore } from '../../src/stores/assetStore';

const AUTO_LOCK_LABELS: Record<AutoLockTime, string> = {
  immediate: '즉시',
  '1min': '1분',
  '5min': '5분',
  '15min': '15분',
  '30min': '30분',
  never: '안 함',
};

export default function SettingsScreen() {
  const { lock, biometricEnabled, biometricAvailable, enableBiometric, disableBiometric, encryptionKey } =
    useAuthStore();
  const { settings, updateSettings } = useSettingsStore();
  const { cards, loadCards } = useCardStore();
  const { loadRecords } = useLedgerStore();
  const { loadDebts } = useDebtStore();
  const { user, isSubscribed, subscription, initialize } = useSubscriptionStore();

  const [showAutoLockPicker, setShowAutoLockPicker] = useState(false);
  const [showReminderTimePicker, setShowReminderTimePicker] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isDummyLoading, setIsDummyLoading] = useState(false);
  const [hasDummy, setHasDummy] = useState(false);

  const { loadSnapshots } = useSnapshotStore();
  const { loadAssets } = useAssetStore();

  // 구독 상태 초기화
  useEffect(() => {
    initialize();
  }, []);

  // 더미 데이터 존재 여부 확인
  useEffect(() => {
    if (encryptionKey) {
      hasDummyData(encryptionKey).then(setHasDummy);
    }
  }, [encryptionKey]);

  // 매일 알림 초기화
  useEffect(() => {
    if (settings.dailyReminderEnabled) {
      scheduleDailyReminder(settings.dailyReminderTime);
    }
  }, []);

  const handleBiometricToggle = async (value: boolean) => {
    if (value) {
      await enableBiometric();
    } else {
      await disableBiometric();
    }
  };

  const handleLock = () => {
    Alert.alert('잠금', '앱을 잠그시겠습니까?', [
      { text: '취소', style: 'cancel' },
      {
        text: '잠금',
        onPress: () => {
          lock();
          router.replace('/(auth)/login');
        },
      },
    ]);
  };

  const handleAutoLockChange = async (value: AutoLockTime) => {
    await updateSettings({ autoLockTime: value });
    setShowAutoLockPicker(false);
  };

  const handleBackup = async () => {
    if (!encryptionKey) {
      Alert.alert('오류', '인증이 필요합니다.');
      return;
    }

    // 프리미엄 체크
    if (!isSubscribed) {
      Alert.alert(
        '프리미엄 기능',
        '데이터 백업은 프리미엄 구독자만 이용할 수 있습니다.',
        [
          { text: '취소', style: 'cancel' },
          {
            text: '구독하기',
            onPress: () => router.push('/(modals)/subscription'),
          },
        ]
      );
      return;
    }

    setIsBackingUp(true);
    try {
      const { path, filename } = await createBackup(encryptionKey);

      // 공유 옵션 제공
      await Share.share({
        url: path,
        title: filename,
        message: `SYBA 백업 파일: ${filename}`,
      });

      Alert.alert('완료', '백업 파일이 생성되었습니다.');
    } catch (error) {
      console.error('백업 실패:', error);
      Alert.alert('오류', '백업에 실패했습니다.');
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleRestore = async () => {
    if (!encryptionKey) {
      Alert.alert('오류', '인증이 필요합니다.');
      return;
    }

    Alert.alert(
      '데이터 복원',
      '백업 파일에서 데이터를 복원하시겠습니까?\n\n현재 데이터가 덮어씌워집니다.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '복원',
          style: 'destructive',
          onPress: async () => {
            try {
              const result = await DocumentPicker.getDocumentAsync({
                type: '*/*',
                copyToCacheDirectory: true,
              });

              if (result.canceled) {
                return;
              }

              const file = result.assets[0];
              if (!file.name.endsWith('.enc')) {
                Alert.alert('오류', '올바른 백업 파일(.enc)을 선택해주세요.');
                return;
              }

              // 복원 실행
              await restoreBackup(file.uri, encryptionKey);

              // 모든 스토어 다시 로드
              await Promise.all([
                loadRecords(),
                loadCards(),
                loadDebts(encryptionKey),
              ]);

              Alert.alert('완료', '데이터가 성공적으로 복원되었습니다.');
            } catch (error) {
              console.error('복원 실패:', error);
              Alert.alert(
                '복원 실패',
                '백업 파일을 복원하는데 실패했습니다.\n\n올바른 비밀번호로 로그인했는지 확인해주세요.'
              );
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      {/* 헤더 */}
      <View
        style={{
          padding: 20,
          borderBottomWidth: 1,
          borderBottomColor: '#E5E7EB',
        }}
      >
        <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#1A1A1A' }}>설정</Text>
      </View>

      <ScrollView style={{ flex: 1 }}>
        {/* 프로필 */}
        <View style={{ padding: 20 }}>
          <Text style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 12 }}>프로필</Text>

          <View
            style={{
              backgroundColor: '#F9FAFB',
              borderRadius: 12,
              overflow: 'hidden',
            }}
          >
            {/* 사용자 정보 (로그인 상태 표시) */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                padding: 16,
                borderBottomWidth: 1,
                borderBottomColor: '#E5E7EB',
              }}
            >
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  backgroundColor: user ? '#F7931A' : '#9CA3AF',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: 12,
                }}
              >
                <Text style={{ fontSize: 18 }}>{user ? '₿' : '?'}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '500', color: '#1A1A1A' }}>
                  {user ? (settings.userName || 'Lightning 사용자') : '로그인 필요'}
                </Text>
                <Text style={{ fontSize: 12, color: user ? '#22C55E' : '#9CA3AF' }}>
                  {user ? '로그인됨' : '프리미엄 구독을 위해 로그인하세요'}
                </Text>
              </View>
              {isSubscribed && (
                <View
                  style={{
                    backgroundColor: '#F7931A',
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                    borderRadius: 12,
                  }}
                >
                  <Text style={{ fontSize: 10, color: '#FFFFFF', fontWeight: '600' }}>프리미엄</Text>
                </View>
              )}
            </View>

            {/* 프리미엄 구독 */}
            <TouchableOpacity
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                padding: 16,
              }}
              onPress={() => router.push('/(modals)/subscription')}
            >
              <Ionicons name="diamond" size={24} color="#F7931A" style={{ marginRight: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '500', color: '#1A1A1A' }}>
                  프리미엄 구독
                </Text>
                <Text style={{ fontSize: 12, color: '#9CA3AF' }}>
                  {isSubscribed
                    ? `${subscription?.expires_at ? new Date(subscription.expires_at).toLocaleDateString('ko-KR') : ''} 까지`
                    : '구독하기'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
            </TouchableOpacity>
          </View>
        </View>

        {/* 표시 설정 */}
        <View style={{ padding: 20 }}>
          <Text style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 12 }}>표시</Text>

          <View
            style={{
              backgroundColor: '#F9FAFB',
              borderRadius: 12,
              overflow: 'hidden',
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                padding: 16,
              }}
            >
              <Ionicons name="calculator" size={24} color="#666666" style={{ marginRight: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, color: '#1A1A1A' }}>기본 표시 단위</Text>
                <Text style={{ fontSize: 12, color: '#9CA3AF' }}>
                  {settings.displayUnit === 'BTC' ? 'sats 메인, 원화 서브' : '원화 메인, sats 서브'}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', backgroundColor: '#E5E7EB', borderRadius: 8, padding: 2 }}>
                <TouchableOpacity
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 6,
                    backgroundColor: settings.displayUnit === 'BTC' ? '#F7931A' : 'transparent',
                  }}
                  onPress={() => updateSettings({ displayUnit: 'BTC' })}
                >
                  <Text style={{ fontSize: 12, fontWeight: '600', color: settings.displayUnit === 'BTC' ? '#FFFFFF' : '#9CA3AF' }}>
                    BTC
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 6,
                    backgroundColor: settings.displayUnit === 'KRW' ? '#FFFFFF' : 'transparent',
                  }}
                  onPress={() => updateSettings({ displayUnit: 'KRW' })}
                >
                  <Text style={{ fontSize: 12, fontWeight: '600', color: settings.displayUnit === 'KRW' ? '#1A1A1A' : '#9CA3AF' }}>
                    KRW
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>

        {/* 보안 */}
        <View style={{ padding: 20 }}>
          <Text style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 12 }}>보안</Text>

          <View
            style={{
              backgroundColor: '#F9FAFB',
              borderRadius: 12,
              overflow: 'hidden',
            }}
          >
            <TouchableOpacity
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                padding: 16,
                borderBottomWidth: 1,
                borderBottomColor: '#E5E7EB',
              }}
              onPress={() => router.push('/(modals)/change-password')}
            >
              <Ionicons name="key" size={24} color="#666666" style={{ marginRight: 12 }} />
              <Text style={{ flex: 1, fontSize: 16, color: '#1A1A1A' }}>비밀번호 변경</Text>
              <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
            </TouchableOpacity>

            {biometricAvailable && (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  padding: 16,
                  borderBottomWidth: 1,
                  borderBottomColor: '#E5E7EB',
                }}
              >
                <Ionicons
                  name="finger-print"
                  size={24}
                  color="#666666"
                  style={{ marginRight: 12 }}
                />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, color: '#1A1A1A' }}>생체인증</Text>
                  <Text style={{ fontSize: 12, color: '#9CA3AF' }}>Face ID / 지문</Text>
                </View>
                <Switch
                  value={biometricEnabled}
                  onValueChange={handleBiometricToggle}
                  trackColor={{ true: '#F7931A' }}
                />
              </View>
            )}

            <TouchableOpacity
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                padding: 16,
                borderBottomWidth: 1,
                borderBottomColor: '#E5E7EB',
              }}
              onPress={() => setShowAutoLockPicker(true)}
            >
              <Ionicons name="time" size={24} color="#666666" style={{ marginRight: 12 }} />
              <Text style={{ flex: 1, fontSize: 16, color: '#1A1A1A' }}>자동 잠금</Text>
              <Text style={{ fontSize: 14, color: '#9CA3AF', marginRight: 8 }}>
                {AUTO_LOCK_LABELS[settings.autoLockTime]}
              </Text>
              <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
            </TouchableOpacity>

            <TouchableOpacity
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                padding: 16,
              }}
              onPress={handleLock}
            >
              <Ionicons name="lock-closed" size={24} color="#666666" style={{ marginRight: 12 }} />
              <Text style={{ flex: 1, fontSize: 16, color: '#1A1A1A' }}>앱 잠금</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 알림 */}
        <View style={{ padding: 20 }}>
          <Text style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 12 }}>알림</Text>

          <View
            style={{
              backgroundColor: '#F9FAFB',
              borderRadius: 12,
              overflow: 'hidden',
            }}
          >
            {/* 매일 기록 알림 */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                padding: 16,
                borderBottomWidth: 1,
                borderBottomColor: '#E5E7EB',
              }}
            >
              <Ionicons name="calendar" size={24} color="#666666" style={{ marginRight: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, color: '#1A1A1A' }}>매일 기록 알림</Text>
                <Text style={{ fontSize: 12, color: '#9CA3AF' }}>매일 지출 기록을 유도해요</Text>
              </View>
              <Switch
                value={settings.dailyReminderEnabled}
                onValueChange={async (value) => {
                  await updateSettings({ dailyReminderEnabled: value });
                  if (value) {
                    const granted = await requestNotificationPermissions();
                    if (granted) {
                      await scheduleDailyReminder(settings.dailyReminderTime);
                    }
                  } else {
                    await cancelDailyReminder();
                  }
                }}
                trackColor={{ true: '#F7931A' }}
              />
            </View>

            {/* 알림 시간 설정 */}
            {settings.dailyReminderEnabled && (
              <TouchableOpacity
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  padding: 16,
                  paddingLeft: 52,
                  borderBottomWidth: 1,
                  borderBottomColor: '#E5E7EB',
                }}
                onPress={() => setShowReminderTimePicker(true)}
              >
                <Ionicons name="time-outline" size={20} color="#9CA3AF" style={{ marginRight: 12 }} />
                <Text style={{ flex: 1, fontSize: 14, color: '#666666' }}>알림 시간</Text>
                <Text style={{ fontSize: 14, color: '#F7931A', fontWeight: '500', marginRight: 8 }}>
                  {settings.dailyReminderTime}
                </Text>
                <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            )}

            {/* 구독 만료 알림 */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                padding: 16,
                borderBottomWidth: 1,
                borderBottomColor: '#E5E7EB',
              }}
            >
              <Ionicons name="notifications" size={24} color="#666666" style={{ marginRight: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, color: '#1A1A1A' }}>구독 만료 알림</Text>
                <Text style={{ fontSize: 12, color: '#9CA3AF' }}>만료 7일 전, 당일 알림</Text>
              </View>
              <Switch
                value={settings.subscriptionNotificationEnabled}
                onValueChange={async (value) => {
                  await updateSettings({ subscriptionNotificationEnabled: value });
                  if (value) {
                    const granted = await requestNotificationPermissions();
                    if (granted && isSubscribed && subscription?.expires_at) {
                      await scheduleSubscriptionExpiryNotifications(new Date(subscription.expires_at));
                    }
                  } else {
                    await cancelAllSubscriptionNotifications();
                  }
                }}
                trackColor={{ true: '#F7931A' }}
              />
            </View>

            {/* 테스트 알림 - 개발자 전용 */}
            {__DEV__ && (
              <TouchableOpacity
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  padding: 16,
                }}
                onPress={async () => {
                  await sendRandomDailyReminder();
                  Alert.alert('알림 테스트', '유쾌한 기록 알림을 발송했습니다!');
                }}
              >
                <Ionicons name="happy" size={24} color="#666666" style={{ marginRight: 12 }} />
                <Text style={{ flex: 1, fontSize: 16, color: '#1A1A1A' }}>테스트 알림 발송</Text>
                <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* 데이터 */}
        <View style={{ padding: 20 }}>
          <Text style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 12 }}>데이터</Text>

          <View
            style={{
              backgroundColor: '#F9FAFB',
              borderRadius: 12,
              overflow: 'hidden',
            }}
          >
            <TouchableOpacity
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                padding: 16,
                borderBottomWidth: 1,
                borderBottomColor: '#E5E7EB',
              }}
              onPress={() => router.push('/(modals)/card-list')}
            >
              <Ionicons name="card" size={24} color="#666666" style={{ marginRight: 12 }} />
              <Text style={{ flex: 1, fontSize: 16, color: '#1A1A1A' }}>카드 관리</Text>
              <Text style={{ fontSize: 14, color: '#9CA3AF', marginRight: 8 }}>
                {cards.length}장
              </Text>
              <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
            </TouchableOpacity>

            <TouchableOpacity
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                padding: 16,
                borderBottomWidth: 1,
                borderBottomColor: '#E5E7EB',
              }}
            >
              <Ionicons name="pricetag" size={24} color="#666666" style={{ marginRight: 12 }} />
              <Text style={{ flex: 1, fontSize: 16, color: '#1A1A1A' }}>카테고리 관리</Text>
              <Text style={{ fontSize: 12, color: '#9CA3AF', marginRight: 8 }}>준비 중</Text>
              <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
            </TouchableOpacity>

            <TouchableOpacity
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                padding: 16,
                borderBottomWidth: 1,
                borderBottomColor: '#E5E7EB',
              }}
              onPress={handleBackup}
              disabled={isBackingUp}
            >
              <Ionicons name="cloud-upload" size={24} color="#666666" style={{ marginRight: 12 }} />
              <Text style={{ flex: 1, fontSize: 16, color: '#1A1A1A' }}>
                {isBackingUp ? '백업 중...' : '데이터 백업'}
              </Text>
              <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
            </TouchableOpacity>

            <TouchableOpacity
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                padding: 16,
              }}
              onPress={handleRestore}
            >
              <Ionicons name="cloud-download" size={24} color="#666666" style={{ marginRight: 12 }} />
              <Text style={{ flex: 1, fontSize: 16, color: '#1A1A1A' }}>데이터 복원</Text>
              <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
            </TouchableOpacity>
          </View>
        </View>

        {/* 앱 정보 */}
        <View style={{ padding: 20 }}>
          <Text style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 12 }}>앱 정보</Text>

          <View
            style={{
              backgroundColor: '#F9FAFB',
              borderRadius: 12,
              padding: 16,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                marginBottom: 12,
              }}
            >
              <Text style={{ fontSize: 14, color: '#666666' }}>앱 이름</Text>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontSize: 14, color: '#1A1A1A', fontWeight: '500' }}>SYBA</Text>
                <Text style={{ fontSize: 10, color: '#9CA3AF' }}>Start Your Bitcoin Adoption</Text>
              </View>
            </View>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                marginBottom: 12,
              }}
            >
              <Text style={{ fontSize: 14, color: '#666666' }}>버전</Text>
              <Text style={{ fontSize: 14, color: '#1A1A1A' }}>1.0.0</Text>
            </View>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                marginBottom: 12,
              }}
            >
              <Text style={{ fontSize: 14, color: '#666666' }}>개발자</Text>
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: 'bold',
                  color: '#F5A623',
                }}
              >
                A⚡ado 🌽 Kimchi
              </Text>
            </View>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
              }}
            >
              <Text style={{ fontSize: 14, color: '#666666' }}>문의/제보</Text>
              <TouchableOpacity
                onPress={() => {
                  Clipboard.setStringAsync('AsadoConKimchi@proton.me');
                  Alert.alert('복사 완료', '이메일 주소가 클립보드에 복사되었습니다.');
                }}
              >
                <Text
                  style={{
                    fontSize: 14,
                    color: '#3B82F6',
                  }}
                >
                  AsadoConKimchi@proton.me
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* 카드 산정기간 안내 */}
          <View
            style={{
              backgroundColor: '#FEF3C7',
              borderRadius: 12,
              padding: 16,
              marginTop: 12,
            }}
          >
            <Text style={{ fontSize: 12, color: '#92400E', marginBottom: 4 }}>
              카드사별 결제일/산정기간 정보 안내
            </Text>
            <Text style={{ fontSize: 11, color: '#78716C', lineHeight: 16 }}>
              카드 등록 시 표시되는 결제일별 산정기간은 각 카드사 공식 자료를 참고하여 작성되었습니다.
              혹시 정보가 실제와 다르다면 위 이메일로 알려주시면 수정하겠습니다.
            </Text>
          </View>
        </View>

        {/* 개발자 도구 - 개발 모드에서만 표시 */}
        {__DEV__ && (
          <View style={{ padding: 20 }}>
            <Text style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 12 }}>개발자 도구</Text>

            <View
              style={{
                backgroundColor: '#FEF2F2',
                borderRadius: 12,
                overflow: 'hidden',
              }}
            >
              <TouchableOpacity
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  padding: 16,
                  borderBottomWidth: 1,
                  borderBottomColor: '#FECACA',
                }}
                disabled={isDummyLoading}
                onPress={async () => {
                  if (!encryptionKey) {
                    Alert.alert('오류', '인증이 필요합니다.');
                    return;
                  }

                  Alert.alert(
                    '테스트 데이터 추가',
                    '6개월치 더미 데이터(스냅샷, 기록, 자산, 부채)를 추가합니다.\n\n기존 데이터는 유지됩니다.',
                    [
                      { text: '취소', style: 'cancel' },
                      {
                        text: '추가',
                        onPress: async () => {
                          setIsDummyLoading(true);
                          try {
                            const result = await addDummyData(encryptionKey);

                            // 스토어 다시 로드
                            await Promise.all([
                              loadRecords(),
                              loadDebts(encryptionKey),
                              loadAssets(encryptionKey),
                              loadSnapshots(encryptionKey),
                            ]);

                            setHasDummy(true);
                            Alert.alert(
                              '완료',
                              `테스트 데이터 추가 완료!\n\n- 스냅샷: ${result.snapshots}개\n- 기록: ${result.records}개\n- 자산: ${result.assets}개\n- 대출: ${result.loans}개`
                            );
                          } catch (error) {
                            console.error('더미 데이터 추가 실패:', error);
                            Alert.alert('오류', '데이터 추가에 실패했습니다.');
                          } finally {
                            setIsDummyLoading(false);
                          }
                        },
                      },
                    ]
                  );
                }}
              >
                <Ionicons name="flask" size={24} color="#DC2626" style={{ marginRight: 12 }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, color: '#DC2626' }}>
                    {isDummyLoading ? '처리 중...' : '테스트 데이터 추가'}
                  </Text>
                  <Text style={{ fontSize: 12, color: '#9CA3AF' }}>
                    6개월치 더미 데이터 생성
                  </Text>
                </View>
                <Ionicons name="add-circle" size={24} color="#DC2626" />
              </TouchableOpacity>

              <TouchableOpacity
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  padding: 16,
                  opacity: hasDummy ? 1 : 0.5,
                }}
                disabled={isDummyLoading || !hasDummy}
                onPress={async () => {
                  if (!encryptionKey) {
                    Alert.alert('오류', '인증이 필요합니다.');
                    return;
                  }

                  Alert.alert(
                    '테스트 데이터 삭제',
                    '추가했던 더미 데이터만 삭제합니다.\n\n실제 데이터는 유지됩니다.',
                    [
                      { text: '취소', style: 'cancel' },
                      {
                        text: '삭제',
                        style: 'destructive',
                        onPress: async () => {
                          setIsDummyLoading(true);
                          try {
                            const result = await removeDummyData(encryptionKey);

                            // 스토어 다시 로드
                            await Promise.all([
                              loadRecords(),
                              loadDebts(encryptionKey),
                              loadAssets(encryptionKey),
                              loadSnapshots(encryptionKey),
                            ]);

                            setHasDummy(false);
                            Alert.alert(
                              '완료',
                              `테스트 데이터 삭제 완료!\n\n- 스냅샷: ${result.snapshots}개\n- 기록: ${result.records}개\n- 자산: ${result.assets}개\n- 대출: ${result.loans}개`
                            );
                          } catch (error) {
                            console.error('더미 데이터 삭제 실패:', error);
                            Alert.alert('오류', '데이터 삭제에 실패했습니다.');
                          } finally {
                            setIsDummyLoading(false);
                          }
                        },
                      },
                    ]
                  );
                }}
              >
                <Ionicons name="trash" size={24} color={hasDummy ? '#DC2626' : '#9CA3AF'} style={{ marginRight: 12 }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, color: hasDummy ? '#DC2626' : '#9CA3AF' }}>
                    테스트 데이터 삭제
                  </Text>
                  <Text style={{ fontSize: 12, color: '#9CA3AF' }}>
                    {hasDummy ? '더미 데이터만 삭제' : '삭제할 더미 데이터 없음'}
                  </Text>
                </View>
                <Ionicons name="remove-circle" size={24} color={hasDummy ? '#DC2626' : '#9CA3AF'} />
              </TouchableOpacity>
            </View>

            <Text style={{ fontSize: 11, color: '#9CA3AF', marginTop: 8, textAlign: 'center' }}>
              테스트 데이터는 "DUMMY_" 접두사로 구분되어 안전하게 삭제됩니다
            </Text>
          </View>
        )}

        {/* 하단 여백 */}
        <View style={{ height: 40 }} />
      </ScrollView>

      {/* 자동 잠금 선택 모달 */}
      <Modal visible={showAutoLockPicker} transparent animationType="slide">
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <View
            style={{
              backgroundColor: '#FFFFFF',
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              padding: 20,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 16,
              }}
            >
              <Text style={{ fontSize: 18, fontWeight: 'bold' }}>자동 잠금 시간</Text>
              <TouchableOpacity onPress={() => setShowAutoLockPicker(false)}>
                <Ionicons name="close" size={24} color="#666666" />
              </TouchableOpacity>
            </View>

            {(Object.keys(AUTO_LOCK_LABELS) as AutoLockTime[]).map((key) => (
              <TouchableOpacity
                key={key}
                style={{
                  padding: 16,
                  borderRadius: 8,
                  backgroundColor: settings.autoLockTime === key ? '#F7931A' : '#F3F4F6',
                  marginBottom: 8,
                }}
                onPress={() => handleAutoLockChange(key)}
              >
                <Text
                  style={{
                    fontSize: 16,
                    color: settings.autoLockTime === key ? '#FFFFFF' : '#1A1A1A',
                    textAlign: 'center',
                  }}
                >
                  {AUTO_LOCK_LABELS[key]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>

      {/* 알림 시간 선택 모달 */}
      <Modal visible={showReminderTimePicker} transparent animationType="slide">
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <View
            style={{
              backgroundColor: '#FFFFFF',
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              padding: 20,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 16,
              }}
            >
              <Text style={{ fontSize: 18, fontWeight: 'bold' }}>알림 시간</Text>
              <TouchableOpacity onPress={() => setShowReminderTimePicker(false)}>
                <Ionicons name="close" size={24} color="#666666" />
              </TouchableOpacity>
            </View>

            {['09:00', '12:00', '18:00', '20:00', '21:00', '22:00'].map((time) => (
              <TouchableOpacity
                key={time}
                style={{
                  padding: 16,
                  borderRadius: 8,
                  backgroundColor: settings.dailyReminderTime === time ? '#F7931A' : '#F3F4F6',
                  marginBottom: 8,
                }}
                onPress={async () => {
                  await updateSettings({ dailyReminderTime: time });
                  if (settings.dailyReminderEnabled) {
                    await scheduleDailyReminder(time);
                  }
                  setShowReminderTimePicker(false);
                }}
              >
                <Text
                  style={{
                    fontSize: 16,
                    color: settings.dailyReminderTime === time ? '#FFFFFF' : '#1A1A1A',
                    textAlign: 'center',
                  }}
                >
                  {time === '09:00' && '오전 9시'}
                  {time === '12:00' && '오후 12시'}
                  {time === '18:00' && '오후 6시'}
                  {time === '20:00' && '오후 8시'}
                  {time === '21:00' && '오후 9시 (기본)'}
                  {time === '22:00' && '오후 10시'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
