import { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';
import * as Clipboard from 'expo-clipboard';
import * as Sharing from 'expo-sharing';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../src/stores/authStore';
import { useSettingsStore } from '../../src/stores/settingsStore';
import { useCardStore } from '../../src/stores/cardStore';
import { useLedgerStore } from '../../src/stores/ledgerStore';
import { useDebtStore } from '../../src/stores/debtStore';
import { useSubscriptionStore } from '../../src/stores/subscriptionStore';
import { createBackup, restoreBackup } from '../../src/utils/storage';
import { CONFIG, AutoLockTime } from '../../src/constants/config';
import { SUPABASE_CONFIG } from '../../src/constants/supabase';
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
import { SUPPORTED_LANGUAGES, SupportedLanguage, changeLanguage } from '../../src/i18n';
import { SUPPORTED_REGIONS, getCurrentRegionId, setRegion, RegionId } from '../../src/regions';

export default function SettingsScreen() {
  const { lock, biometricEnabled, biometricAvailable, enableBiometric, disableBiometric, encryptionKey } =
    useAuthStore();
  const { settings, updateSettings } = useSettingsStore();
  const { cards, loadCards } = useCardStore();
  const { loadRecords } = useLedgerStore();
  const { loadDebts } = useDebtStore();
  const { user, isSubscribed, subscription, initialize } = useSubscriptionStore();
  const { t, i18n } = useTranslation();

  const [showAutoLockPicker, setShowAutoLockPicker] = useState(false);
  const [showReminderTimePicker, setShowReminderTimePicker] = useState(false);
  const [showLanguagePicker, setShowLanguagePicker] = useState(false);
  const [showRegionPicker, setShowRegionPicker] = useState(false);
  const [currentRegion, setCurrentRegion] = useState<RegionId>(getCurrentRegionId());
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isDummyLoading, setIsDummyLoading] = useState(false);
  const [hasDummy, setHasDummy] = useState(false);

  const { loadSnapshots } = useSnapshotStore();
  const { loadAssets } = useAssetStore();

  useEffect(() => {
    initialize();
  }, []);

  useEffect(() => {
    if (encryptionKey) {
      hasDummyData(encryptionKey).then(setHasDummy);
    }
  }, [encryptionKey]);

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
    Alert.alert(t('settings.lockConfirm'), t('settings.lockMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('settings.lockConfirm'),
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

  const handleLanguageChange = async (lang: SupportedLanguage) => {
    await changeLanguage(lang);
    await updateSettings({ language: lang });
    setShowLanguagePicker(false);
  };

  const handleRegionChange = (regionId: RegionId) => {
    setRegion(regionId);
    setCurrentRegion(regionId);
    setShowRegionPicker(false);
  };

  const handleBackup = async () => {
    if (!encryptionKey) {
      Alert.alert(t('common.error'), t('common.authRequired'));
      return;
    }

    if (!isSubscribed) {
      Alert.alert(
        t('settings.premiumFeature'),
        t('settings.backupPremiumOnly'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('settings.subscribeNow'),
            onPress: () => router.push('/(modals)/subscription'),
          },
        ]
      );
      return;
    }

    const doBackup = async (mode: 'local' | 'share') => {
      setIsBackingUp(true);
      try {
        const { path, filename } = await createBackup(encryptionKey);

        if (mode === 'local') {
          const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
          if (!permissions.granted) return;

          const fileUri = await FileSystem.StorageAccessFramework.createFileAsync(
            permissions.directoryUri,
            filename,
            'application/octet-stream'
          );
          const content = await FileSystem.readAsStringAsync(path, { encoding: FileSystem.EncodingType.Base64 });
          await FileSystem.writeAsStringAsync(fileUri, content, { encoding: FileSystem.EncodingType.Base64 });

          Alert.alert(t('common.done'), t('settings.backupDone'));
        } else {
          await Sharing.shareAsync(path, {
            mimeType: 'application/octet-stream',
            dialogTitle: `SYBA backup: ${filename}`,
          });
          Alert.alert(t('common.done'), t('settings.backupShared'));
        }
      } catch (error) {
        console.error('Backup failed:', error);
        Alert.alert(t('common.error'), t('settings.backupFailed'));
      } finally {
        setIsBackingUp(false);
      }
    };

    Alert.alert(
      t('settings.backupTitle'),
      t('settings.backupDescription'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('settings.saveToDevice'), onPress: () => doBackup('local') },
        { text: t('settings.shareExternal'), onPress: () => doBackup('share') },
      ]
    );
  };

  const handleRestore = async () => {
    if (!encryptionKey) {
      Alert.alert(t('common.error'), t('common.authRequired'));
      return;
    }

    Alert.alert(
      t('settings.restoreTitle'),
      t('settings.restoreWarning'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('settings.restore'),
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
                Alert.alert(t('common.error'), t('settings.invalidBackupFile'));
                return;
              }

              await restoreBackup(file.uri, encryptionKey);

              await Promise.all([
                loadRecords(),
                loadCards(),
                loadDebts(encryptionKey),
              ]);

              Alert.alert(t('common.done'), t('settings.restoreDone'));
            } catch (error) {
              console.error('Restore failed:', error);
              Alert.alert(
                t('settings.restoreTitle'),
                t('settings.restoreFailed')
              );
            }
          },
        },
      ]
    );
  };

  const AUTO_LOCK_KEYS: Record<AutoLockTime, string> = {
    immediate: 'settings.autoLockImmediate',
    '1min': 'settings.autoLock1min',
    '5min': 'settings.autoLock5min',
    '15min': 'settings.autoLock15min',
    '30min': 'settings.autoLock30min',
    never: 'settings.autoLockNever',
  };

  const REMINDER_TIMES = ['09:00', '12:00', '18:00', '20:00', '21:00', '22:00'];
  const REMINDER_TIME_KEYS: Record<string, string> = {
    '09:00': 'settings.reminderTime0900',
    '12:00': 'settings.reminderTime1200',
    '18:00': 'settings.reminderTime1800',
    '20:00': 'settings.reminderTime2000',
    '21:00': 'settings.reminderTime2100',
    '22:00': 'settings.reminderTime2200',
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      {/* Header */}
      <View
        style={{
          padding: 20,
          borderBottomWidth: 1,
          borderBottomColor: '#E5E7EB',
        }}
      >
        <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#1A1A1A' }}>{t('settings.title')}</Text>
      </View>

      <ScrollView style={{ flex: 1 }}>
        {/* Profile */}
        <View style={{ padding: 20 }}>
          <Text style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 12 }}>{t('settings.profile')}</Text>

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
                  {user ? (settings.userName || t('settings.lightningUser')) : t('settings.loginRequired')}
                </Text>
                <Text style={{ fontSize: 12, color: user ? '#22C55E' : '#9CA3AF' }}>
                  {user ? t('settings.loggedIn') : t('settings.loginForPremium')}
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
                  <Text style={{ fontSize: 10, color: '#FFFFFF', fontWeight: '600' }}>{t('common.premium')}</Text>
                </View>
              )}
            </View>

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
                  {t('settings.premiumSubscription')}
                </Text>
                <Text style={{ fontSize: 12, color: '#9CA3AF' }}>
                  {isSubscribed
                    ? t('settings.subscribedUntil', { date: subscription?.expires_at ? new Date(subscription.expires_at).toLocaleDateString() : '' })
                    : t('settings.subscribeNow')}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Display */}
        <View style={{ padding: 20 }}>
          <Text style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 12 }}>{t('settings.display')}</Text>

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
                borderBottomWidth: 1,
                borderBottomColor: '#E5E7EB',
              }}
            >
              <Ionicons name="calculator" size={24} color="#666666" style={{ marginRight: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, color: '#1A1A1A' }}>{t('settings.displayUnit')}</Text>
                <Text style={{ fontSize: 12, color: '#9CA3AF' }}>
                  {settings.displayUnit === 'BTC' ? t('settings.satsMain') : t('settings.krwMain')}
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

            {/* Language selector */}
            <TouchableOpacity
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                padding: 16,
              }}
              onPress={() => setShowLanguagePicker(true)}
            >
              <Ionicons name="language" size={24} color="#666666" style={{ marginRight: 12 }} />
              <Text style={{ flex: 1, fontSize: 16, color: '#1A1A1A' }}>{t('settings.language')}</Text>
              <Text style={{ fontSize: 14, color: '#9CA3AF', marginRight: 8 }}>
                {SUPPORTED_LANGUAGES[i18n.language as SupportedLanguage]?.flag}{' '}
                {SUPPORTED_LANGUAGES[i18n.language as SupportedLanguage]?.nativeName}
              </Text>
              <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
            </TouchableOpacity>

            {/* Region selector */}
            <TouchableOpacity
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                padding: 16,
                borderTopWidth: 1,
                borderTopColor: '#F3F4F6',
              }}
              onPress={() => setShowRegionPicker(true)}
            >
              <Ionicons name="globe-outline" size={24} color="#666666" style={{ marginRight: 12 }} />
              <Text style={{ flex: 1, fontSize: 16, color: '#1A1A1A' }}>{t('settings.region')}</Text>
              <Text style={{ fontSize: 14, color: '#9CA3AF', marginRight: 8 }}>
                {SUPPORTED_REGIONS.find(r => r.id === currentRegion)?.flag}{' '}
                {t(SUPPORTED_REGIONS.find(r => r.id === currentRegion)?.nameKey || 'regions.korea')}
              </Text>
              <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Security */}
        <View style={{ padding: 20 }}>
          <Text style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 12 }}>{t('settings.security')}</Text>

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
              <Text style={{ flex: 1, fontSize: 16, color: '#1A1A1A' }}>{t('settings.changePassword')}</Text>
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
                  <Text style={{ fontSize: 16, color: '#1A1A1A' }}>{t('settings.biometric')}</Text>
                  <Text style={{ fontSize: 12, color: '#9CA3AF' }}>{t('settings.biometricSub')}</Text>
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
              <Text style={{ flex: 1, fontSize: 16, color: '#1A1A1A' }}>{t('settings.autoLock')}</Text>
              <Text style={{ fontSize: 14, color: '#9CA3AF', marginRight: 8 }}>
                {t(AUTO_LOCK_KEYS[settings.autoLockTime])}
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
              <Text style={{ flex: 1, fontSize: 16, color: '#1A1A1A' }}>{t('settings.lockApp')}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Notifications */}
        <View style={{ padding: 20 }}>
          <Text style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 12 }}>{t('settings.notifications')}</Text>

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
                borderBottomWidth: 1,
                borderBottomColor: '#E5E7EB',
              }}
            >
              <Ionicons name="calendar" size={24} color="#666666" style={{ marginRight: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, color: '#1A1A1A' }}>{t('settings.dailyReminder')}</Text>
                <Text style={{ fontSize: 12, color: '#9CA3AF' }}>{t('settings.dailyReminderSub')}</Text>
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
                <Text style={{ flex: 1, fontSize: 14, color: '#666666' }}>{t('settings.reminderTime')}</Text>
                <Text style={{ fontSize: 14, color: '#F7931A', fontWeight: '500', marginRight: 8 }}>
                  {settings.dailyReminderTime}
                </Text>
                <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            )}

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
                <Text style={{ fontSize: 16, color: '#1A1A1A' }}>{t('settings.subscriptionAlert')}</Text>
                <Text style={{ fontSize: 12, color: '#9CA3AF' }}>{t('settings.subscriptionAlertSub')}</Text>
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

            {__DEV__ && (
              <TouchableOpacity
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  padding: 16,
                }}
                onPress={async () => {
                  await sendRandomDailyReminder();
                  Alert.alert(t('settings.testNotification'), t('settings.testNotificationSent'));
                }}
              >
                <Ionicons name="happy" size={24} color="#666666" style={{ marginRight: 12 }} />
                <Text style={{ flex: 1, fontSize: 16, color: '#1A1A1A' }}>{t('settings.testNotification')}</Text>
                <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Data */}
        <View style={{ padding: 20 }}>
          <Text style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 12 }}>{t('settings.data')}</Text>

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
              <Text style={{ flex: 1, fontSize: 16, color: '#1A1A1A' }}>{t('settings.cardManagement')}</Text>
              <Text style={{ fontSize: 14, color: '#9CA3AF', marginRight: 8 }}>
                {cards.length}{t('common.cards_unit')}
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
              <Text style={{ flex: 1, fontSize: 16, color: '#1A1A1A' }}>{t('settings.categoryManagement')}</Text>
              <Text style={{ fontSize: 12, color: '#9CA3AF', marginRight: 8 }}>{t('common.comingSoon')}</Text>
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
                {isBackingUp ? t('settings.backingUp') : t('settings.backup')}
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
              <Text style={{ flex: 1, fontSize: 16, color: '#1A1A1A' }}>{t('settings.restore')}</Text>
              <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
            </TouchableOpacity>
          </View>
        </View>

        {/* App info */}
        <View style={{ padding: 20 }}>
          <Text style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 12 }}>{t('settings.appInfo')}</Text>

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
              <Text style={{ fontSize: 14, color: '#666666' }}>{t('settings.appName')}</Text>
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
              <Text style={{ fontSize: 14, color: '#666666' }}>{t('settings.version')}</Text>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontSize: 14, color: '#1A1A1A' }}>
                  {Constants.expoConfig?.version || '0.1.0'}
                </Text>
                {Constants.expoConfig?.extra?.eas?.buildId && (
                  <Text style={{ fontSize: 10, color: '#9CA3AF' }}>
                    {Constants.expoConfig.extra.eas.buildId.slice(0, 8)}
                  </Text>
                )}
              </View>
            </View>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                marginBottom: 12,
              }}
            >
              <Text style={{ fontSize: 14, color: '#666666' }}>{t('settings.developer')}</Text>
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
              <Text style={{ fontSize: 14, color: '#666666' }}>{t('settings.contact')}</Text>
              <TouchableOpacity
                onPress={() => {
                  Clipboard.setStringAsync('AsadoConKimchi@proton.me');
                  Alert.alert(t('common.copied'), t('settings.emailCopied'));
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

          <View
            style={{
              backgroundColor: '#FEF3C7',
              borderRadius: 12,
              padding: 16,
              marginTop: 12,
            }}
          >
            <Text style={{ fontSize: 12, color: '#92400E', marginBottom: 4 }}>
              {t('settings.billingInfo')}
            </Text>
            <Text style={{ fontSize: 11, color: '#78716C', lineHeight: 16 }}>
              {t('settings.billingInfoDetail')}
            </Text>
          </View>
        </View>

        {/* Dev tools */}
        {__DEV__ && (
          <View style={{ padding: 20 }}>
            <Text style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 12 }}>{t('settings.devTools')}</Text>

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
                    Alert.alert(t('common.error'), t('common.authRequired'));
                    return;
                  }

                  Alert.alert(
                    t('settings.addDummyData'),
                    t('settings.addDummyConfirm'),
                    [
                      { text: t('common.cancel'), style: 'cancel' },
                      {
                        text: t('common.add'),
                        onPress: async () => {
                          setIsDummyLoading(true);
                          try {
                            const result = await addDummyData(encryptionKey);

                            await Promise.all([
                              loadRecords(),
                              loadDebts(encryptionKey),
                              loadAssets(encryptionKey),
                              loadSnapshots(encryptionKey),
                            ]);

                            setHasDummy(true);
                            Alert.alert(
                              t('common.done'),
                              t('settings.addDummyDone', {
                                snapshots: result.snapshots,
                                records: result.records,
                                assets: result.assets,
                                loans: result.loans,
                              })
                            );
                          } catch (error) {
                            console.error('Dummy data add failed:', error);
                            Alert.alert(t('common.error'), t('settings.addDummyFailed'));
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
                    {isDummyLoading ? t('common.processing') : t('settings.addDummyData')}
                  </Text>
                  <Text style={{ fontSize: 12, color: '#9CA3AF' }}>
                    {t('settings.addDummyDataSub')}
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
                    Alert.alert(t('common.error'), t('common.authRequired'));
                    return;
                  }

                  Alert.alert(
                    t('settings.removeDummyData'),
                    t('settings.removeDummyConfirm'),
                    [
                      { text: t('common.cancel'), style: 'cancel' },
                      {
                        text: t('common.delete'),
                        style: 'destructive',
                        onPress: async () => {
                          setIsDummyLoading(true);
                          try {
                            const result = await removeDummyData(encryptionKey);

                            await Promise.all([
                              loadRecords(),
                              loadDebts(encryptionKey),
                              loadAssets(encryptionKey),
                              loadSnapshots(encryptionKey),
                            ]);

                            setHasDummy(false);
                            Alert.alert(
                              t('common.done'),
                              t('settings.removeDummyDone', {
                                snapshots: result.snapshots,
                                records: result.records,
                                assets: result.assets,
                                loans: result.loans,
                              })
                            );
                          } catch (error) {
                            console.error('Dummy data remove failed:', error);
                            Alert.alert(t('common.error'), t('settings.removeDummyFailed'));
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
                    {t('settings.removeDummyData')}
                  </Text>
                  <Text style={{ fontSize: 12, color: '#9CA3AF' }}>
                    {hasDummy ? t('settings.removeDummyDataSub') : t('settings.noDummyData')}
                  </Text>
                </View>
                <Ionicons name="remove-circle" size={24} color={hasDummy ? '#DC2626' : '#9CA3AF'} />
              </TouchableOpacity>
            </View>

            <Text style={{ fontSize: 11, color: '#9CA3AF', marginTop: 8, textAlign: 'center' }}>
              {t('settings.dummySafeNote')}
            </Text>

            <View
              style={{
                backgroundColor: '#F0F9FF',
                borderRadius: 12,
                padding: 16,
                marginTop: 12,
              }}
            >
              <Text style={{ fontSize: 12, fontWeight: '600', color: '#0369A1', marginBottom: 8 }}>
                {t('settings.envStatus')}
              </Text>
              <Text style={{ fontSize: 11, color: '#0C4A6E', fontFamily: 'monospace' }}>
                SUPABASE_URL: {SUPABASE_CONFIG.URL ? `✅ ${t('settings.envSet')}` : `❌ ${t('settings.envMissing')}`}
              </Text>
              <Text style={{ fontSize: 11, color: '#0C4A6E', fontFamily: 'monospace' }}>
                ANON_KEY: {SUPABASE_CONFIG.ANON_KEY ? `✅ ${t('settings.envSet')}` : `❌ ${t('settings.envMissing')}`}
              </Text>
              <Text style={{ fontSize: 11, color: '#0C4A6E', fontFamily: 'monospace', marginTop: 4 }}>
                URL: {SUPABASE_CONFIG.URL?.substring(0, 30) || 'N/A'}...
              </Text>
            </View>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Auto lock picker modal */}
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
              <Text style={{ fontSize: 18, fontWeight: 'bold' }}>{t('settings.autoLockTime')}</Text>
              <TouchableOpacity onPress={() => setShowAutoLockPicker(false)}>
                <Ionicons name="close" size={24} color="#666666" />
              </TouchableOpacity>
            </View>

            {(Object.keys(AUTO_LOCK_KEYS) as AutoLockTime[]).map((key) => (
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
                  {t(AUTO_LOCK_KEYS[key])}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>

      {/* Reminder time picker modal */}
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
              <Text style={{ fontSize: 18, fontWeight: 'bold' }}>{t('settings.reminderTime')}</Text>
              <TouchableOpacity onPress={() => setShowReminderTimePicker(false)}>
                <Ionicons name="close" size={24} color="#666666" />
              </TouchableOpacity>
            </View>

            {REMINDER_TIMES.map((time) => (
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
                  {t(REMINDER_TIME_KEYS[time])}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>

      {/* Language picker modal */}
      <Modal visible={showLanguagePicker} transparent animationType="slide">
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
              <Text style={{ fontSize: 18, fontWeight: 'bold' }}>{t('settings.language')}</Text>
              <TouchableOpacity onPress={() => setShowLanguagePicker(false)}>
                <Ionicons name="close" size={24} color="#666666" />
              </TouchableOpacity>
            </View>

            {(Object.keys(SUPPORTED_LANGUAGES) as SupportedLanguage[]).map((lang) => (
              <TouchableOpacity
                key={lang}
                style={{
                  padding: 16,
                  borderRadius: 8,
                  backgroundColor: i18n.language === lang ? '#F7931A' : '#F3F4F6',
                  marginBottom: 8,
                  flexDirection: 'row',
                  alignItems: 'center',
                }}
                onPress={() => handleLanguageChange(lang)}
              >
                <Text style={{ fontSize: 24, marginRight: 12 }}>
                  {SUPPORTED_LANGUAGES[lang].flag}
                </Text>
                <Text
                  style={{
                    fontSize: 16,
                    color: i18n.language === lang ? '#FFFFFF' : '#1A1A1A',
                    flex: 1,
                  }}
                >
                  {SUPPORTED_LANGUAGES[lang].nativeName}
                </Text>
                {i18n.language === lang && (
                  <Ionicons name="checkmark" size={24} color="#FFFFFF" />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>

      {/* Region picker modal */}
      <Modal visible={showRegionPicker} transparent animationType="slide">
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
              <Text style={{ fontSize: 18, fontWeight: 'bold' }}>{t('settings.region')}</Text>
              <TouchableOpacity onPress={() => setShowRegionPicker(false)}>
                <Ionicons name="close" size={24} color="#666666" />
              </TouchableOpacity>
            </View>

            {SUPPORTED_REGIONS.map((region) => (
              <TouchableOpacity
                key={region.id}
                style={{
                  padding: 16,
                  borderRadius: 8,
                  backgroundColor: currentRegion === region.id ? '#F7931A' : '#F3F4F6',
                  marginBottom: 8,
                  flexDirection: 'row',
                  alignItems: 'center',
                }}
                onPress={() => handleRegionChange(region.id)}
              >
                <Text style={{ fontSize: 24, marginRight: 12 }}>
                  {region.flag}
                </Text>
                <Text
                  style={{
                    fontSize: 16,
                    color: currentRegion === region.id ? '#FFFFFF' : '#1A1A1A',
                    flex: 1,
                  }}
                >
                  {t(region.nameKey)}
                </Text>
                <Text
                  style={{
                    fontSize: 14,
                    color: currentRegion === region.id ? '#FFFFFF99' : '#9CA3AF',
                  }}
                >
                  {region.currency}
                </Text>
                {currentRegion === region.id && (
                  <Ionicons name="checkmark" size={24} color="#FFFFFF" style={{ marginLeft: 8 }} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
