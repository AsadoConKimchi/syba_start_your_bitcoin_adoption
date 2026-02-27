import { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  Modal,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';
import * as Clipboard from 'expo-clipboard';
import * as Sharing from 'expo-sharing';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../src/stores/authStore';
import { useSettingsStore } from '../../src/stores/settingsStore';
import { useCardStore } from '../../src/stores/cardStore';
import { useLedgerStore } from '../../src/stores/ledgerStore';
import { useDebtStore } from '../../src/stores/debtStore';
import { useSubscriptionStore } from '../../src/stores/subscriptionStore';
import { createBackup } from '../../src/utils/storage';
import * as DocumentPicker from 'expo-document-picker';
import { generateCSVTemplate } from '../../src/utils/csvTemplate';
import { parseCSV, executeImport } from '../../src/utils/csvImport';
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
import { useTheme } from '../../src/hooks/useTheme';

export default function SettingsScreen() {
  const { lock, biometricEnabled, biometricAvailable, biometricType, enableBiometric, disableBiometric, getEncryptionKey } =
    useAuthStore();
  const encryptionKey = getEncryptionKey();
  const { settings, updateSettings } = useSettingsStore();
  const { cards, loadCards } = useCardStore();
  const { loadRecords, addExpense, addIncome } = useLedgerStore();
  const { loadDebts, loans, installments } = useDebtStore();
  const { user, isSubscribed, subscription, initialize } = useSubscriptionStore();
  const { t, i18n } = useTranslation();
  const { theme } = useTheme();

  const [showAutoLockPicker, setShowAutoLockPicker] = useState(false);
  const [showReminderTimePicker, setShowReminderTimePicker] = useState(false);
  const [showLanguagePicker, setShowLanguagePicker] = useState(false);
  const [showRegionPicker, setShowRegionPicker] = useState(false);
  const [currentRegion, setCurrentRegion] = useState<RegionId>(getCurrentRegionId());
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isDummyLoading, setIsDummyLoading] = useState(false);
  const [hasDummy, setHasDummy] = useState(false);

  const { loadSnapshots } = useSnapshotStore();
  const { loadAssets, assets } = useAssetStore();

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

  const [isImporting, setIsImporting] = useState(false);

  const handleDownloadTemplate = async () => {
    try {
      const csv = generateCSVTemplate(assets, cards, loans, installments);
      const path = FileSystem.cacheDirectory + 'SYBA_import_template.csv';
      await FileSystem.writeAsStringAsync(path, csv, { encoding: FileSystem.EncodingType.UTF8 });
      await Sharing.shareAsync(path, { mimeType: 'text/csv' });
    } catch (error) {
      if (__DEV__) console.log('[CSV Template] Error:', error);
    }
  };

  const handleCSVImport = async () => {
    if (!encryptionKey) {
      Alert.alert(t('common.error'), t('common.authRequired'));
      return;
    }

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', 'application/csv', '*/*'],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.[0]) return;

      const fileUri = result.assets[0].uri;
      const csvText = await FileSystem.readAsStringAsync(fileUri, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      const parsed = parseCSV(csvText);

      if (parsed.rows.length === 0) {
        Alert.alert(t('csvImport.importPreview'), t('csvImport.noRows'));
        return;
      }

      Alert.alert(
        t('csvImport.importPreview'),
        t('csvImport.importConfirm', {
          count: parsed.rows.length,
          errors: parsed.errors.length,
        }),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('common.confirm'),
            onPress: async () => {
              setIsImporting(true);
              try {
                const importResult = await executeImport(
                  parsed.rows,
                  assets,
                  cards,
                  loans,
                  installments,
                  encryptionKey,
                  undefined, // btcKrw - store가 historical price 자동 fetch
                  addExpense,
                  addIncome
                );
                Alert.alert(
                  t('common.complete'),
                  `${t('csvImport.importSuccess', { imported: importResult.imported })} ${t('csvImport.importSkipped', { skipped: importResult.skipped })}`
                );
                // Reload data
                await Promise.all([loadRecords(), loadAssets(encryptionKey), loadDebts(encryptionKey)]);
              } catch (error) {
                if (__DEV__) console.log('[CSV Import] Error:', error);
                Alert.alert(t('common.error'), t('csvImport.invalidFile'));
              } finally {
                setIsImporting(false);
              }
            },
          },
        ]
      );
    } catch (error) {
      if (__DEV__) console.log('[CSV Import] Picker error:', error);
    }
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
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      {/* Header */}
      <View
        style={{
          padding: 20,
          borderBottomWidth: 1,
          borderBottomColor: theme.border,
        }}
      >
        <Text style={{ fontSize: 20, fontWeight: 'bold', color: theme.text }}>{t('settings.title')}</Text>
      </View>

      <ScrollView style={{ flex: 1 }}>
        {/* Profile */}
        <View style={{ padding: 20 }}>
          <Text style={{ fontSize: 12, color: theme.textMuted, marginBottom: 12 }}>{t('settings.profile')}</Text>

          <View
            style={{
              backgroundColor: theme.backgroundSecondary,
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
                borderBottomColor: theme.border,
              }}
            >
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  backgroundColor: user ? theme.primary : theme.textMuted,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: 12,
                }}
              >
                <Text style={{ fontSize: 18 }}>{user ? '₿' : '?'}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '500', color: theme.text }}>
                  {user ? (settings.userName || t('settings.lightningUser')) : t('settings.loginRequired')}
                </Text>
                {user?.linking_key ? (
                  <TouchableOpacity
                    onPress={async () => {
                      const displayId = 'SYBA-' + user.linking_key.substring(2, 10);
                      await Clipboard.setStringAsync(displayId);
                      Alert.alert(t('common.copied'), displayId);
                    }}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}
                  >
                    <Text style={{ fontSize: 13, color: theme.primary, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }}>
                      {'SYBA-' + user.linking_key.substring(2, 10)}
                    </Text>
                    <Ionicons name="copy-outline" size={12} color={theme.primary} />
                  </TouchableOpacity>
                ) : (
                  <Text style={{ fontSize: 12, color: theme.textMuted }}>
                    {t('settings.loginForPremium')}
                  </Text>
                )}
              </View>
              {isSubscribed && (
                <View
                  style={{
                    backgroundColor: theme.primary,
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
              <Ionicons name="diamond" size={24} color={theme.primary} style={{ marginRight: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '500', color: theme.text }}>
                  {t('settings.premiumSubscription')}
                </Text>
                <Text style={{ fontSize: 12, color: theme.textMuted }}>
                  {isSubscribed
                    ? t('settings.subscribedUntil', { date: subscription?.expires_at ? new Date(subscription.expires_at).toLocaleDateString() : '' })
                    : t('settings.subscribeNow')}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={theme.textMuted} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Display */}
        <View style={{ padding: 20 }}>
          <Text style={{ fontSize: 12, color: theme.textMuted, marginBottom: 12 }}>{t('settings.display')}</Text>

          <View
            style={{
              backgroundColor: theme.backgroundSecondary,
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
                borderBottomColor: theme.border,
              }}
            >
              <Ionicons name="calculator" size={24} color={theme.textSecondary} style={{ marginRight: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, color: theme.text }}>{t('settings.displayUnit')}</Text>
                <Text style={{ fontSize: 12, color: theme.textMuted }}>
                  {settings.displayUnit === 'BTC' ? t('settings.satsMain') : t('settings.krwMain')}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', backgroundColor: theme.toggleTrack, borderRadius: 8, padding: 2 }}>
                <TouchableOpacity
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 6,
                    backgroundColor: settings.displayUnit === 'BTC' ? theme.primary : 'transparent',
                  }}
                  onPress={() => updateSettings({ displayUnit: 'BTC' })}
                >
                  <Text style={{ fontSize: 12, fontWeight: '600', color: settings.displayUnit === 'BTC' ? '#FFFFFF' : theme.textMuted }}>
                    BTC
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 6,
                    backgroundColor: settings.displayUnit === 'KRW' ? theme.toggleActiveKrw : 'transparent',
                  }}
                  onPress={() => updateSettings({ displayUnit: 'KRW' })}
                >
                  <Text style={{ fontSize: 12, fontWeight: '600', color: settings.displayUnit === 'KRW' ? theme.text : theme.textMuted }}>
                    KRW
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Theme selector */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                padding: 16,
                borderTopWidth: 1,
                borderTopColor: theme.border,
              }}
            >
              <Ionicons name="color-palette" size={24} color={theme.textSecondary} style={{ marginRight: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, color: theme.text }}>{t('settings.theme')}</Text>
              </View>
              <View style={{ flexDirection: 'row', backgroundColor: theme.toggleTrack, borderRadius: 8, padding: 2 }}>
                {(['light', 'dark', 'system'] as const).map((mode) => (
                  <TouchableOpacity
                    key={mode}
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      borderRadius: 6,
                      backgroundColor: settings.theme === mode ? theme.primary : 'transparent',
                    }}
                    onPress={() => updateSettings({ theme: mode })}
                  >
                    <Text style={{
                      fontSize: 11,
                      fontWeight: '600',
                      color: settings.theme === mode ? '#FFFFFF' : theme.textMuted,
                    }}>
                      {t(`settings.theme${mode.charAt(0).toUpperCase() + mode.slice(1)}`)}
                    </Text>
                  </TouchableOpacity>
                ))}
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
              <Ionicons name="language" size={24} color={theme.textSecondary} style={{ marginRight: 12 }} />
              <Text style={{ flex: 1, fontSize: 16, color: theme.text }}>{t('settings.language')}</Text>
              <Text style={{ fontSize: 14, color: theme.textMuted, marginRight: 8 }}>
                {SUPPORTED_LANGUAGES[i18n.language as SupportedLanguage]?.flag}{' '}
                {SUPPORTED_LANGUAGES[i18n.language as SupportedLanguage]?.nativeName}
              </Text>
              <Ionicons name="chevron-forward" size={20} color={theme.textMuted} />
            </TouchableOpacity>

            {/* Region selector */}
            <TouchableOpacity
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                padding: 16,
                borderTopWidth: 1,
                borderTopColor: theme.borderLight,
              }}
              onPress={() => setShowRegionPicker(true)}
            >
              <Ionicons name="globe-outline" size={24} color={theme.textSecondary} style={{ marginRight: 12 }} />
              <Text style={{ flex: 1, fontSize: 16, color: theme.text }}>{t('settings.region')}</Text>
              <Text style={{ fontSize: 14, color: theme.textMuted, marginRight: 8 }}>
                {SUPPORTED_REGIONS.find(r => r.id === currentRegion)?.flag}{' '}
                {t(SUPPORTED_REGIONS.find(r => r.id === currentRegion)?.nameKey || 'regions.korea')}
              </Text>
              <Ionicons name="chevron-forward" size={20} color={theme.textMuted} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Security */}
        <View style={{ padding: 20 }}>
          <Text style={{ fontSize: 12, color: theme.textMuted, marginBottom: 12 }}>{t('settings.security')}</Text>

          <View
            style={{
              backgroundColor: theme.backgroundSecondary,
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
                borderBottomColor: theme.border,
              }}
              onPress={() => router.push('/(modals)/change-password')}
            >
              <Ionicons name="key" size={24} color={theme.textSecondary} style={{ marginRight: 12 }} />
              <Text style={{ flex: 1, fontSize: 16, color: theme.text }}>{t('settings.changePassword')}</Text>
              <Ionicons name="chevron-forward" size={20} color={theme.textMuted} />
            </TouchableOpacity>

            {biometricAvailable && (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  padding: 16,
                  borderBottomWidth: 1,
                  borderBottomColor: theme.border,
                }}
              >
                <Ionicons
                  name={biometricType === 'faceid' ? 'scan' : 'finger-print'}
                  size={24}
                  color={theme.textSecondary}
                  style={{ marginRight: 12 }}
                />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, color: theme.text }}>{t('settings.biometric')}</Text>
                  <Text style={{ fontSize: 12, color: theme.textMuted }}>
                    {biometricType === 'faceid' ? 'Face ID' : biometricType === 'fingerprint' ? t('auth.useFingerprint') : t('settings.biometricSub')}
                  </Text>
                </View>
                <Switch
                  value={biometricEnabled}
                  onValueChange={handleBiometricToggle}
                  trackColor={{ false: theme.toggleTrack, true: theme.switchTrackOn }}
                />
              </View>
            )}

            <TouchableOpacity
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                padding: 16,
                borderBottomWidth: 1,
                borderBottomColor: theme.border,
              }}
              onPress={() => setShowAutoLockPicker(true)}
            >
              <Ionicons name="time" size={24} color={theme.textSecondary} style={{ marginRight: 12 }} />
              <Text style={{ flex: 1, fontSize: 16, color: theme.text }}>{t('settings.autoLock')}</Text>
              <Text style={{ fontSize: 14, color: theme.textMuted, marginRight: 8 }}>
                {t(AUTO_LOCK_KEYS[settings.autoLockTime])}
              </Text>
              <Ionicons name="chevron-forward" size={20} color={theme.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                padding: 16,
              }}
              onPress={handleLock}
            >
              <Ionicons name="lock-closed" size={24} color={theme.textSecondary} style={{ marginRight: 12 }} />
              <Text style={{ flex: 1, fontSize: 16, color: theme.text }}>{t('settings.lockApp')}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Notifications */}
        <View style={{ padding: 20 }}>
          <Text style={{ fontSize: 12, color: theme.textMuted, marginBottom: 12 }}>{t('settings.notifications')}</Text>

          <View
            style={{
              backgroundColor: theme.backgroundSecondary,
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
                borderBottomColor: theme.border,
              }}
            >
              <Ionicons name="calendar" size={24} color={theme.textSecondary} style={{ marginRight: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, color: theme.text }}>{t('settings.dailyReminder')}</Text>
                <Text style={{ fontSize: 12, color: theme.textMuted }}>{t('settings.dailyReminderSub')}</Text>
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
                trackColor={{ false: theme.toggleTrack, true: theme.switchTrackOn }}
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
                  borderBottomColor: theme.border,
                }}
                onPress={() => setShowReminderTimePicker(true)}
              >
                <Ionicons name="time-outline" size={20} color={theme.textMuted} style={{ marginRight: 12 }} />
                <Text style={{ flex: 1, fontSize: 14, color: theme.textSecondary }}>{t('settings.reminderTime')}</Text>
                <Text style={{ fontSize: 14, color: theme.primary, fontWeight: '500', marginRight: 8 }}>
                  {settings.dailyReminderTime}
                </Text>
                <Ionicons name="chevron-forward" size={20} color={theme.textMuted} />
              </TouchableOpacity>
            )}

            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                padding: 16,
                borderBottomWidth: 1,
                borderBottomColor: theme.border,
              }}
            >
              <Ionicons name="notifications" size={24} color={theme.textSecondary} style={{ marginRight: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, color: theme.text }}>{t('settings.subscriptionAlert')}</Text>
                <Text style={{ fontSize: 12, color: theme.textMuted }}>{t('settings.subscriptionAlertSub')}</Text>
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
                trackColor={{ false: theme.toggleTrack, true: theme.switchTrackOn }}
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
                <Ionicons name="happy" size={24} color={theme.textSecondary} style={{ marginRight: 12 }} />
                <Text style={{ flex: 1, fontSize: 16, color: theme.text }}>{t('settings.testNotification')}</Text>
                <Ionicons name="chevron-forward" size={20} color={theme.textMuted} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Data */}
        <View style={{ padding: 20 }}>
          <Text style={{ fontSize: 12, color: theme.textMuted, marginBottom: 12 }}>{t('settings.data')}</Text>

          <View
            style={{
              backgroundColor: theme.backgroundSecondary,
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
                borderBottomColor: theme.border,
              }}
              onPress={() => router.push('/(modals)/card-list')}
            >
              <Ionicons name="card" size={24} color={theme.textSecondary} style={{ marginRight: 12 }} />
              <Text style={{ flex: 1, fontSize: 16, color: theme.text }}>{t('settings.cardManagement')}</Text>
              <Text style={{ fontSize: 14, color: theme.textMuted, marginRight: 8 }}>
                {cards.length}{t('common.cards_unit')}
              </Text>
              <Ionicons name="chevron-forward" size={20} color={theme.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                padding: 16,
                borderBottomWidth: 1,
                borderBottomColor: theme.border,
              }}
              onPress={() => router.push('/(modals)/category-management')}
            >
              <Ionicons name="pricetag" size={24} color={theme.textSecondary} style={{ marginRight: 12 }} />
              <Text style={{ flex: 1, fontSize: 16, color: theme.text }}>{t('settings.categoryManagement')}</Text>
              <Ionicons name="chevron-forward" size={20} color={theme.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                padding: 16,
                borderBottomWidth: 1,
                borderBottomColor: theme.border,
              }}
              onPress={() => router.push('/(modals)/recurring-list')}
            >
              <Ionicons name="repeat" size={24} color={theme.textSecondary} style={{ marginRight: 12 }} />
              <Text style={{ flex: 1, fontSize: 16, color: theme.text }}>{t('settings.recurringManagement')}</Text>
              <Ionicons name="chevron-forward" size={20} color={theme.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                padding: 16,
                borderBottomWidth: 1,
                borderBottomColor: theme.border,
              }}
              onPress={handleBackup}
              disabled={isBackingUp}
            >
              <Ionicons name="cloud-upload" size={24} color={theme.textSecondary} style={{ marginRight: 12 }} />
              <Text style={{ flex: 1, fontSize: 16, color: theme.text }}>
                {isBackingUp ? t('settings.backingUp') : t('settings.backup')}
              </Text>
              <Ionicons name="chevron-forward" size={20} color={theme.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                padding: 16,
                borderBottomWidth: 1,
                borderBottomColor: theme.border,
              }}
              onPress={handleDownloadTemplate}
            >
              <Ionicons name="download" size={24} color={theme.textSecondary} style={{ marginRight: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, color: theme.text }}>{t('csvImport.downloadTemplate')}</Text>
                <Text style={{ fontSize: 12, color: theme.textMuted, marginTop: 2 }}>{t('csvImport.downloadTemplateSub')}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={theme.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                padding: 16,
              }}
              onPress={handleCSVImport}
              disabled={isImporting}
            >
              <Ionicons name="push" size={24} color={theme.textSecondary} style={{ marginRight: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, color: theme.text }}>
                  {isImporting ? t('csvImport.importing') : t('csvImport.importCSV')}
                </Text>
                <Text style={{ fontSize: 12, color: theme.textMuted, marginTop: 2 }}>{t('csvImport.importCSVSub')}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={theme.textMuted} />
            </TouchableOpacity>
          </View>
        </View>

        {/* App info */}
        <View style={{ padding: 20 }}>
          <Text style={{ fontSize: 12, color: theme.textMuted, marginBottom: 12 }}>{t('settings.appInfo')}</Text>

          <View
            style={{
              backgroundColor: theme.backgroundSecondary,
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
              <Text style={{ fontSize: 14, color: theme.textSecondary }}>{t('settings.appName')}</Text>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontSize: 14, color: theme.text, fontWeight: '500' }}>SYBA</Text>
                <Text style={{ fontSize: 10, color: theme.textMuted }}>Start Your Bitcoin Adoption</Text>
              </View>
            </View>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                marginBottom: 12,
              }}
            >
              <Text style={{ fontSize: 14, color: theme.textSecondary }}>{t('settings.version')}</Text>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontSize: 14, color: theme.text }}>
                  {Constants.expoConfig?.version || '0.1.0'}
                </Text>
                {Constants.expoConfig?.extra?.eas?.buildId && (
                  <Text style={{ fontSize: 10, color: theme.textMuted }}>
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
              <Text style={{ fontSize: 14, color: theme.textSecondary }}>{t('settings.developer')}</Text>
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
                alignItems: 'center',
              }}
            >
              <Text style={{ fontSize: 14, color: theme.textSecondary }}>{t('settings.contact')}</Text>
              <TouchableOpacity
                style={{ flexShrink: 1, marginLeft: 8 }}
                onPress={() => {
                  Clipboard.setStringAsync('AsadoConKimchi@proton.me');
                  Alert.alert(t('common.copied'), t('settings.emailCopied'));
                }}
              >
                <Text
                  style={{
                    fontSize: 13,
                    color: theme.info,
                  }}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  AsadoConKimchi@proton.me
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <View
            style={{
              backgroundColor: theme.warningBanner,
              borderRadius: 12,
              padding: 16,
              marginTop: 12,
            }}
          >
            <Text style={{ fontSize: 12, color: theme.warningBannerText, marginBottom: 4 }}>
              {t('settings.billingInfo')}
            </Text>
            <Text style={{ fontSize: 11, color: theme.warningBannerSubtext, lineHeight: 16 }}>
              {t('settings.billingInfoDetail')}
            </Text>
          </View>
        </View>

        {/* Dev tools */}
        {__DEV__ && (
          <View style={{ padding: 20 }}>
            <Text style={{ fontSize: 12, color: theme.textMuted, marginBottom: 12 }}>{t('settings.devTools')}</Text>

            <View
              style={{
                backgroundColor: theme.errorBanner,
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
                  borderBottomColor: theme.errorBannerBorder,
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
                <Ionicons name="flask" size={24} color={theme.error} style={{ marginRight: 12 }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, color: theme.error }}>
                    {isDummyLoading ? t('common.processing') : t('settings.addDummyData')}
                  </Text>
                  <Text style={{ fontSize: 12, color: theme.textMuted }}>
                    {t('settings.addDummyDataSub')}
                  </Text>
                </View>
                <Ionicons name="add-circle" size={24} color={theme.error} />
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
                <Ionicons name="trash" size={24} color={hasDummy ? theme.error : theme.textMuted} style={{ marginRight: 12 }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, color: hasDummy ? theme.error : theme.textMuted }}>
                    {t('settings.removeDummyData')}
                  </Text>
                  <Text style={{ fontSize: 12, color: theme.textMuted }}>
                    {hasDummy ? t('settings.removeDummyDataSub') : t('settings.noDummyData')}
                  </Text>
                </View>
                <Ionicons name="remove-circle" size={24} color={hasDummy ? theme.error : theme.textMuted} />
              </TouchableOpacity>
            </View>

            <Text style={{ fontSize: 11, color: theme.textMuted, marginTop: 8, textAlign: 'center' }}>
              {t('settings.dummySafeNote')}
            </Text>

            <View
              style={{
                backgroundColor: theme.infoBanner,
                borderRadius: 12,
                padding: 16,
                marginTop: 12,
              }}
            >
              <Text style={{ fontSize: 12, fontWeight: '600', color: theme.infoBannerText, marginBottom: 8 }}>
                {t('settings.envStatus')}
              </Text>
              <Text style={{ fontSize: 11, color: theme.infoBannerSubtext, fontFamily: 'monospace' }}>
                SUPABASE_URL: {SUPABASE_CONFIG.URL ? `✅ ${t('settings.envSet')}` : `❌ ${t('settings.envMissing')}`}
              </Text>
              <Text style={{ fontSize: 11, color: theme.infoBannerSubtext, fontFamily: 'monospace' }}>
                ANON_KEY: {SUPABASE_CONFIG.ANON_KEY ? `✅ ${t('settings.envSet')}` : `❌ ${t('settings.envMissing')}`}
              </Text>
              <Text style={{ fontSize: 11, color: theme.infoBannerSubtext, fontFamily: 'monospace', marginTop: 4 }}>
                URL: {SUPABASE_CONFIG.URL?.substring(0, 30) || 'N/A'}...
              </Text>
            </View>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Auto lock picker modal */}
      <Modal visible={showAutoLockPicker} transparent animationType="slide">
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: theme.modalOverlay }}>
          <View
            style={{
              backgroundColor: theme.modalBackground,
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
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: theme.text }}>{t('settings.autoLockTime')}</Text>
              <TouchableOpacity onPress={() => setShowAutoLockPicker(false)}>
                <Ionicons name="close" size={24} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            {(Object.keys(AUTO_LOCK_KEYS) as AutoLockTime[]).map((key) => (
              <TouchableOpacity
                key={key}
                style={{
                  padding: 16,
                  borderRadius: 8,
                  backgroundColor: settings.autoLockTime === key ? theme.primary : theme.backgroundTertiary,
                  marginBottom: 8,
                }}
                onPress={() => handleAutoLockChange(key)}
              >
                <Text
                  style={{
                    fontSize: 16,
                    color: settings.autoLockTime === key ? '#FFFFFF' : theme.text,
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
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: theme.modalOverlay }}>
          <View
            style={{
              backgroundColor: theme.modalBackground,
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
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: theme.text }}>{t('settings.reminderTime')}</Text>
              <TouchableOpacity onPress={() => setShowReminderTimePicker(false)}>
                <Ionicons name="close" size={24} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            {REMINDER_TIMES.map((time) => (
              <TouchableOpacity
                key={time}
                style={{
                  padding: 16,
                  borderRadius: 8,
                  backgroundColor: settings.dailyReminderTime === time ? theme.primary : theme.backgroundTertiary,
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
                    color: settings.dailyReminderTime === time ? '#FFFFFF' : theme.text,
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
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: theme.modalOverlay }}>
          <View
            style={{
              backgroundColor: theme.modalBackground,
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
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: theme.text }}>{t('settings.language')}</Text>
              <TouchableOpacity onPress={() => setShowLanguagePicker(false)}>
                <Ionicons name="close" size={24} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            {(Object.keys(SUPPORTED_LANGUAGES) as SupportedLanguage[]).map((lang) => (
              <TouchableOpacity
                key={lang}
                style={{
                  padding: 16,
                  borderRadius: 8,
                  backgroundColor: i18n.language === lang ? theme.primary : theme.backgroundTertiary,
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
                    color: i18n.language === lang ? '#FFFFFF' : theme.text,
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
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: theme.modalOverlay }}>
          <View
            style={{
              backgroundColor: theme.modalBackground,
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
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: theme.text }}>{t('settings.region')}</Text>
              <TouchableOpacity onPress={() => setShowRegionPicker(false)}>
                <Ionicons name="close" size={24} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            {SUPPORTED_REGIONS.map((region) => (
              <TouchableOpacity
                key={region.id}
                style={{
                  padding: 16,
                  borderRadius: 8,
                  backgroundColor: currentRegion === region.id ? theme.primary : theme.backgroundTertiary,
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
                    color: currentRegion === region.id ? '#FFFFFF' : theme.text,
                    flex: 1,
                  }}
                >
                  {t(region.nameKey)}
                </Text>
                <Text
                  style={{
                    fontSize: 14,
                    color: currentRegion === region.id ? 'rgba(255,255,255,0.6)' : theme.textMuted,
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
