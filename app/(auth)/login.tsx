import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../src/stores/authStore';
import { deleteSecure, SECURE_KEYS } from '../../src/utils/encryption';
import { clearAllData } from '../../src/utils/storage';

export default function LoginScreen() {
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { t } = useTranslation();

  const {
    verifyPassword,
    authenticateWithBiometric,
    biometricEnabled,
    biometricAvailable,
    failedAttempts,
    checkLockStatus,
    getRemainingLockTime,
  } = useAuthStore();

  const [remainingTime, setRemainingTime] = useState(0);
  const isLocked = checkLockStatus();

  useEffect(() => {
    if (isLocked) {
      const interval = setInterval(() => {
        const time = getRemainingLockTime();
        setRemainingTime(time);
        if (time <= 0) {
          checkLockStatus();
        }
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [isLocked]);

  useEffect(() => {
    if (biometricEnabled && biometricAvailable && !isLocked) {
      handleBiometric();
    }
  }, [biometricEnabled, biometricAvailable]);

  const handleLogin = async () => {
    if (!password) {
      Alert.alert(t('common.error'), t('auth.passwordRequired'));
      return;
    }

    setIsLoading(true);
    const success = await verifyPassword(password);
    setIsLoading(false);

    if (success) {
      router.replace('/(tabs)');
    } else {
      setPassword('');
      if (checkLockStatus()) {
        // locked
      } else {
        Alert.alert(t('common.error'), t('auth.passwordWrong'));
      }
    }
  };

  const handleBiometric = async () => {
    const success = await authenticateWithBiometric();
    if (success) {
      router.replace('/(tabs)');
    }
  };

  const handleReset = () => {
    Alert.alert(
      t('auth.resetConfirm'),
      t('auth.resetWarning'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('auth.resetConfirm'),
          style: 'destructive',
          onPress: async () => {
            await deleteSecure(SECURE_KEYS.PASSWORD_HASH);
            await deleteSecure(SECURE_KEYS.ENCRYPTION_SALT);
            await deleteSecure(SECURE_KEYS.ENCRYPTION_KEY);
            await deleteSecure(SECURE_KEYS.BIOMETRIC_ENABLED);
            await clearAllData();
            Alert.alert(t('common.done'), t('auth.resetDone'));
          },
        },
      ]
    );
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return t('auth.lockTimer', { mins, secs });
  };

  if (isLocked) {
    return (
      <View style={{ flex: 1, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        <Text style={{ fontSize: 48, marginBottom: 24 }}>🔒</Text>
        <Text style={{ fontSize: 18, fontWeight: '600', color: '#1A1A1A', marginBottom: 8 }}>
          {t('auth.locked')}
        </Text>
        <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#F7931A' }}>
          {formatTime(remainingTime)}
        </Text>
        <Text style={{ fontSize: 14, color: '#666666', marginTop: 8 }}>
          {t('auth.retryAfter')}
        </Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1, backgroundColor: '#FFFFFF' }}
    >
      <View style={{ flex: 1, padding: 24, justifyContent: 'center' }}>
        <View style={{ alignItems: 'center', marginBottom: 48 }}>
          <Text style={{ fontSize: 48, marginBottom: 16 }}>🔐</Text>
          <Text style={{ fontSize: 28, fontWeight: 'bold', color: '#1A1A1A' }}>
            SYBA
          </Text>
          <Text style={{ fontSize: 12, color: '#9CA3AF', marginTop: 4 }}>
            Start Your Bitcoin Adoption
          </Text>
        </View>

        <View style={{ marginBottom: 24 }}>
          <Text style={{ fontSize: 16, color: '#1A1A1A', marginBottom: 8 }}>
            {t('auth.enterPassword')}
          </Text>

          <TextInput
            style={{
              borderWidth: 1,
              borderColor: '#E5E7EB',
              borderRadius: 8,
              padding: 16,
              fontSize: 16,
              color: '#1A1A1A',
            }}
            placeholder={t('auth.password')}
            placeholderTextColor="#9CA3AF"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            autoCapitalize="none"
            onSubmitEditing={handleLogin}
          />

          {failedAttempts > 0 && (
            <Text style={{ color: '#EF4444', fontSize: 12, marginTop: 8 }}>
              {t('auth.failCount', { count: failedAttempts })}
            </Text>
          )}
        </View>

        <TouchableOpacity
          style={{
            backgroundColor: '#F7931A',
            padding: 16,
            borderRadius: 8,
            alignItems: 'center',
            opacity: isLoading ? 0.7 : 1,
          }}
          onPress={handleLogin}
          disabled={isLoading}
        >
          <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '600' }}>
            {isLoading ? t('auth.loggingIn') : t('auth.login')}
          </Text>
        </TouchableOpacity>

        {biometricEnabled && biometricAvailable && (
          <>
            <View style={{ alignItems: 'center', marginVertical: 16 }}>
              <Text style={{ color: '#666666' }}>{t('common.or')}</Text>
            </View>

            <TouchableOpacity
              style={{
                borderWidth: 1,
                borderColor: '#E5E7EB',
                padding: 16,
                borderRadius: 8,
                alignItems: 'center',
                flexDirection: 'row',
                justifyContent: 'center',
              }}
              onPress={handleBiometric}
            >
              <Ionicons name="finger-print" size={24} color="#F7931A" />
              <Text style={{ marginLeft: 8, fontSize: 16, color: '#1A1A1A' }}>
                {t('auth.useBiometric')}
              </Text>
            </TouchableOpacity>
          </>
        )}

        {__DEV__ && (
          <TouchableOpacity
            style={{ marginTop: 32, alignItems: 'center' }}
            onPress={handleReset}
          >
            <Text style={{ color: '#EF4444', fontSize: 12 }}>
              {t('auth.resetData')}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}
