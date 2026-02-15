import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Image,
  Dimensions,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../src/hooks/useTheme';
import { useAuthStore } from '../../src/stores/authStore';
import { useSubscriptionStore } from '../../src/stores/subscriptionStore';
import { deleteSecure, SECURE_KEYS } from '../../src/utils/encryption';
import { clearAllData } from '../../src/utils/storage';

export default function LoginScreen() {
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const { t } = useTranslation();
  const { theme } = useTheme();

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
    setProgress(0);
    const success = await verifyPassword(password, (p) => setProgress(p));
    setIsLoading(false);
    setProgress(0);

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
            // Supabase 세션 로그아웃 (구독 정보는 서버에 유지, 로컬만 해제)
            await useSubscriptionStore.getState().logout();
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
      <View style={{ flex: 1, backgroundColor: theme.background, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        <Image 
          source={require('../../assets/icon.png')} 
          style={{ 
            width: 72, 
            height: 72, 
            borderRadius: 16, 
            marginBottom: 16,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.1,
            shadowRadius: 4,
          }} 
        />
        <Text style={{ fontSize: 18, fontWeight: '600', color: theme.text, marginBottom: 8 }}>
          {t('auth.locked')}
        </Text>
        <Text style={{ fontSize: 24, fontWeight: 'bold', color: theme.primary }}>
          {formatTime(remainingTime)}
        </Text>
        <Text style={{ fontSize: 14, color: theme.textSecondary, marginTop: 8 }}>
          {t('auth.retryAfter')}
        </Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1, backgroundColor: theme.background }}
    >
      <View style={{ flex: 1, padding: 24, justifyContent: 'center' }}>
        <View style={{ alignItems: 'center', marginBottom: 48, paddingHorizontal: 20 }}>
          <Image 
            source={require('../../assets/icon.png')} 
            style={{ 
              width: 72, 
              height: 72, 
              borderRadius: 16, 
              marginBottom: 16,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.1,
              shadowRadius: 4,
            }} 
          />
          <Text style={{ fontSize: 28, fontWeight: 'bold', color: theme.text }}>
            SYBA
          </Text>
          <Text style={{ fontSize: 12, color: theme.textMuted, marginTop: 4, textAlign: 'center', flexShrink: 1 }} adjustsFontSizeToFit numberOfLines={2}>
            Start Your Bitcoin Adoption
          </Text>
        </View>

        <View style={{ marginBottom: 24 }}>
          <Text style={{ fontSize: 16, color: theme.text, marginBottom: 8 }}>
            {t('auth.enterPassword')}
          </Text>

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
            placeholder={t('auth.password')}
            placeholderTextColor={theme.placeholder}
            secureTextEntry
                textContentType="none"
                autoComplete="off"
            value={password}
            onChangeText={setPassword}
            autoCapitalize="none"
            onSubmitEditing={handleLogin}
          />

          {failedAttempts > 0 && (
            <Text style={{ color: theme.error, fontSize: 12, marginTop: 8 }}>
              {t('auth.failCount', { count: failedAttempts })}
            </Text>
          )}
        </View>

        {isLoading ? (
          <View>
            <View style={{
              height: 36,
              justifyContent: 'flex-end',
              alignItems: 'flex-start',
            }}>
              <Image
                source={require('../../assets/icon.png')}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  marginLeft: progress * (Dimensions.get('window').width - 48 - 32),
                }}
              />
            </View>
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
              🔓 {t('auth.decrypting')} {Math.round(progress * 100)}%
            </Text>
            </View>
          </View>
        ) : (
          <TouchableOpacity
            style={{
              backgroundColor: theme.primary,
              padding: 16,
              borderRadius: 8,
              alignItems: 'center',
            }}
            onPress={handleLogin}
          >
            <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '600' }}>
              {t('auth.login')}
            </Text>
          </TouchableOpacity>
        )}

        {biometricEnabled && biometricAvailable && (
          <>
            <View style={{ alignItems: 'center', marginVertical: 16 }}>
              <Text style={{ color: theme.textSecondary }}>{t('common.or')}</Text>
            </View>

            <TouchableOpacity
              style={{
                borderWidth: 1,
                borderColor: theme.border,
                padding: 16,
                borderRadius: 8,
                alignItems: 'center',
                flexDirection: 'row',
                justifyContent: 'center',
              }}
              onPress={handleBiometric}
            >
              <Ionicons name="finger-print" size={24} color={theme.primary} />
              <Text style={{ marginLeft: 8, fontSize: 16, color: theme.text }}>
                {t('auth.useBiometric')}
              </Text>
            </TouchableOpacity>
          </>
        )}

        <TouchableOpacity
          style={{ marginTop: 24, alignItems: 'center' }}
          onPress={() => Alert.alert(t('auth.forgotPasswordTitle'), t('auth.forgotPasswordMessage'))}
        >
          <Text style={{ color: theme.textSecondary, fontSize: 14 }}>
            {t('auth.forgotPassword')}
          </Text>
        </TouchableOpacity>

        {__DEV__ && (
          <TouchableOpacity
            style={{ marginTop: 32, alignItems: 'center' }}
            onPress={handleReset}
          >
            <Text style={{ color: theme.error, fontSize: 12 }}>
              {t('auth.resetData')}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}
