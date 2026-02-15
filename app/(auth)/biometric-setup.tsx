import { View, Text, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../src/hooks/useTheme';
import { useAuthStore } from '../../src/stores/authStore';

export default function BiometricSetupScreen() {
  const { enableBiometric, biometricType } = useAuthStore();
  const { t } = useTranslation();
  const { theme } = useTheme();

  const handleEnable = async () => {
    await enableBiometric();
    router.replace('/(tabs)');
  };

  const handleSkip = () => {
    router.replace('/(tabs)');
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.background, padding: 24, justifyContent: 'center' }}>
      <View style={{ alignItems: 'center', marginBottom: 32 }}>
        <View
          style={{
            width: 100,
            height: 100,
            borderRadius: 50,
            backgroundColor: theme.warningBanner,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name={biometricType === 'faceid' ? 'scan' : 'finger-print'} size={48} color={theme.primary} />
        </View>
      </View>

      <Text
        style={{
          fontSize: 24,
          fontWeight: 'bold',
          color: theme.text,
          textAlign: 'center',
          marginBottom: 12,
        }}
      >
        {t('auth.biometricTitle')}
      </Text>

      <Text
        style={{
          fontSize: 16,
          color: theme.textSecondary,
          textAlign: 'center',
          marginBottom: 48,
          lineHeight: 24,
        }}
      >
        {t('auth.biometricDescription')}
      </Text>

      <TouchableOpacity
        style={{
          backgroundColor: theme.primary,
          padding: 16,
          borderRadius: 8,
          alignItems: 'center',
          marginBottom: 12,
        }}
        onPress={handleEnable}
      >
        <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '600' }}>
          {t('auth.enableBiometric')}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={{
          borderWidth: 1,
          borderColor: theme.border,
          padding: 16,
          borderRadius: 8,
          alignItems: 'center',
        }}
        onPress={handleSkip}
      >
        <Text style={{ color: theme.textSecondary, fontSize: 16 }}>
          {t('auth.later')}
        </Text>
      </TouchableOpacity>
    </View>
  );
}
