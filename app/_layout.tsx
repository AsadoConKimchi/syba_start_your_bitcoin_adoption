import 'react-native-get-random-values';  // UUID 폴리필 - 반드시 최상단에!
import '../global.css';
import '../src/i18n';
import { useEffect, useMemo } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../src/stores/authStore';
import { useSettingsStore } from '../src/stores/settingsStore';
import { usePriceStore } from '../src/stores/priceStore';
import { loadSavedLanguage } from '../src/i18n';
import { loadSavedRegion } from '../src/regions';
import { ErrorBoundary } from '../src/components/ErrorBoundary';

export default function RootLayout() {
  const { isLoading: authLoading, initialize: initAuth } = useAuthStore();
  const { loadSettings } = useSettingsStore();
  const { loadCachedPrices, fetchPrices } = usePriceStore();
  const { t } = useTranslation();

  const LOADING_KEYS = [
    'loading.msg1', 'loading.msg2', 'loading.msg3', 'loading.msg4',
    'loading.msg5', 'loading.msg6', 'loading.msg7', 'loading.msg8',
  ];

  const loadingKey = useMemo(
    () => LOADING_KEYS[Math.floor(Math.random() * LOADING_KEYS.length)],
    []
  );

  useEffect(() => {
    const init = async () => {
      await loadSavedLanguage();
      await loadSavedRegion();
      await initAuth();
      await loadSettings();
      await loadCachedPrices();
      fetchPrices().catch(() => {});
    };
    init();
  }, []);

  if (authLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' }}>
        <ActivityIndicator size="large" color="#F7931A" />
        <Text style={{ marginTop: 16, fontSize: 14, color: '#9CA3AF', textAlign: 'center', paddingHorizontal: 40 }}>
          {t(loadingKey)}
        </Text>
      </View>
    );
  }

  return (
    <ErrorBoundary>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="(modals)"
          options={{ presentation: 'modal' }}
        />
      </Stack>
    </ErrorBoundary>
  );
}
