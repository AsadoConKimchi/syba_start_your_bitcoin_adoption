import { useState, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Modal,
} from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as DocumentPicker from 'expo-document-picker';
import { useTheme } from '../../src/hooks/useTheme';
import { useAuthStore } from '../../src/stores/authStore';
import { restoreBackup } from '../../src/utils/storage';
import {
  generateSalt,
  hashPassword,
  deriveKey,
  saveSecure,
  SECURE_KEYS,
} from '../../src/utils/encryption';

export default function SetupScreen() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreModalVisible, setRestoreModalVisible] = useState(false);
  const [restorePassword, setRestorePassword] = useState('');
  const [selectedBackupUri, setSelectedBackupUri] = useState<string | null>(null);
  const { t } = useTranslation();
  const { theme } = useTheme();

  const { setupPassword, biometricAvailable } = useAuthStore();

  const passwordChecks = useMemo(() => ({
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    length: password.length >= 12,
  }), [password]);

  const allRequirementsMet = passwordChecks.uppercase && passwordChecks.lowercase && passwordChecks.number && passwordChecks.length;

  const handleSetup = async () => {
    if (!allRequirementsMet) {
      Alert.alert(t('common.error'), t('auth.passwordTooShort'));
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert(t('common.error'), t('auth.passwordMismatch'));
      return;
    }

    setIsLoading(true);
    setProgress(0);
    try {
      await setupPassword(password, (p) => setProgress(p));

      if (biometricAvailable) {
        router.replace('/(auth)/biometric-setup');
      } else {
        router.replace('/(tabs)');
      }
    } catch (error) {
      Alert.alert(t('common.error'), t('auth.setupFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  const handlePickBackup = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.[0]) return;

      const file = result.assets[0];
      if (!file.name?.endsWith('.enc')) {
        Alert.alert(t('common.error'), t('auth.restoreFailed'));
        return;
      }

      setSelectedBackupUri(file.uri);

      if (Platform.OS === 'ios') {
        Alert.prompt(
          t('auth.restoreFromBackup'),
          t('auth.restoreEnterPassword'),
          async (inputPassword: string) => {
            if (inputPassword) {
              await executeRestore(file.uri, inputPassword);
            }
          },
          'secure-text'
        );
      } else {
        setRestorePassword('');
        setRestoreModalVisible(true);
      }
    } catch (error) {
      console.error('Document picker error:', error);
    }
  };

  const executeRestore = async (fileUri: string, backupPassword: string) => {
    setIsRestoring(true);
    setRestoreModalVisible(false);
    try {
      // Read file to check for embedded salt in header
      const FileSystem = await import('expo-file-system/legacy');
      const fileContent = await FileSystem.readAsStringAsync(fileUri);

      let salt: string;
      if (fileContent.startsWith('SYBA_BACKUP:')) {
        // New format: extract salt from header
        const newlineIdx = fileContent.indexOf('\n');
        salt = fileContent.substring('SYBA_BACKUP:'.length, newlineIdx);
      } else {
        // Old format without salt header - can't restore cross-device
        // Old backups used deriveKeySync(password, salt) where salt was device-specific
        // from SecureStore. Without the original salt, decryption is impossible.
        Alert.alert(
          t('common.error'),
          '이 백업 파일은 이전 버전 형식입니다. 원래 기기에서 새 백업을 생성해주세요.'
        );
        return;
      }

      // Derive encryption key using backup's original salt
      const encryptionKey = await deriveKey(backupPassword, salt);

      // Restore backup data (re-encrypts all files with the same key)
      await restoreBackup(fileUri, encryptionKey);

      // Save credentials to SecureStore
      const hash = hashPassword(backupPassword, salt);
      await Promise.all([
        saveSecure(SECURE_KEYS.ENCRYPTION_SALT, salt),
        saveSecure(SECURE_KEYS.PASSWORD_HASH, hash),
        saveSecure(SECURE_KEYS.ENCRYPTION_KEY, encryptionKey),
      ]);

      Alert.alert('', t('auth.restoreSuccess'), [
        { text: 'OK', onPress: () => router.replace('/(tabs)') },
      ]);
    } catch (error) {
      console.error('Restore error:', error);
      Alert.alert(t('common.error'), t('auth.restoreFailed'));
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1, backgroundColor: theme.background }}
    >
      <View style={{ flex: 1, padding: 24, justifyContent: 'center' }}>
        <View style={{ alignItems: 'center', marginBottom: 48 }}>
          <Text style={{ fontSize: 48, marginBottom: 16 }}>🔐</Text>
          <Text style={{ fontSize: 28, fontWeight: 'bold', color: theme.text }}>
            SYBA
          </Text>
          <Text style={{ fontSize: 12, color: theme.textMuted, marginTop: 4 }}>
            Start Your Bitcoin Adoption
          </Text>
        </View>

        <View style={{ marginBottom: 24 }}>
          <Text style={{ fontSize: 16, color: theme.text, marginBottom: 8 }}>
            {t('auth.setupPassword')}
          </Text>

          <TextInput
            style={{
              borderWidth: 1,
              borderColor: theme.inputBorder,
              borderRadius: 8,
              padding: 16,
              fontSize: 16,
              marginBottom: 12,
              color: theme.inputText,
              backgroundColor: theme.inputBackground,
            }}
            placeholder={t('auth.passwordMin12')}
            placeholderTextColor={theme.placeholder}
            secureTextEntry
                textContentType="none"
                autoComplete="off"
            value={password}
            onChangeText={setPassword}
            autoCapitalize="none"
          />

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            {([
              ['uppercase', t('auth.passwordReqUppercase')],
              ['lowercase', t('auth.passwordReqLowercase')],
              ['number', t('auth.passwordReqNumber')],
              ['length', t('auth.passwordReqLength')],
            ] as const).map(([key, label]) => {
              const met = passwordChecks[key as keyof typeof passwordChecks];
              return (
                <Text key={key} style={{ fontSize: 11, color: met ? '#22C55E' : '#EF4444' }}>
                  {met ? '✅' : '❌'}{label}
                </Text>
              );
            })}
          </View>

          <TextInput
            style={{
              borderWidth: 1,
              borderColor: theme.inputBorder,
              borderRadius: 8,
              padding: 16,
              fontSize: 16,
              color: theme.inputText,
              backgroundColor: theme.inputBackground,
            }}
            placeholder={t('auth.passwordConfirm')}
            placeholderTextColor={theme.placeholder}
            secureTextEntry
                textContentType="none"
                autoComplete="off"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            autoCapitalize="none"
          />
        </View>

        {isLoading ? (
          <View style={{
            borderRadius: 8,
            overflow: 'hidden',
            backgroundColor: theme.border,
            height: 52,
            justifyContent: 'center',
          }}>
            <View style={{
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: `${Math.round(progress * 100)}%`,
              backgroundColor: '#F7931A',
              borderRadius: 8,
            }} />
            <Text style={{
              color: '#FFFFFF',
              fontSize: 16,
              fontWeight: '600',
              textAlign: 'center',
              zIndex: 1,
            }}>
              🔐 {t('auth.settingUp')} {Math.round(progress * 100)}%
            </Text>
          </View>
        ) : (
          <TouchableOpacity
            style={{
              backgroundColor: theme.primary,
              padding: 16,
              borderRadius: 8,
              alignItems: 'center',
              opacity: !allRequirementsMet ? 0.5 : 1,
            }}
            onPress={handleSetup}
            disabled={!allRequirementsMet}
          >
            <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '600' }}>
              {t('common.next')}
            </Text>
          </TouchableOpacity>
        )}

        <View style={{ marginTop: 24, padding: 16, backgroundColor: theme.warningBanner, borderRadius: 8 }}>
          <Text style={{ fontSize: 14, color: theme.warningBannerText, textAlign: 'center' }}>
            {t('auth.passwordWarning')}
          </Text>
        </View>

        <TouchableOpacity
          style={{ marginTop: 16, alignItems: 'center' }}
          onPress={handlePickBackup}
          disabled={isRestoring}
        >
          <Text style={{ fontSize: 14, color: theme.primary, textDecorationLine: 'underline' }}>
            {isRestoring ? t('auth.restoring') : t('auth.restoreFromBackup')}
          </Text>
        </TouchableOpacity>

        {/* Android password modal for restore */}
        {Platform.OS !== 'ios' && (
          <Modal
            visible={restoreModalVisible}
            transparent
            animationType="fade"
            onRequestClose={() => setRestoreModalVisible(false)}
          >
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' }}>
              <View style={{ width: '80%', backgroundColor: theme.background, borderRadius: 12, padding: 24 }}>
                <Text style={{ fontSize: 16, fontWeight: '600', color: theme.text, marginBottom: 8 }}>
                  {t('auth.restoreFromBackup')}
                </Text>
                <Text style={{ fontSize: 14, color: theme.textMuted, marginBottom: 16 }}>
                  {t('auth.restoreEnterPassword')}
                </Text>
                <TextInput
                  style={{
                    borderWidth: 1,
                    borderColor: theme.inputBorder,
                    borderRadius: 8,
                    padding: 12,
                    fontSize: 16,
                    color: theme.inputText,
                    backgroundColor: theme.inputBackground,
                    marginBottom: 16,
                  }}
                  secureTextEntry
                  textContentType="none"
                  autoComplete="off"
                  value={restorePassword}
                  onChangeText={setRestorePassword}
                  autoCapitalize="none"
                  autoFocus
                />
                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12 }}>
                  <TouchableOpacity onPress={() => setRestoreModalVisible(false)}>
                    <Text style={{ fontSize: 16, color: theme.textMuted, padding: 8 }}>
                      {t('common.cancel')}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      if (selectedBackupUri && restorePassword) {
                        executeRestore(selectedBackupUri, restorePassword);
                      }
                    }}
                  >
                    <Text style={{ fontSize: 16, color: theme.primary, fontWeight: '600', padding: 8 }}>
                      OK
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}
