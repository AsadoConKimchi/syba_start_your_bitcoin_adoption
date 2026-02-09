import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';

import ko from './locales/ko.json';
import en from './locales/en.json';
import es from './locales/es.json';
import ja from './locales/ja.json';

const LANGUAGE_KEY = 'app_language';

export const SUPPORTED_LANGUAGES = {
  ko: { name: '한국어', nativeName: '한국어', flag: '🇰🇷' },
  en: { name: 'English', nativeName: 'English', flag: '🇺🇸' },
  es: { name: 'Español', nativeName: 'Español', flag: '🇦🇷' },
  ja: { name: '日本語', nativeName: '日本語', flag: '🇯🇵' },
} as const;

export type SupportedLanguage = keyof typeof SUPPORTED_LANGUAGES;

const resources = {
  ko: { translation: ko },
  en: { translation: en },
  es: { translation: es },
  ja: { translation: ja },
};

// Detect device language and map to supported language
function getDeviceLanguage(): SupportedLanguage {
  const locales = Localization.getLocales();
  if (locales.length > 0) {
    const lang = locales[0].languageCode;
    if (lang && lang in SUPPORTED_LANGUAGES) {
      return lang as SupportedLanguage;
    }
  }
  return 'ko'; // Default to Korean
}

// Initialize i18n
i18n.use(initReactI18next).init({
  resources,
  lng: getDeviceLanguage(),
  fallbackLng: 'ko',
  interpolation: {
    escapeValue: false,
  },
  react: {
    useSuspense: false,
  },
});

// Load saved language preference
export async function loadSavedLanguage(): Promise<void> {
  try {
    const savedLang = await AsyncStorage.getItem(LANGUAGE_KEY);
    if (savedLang && savedLang in SUPPORTED_LANGUAGES) {
      await i18n.changeLanguage(savedLang);
    }
  } catch (error) {
    console.error('Failed to load saved language:', error);
  }
}

// Change language and persist
export async function changeLanguage(lang: SupportedLanguage): Promise<void> {
  await i18n.changeLanguage(lang);
  try {
    await AsyncStorage.setItem(LANGUAGE_KEY, lang);
  } catch (error) {
    console.error('Failed to save language:', error);
  }
}

export default i18n;
