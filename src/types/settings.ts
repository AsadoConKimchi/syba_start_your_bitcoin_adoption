import { AutoLockTime } from '../constants/config';

export interface PriceCache {
  btcKrw: number;
  btcUsdt: number;
  usdKrw: number;
  kimchiPremium: number;
  updatedAt: string;
}

export type DisplayUnit = 'BTC' | 'KRW';

export interface AppSettings {
  autoLockTime: AutoLockTime;
  biometricEnabled: boolean;
  dailyReminderEnabled: boolean;
  dailyReminderTime: string; // "HH:mm"
  paymentReminderEnabled: boolean;
  monthlyReportEnabled: boolean;
  subscriptionNotificationEnabled: boolean;
  theme: 'light' | 'dark' | 'system';
  language: 'ko' | 'en' | 'es' | 'ja';
  region: 'kr' | 'us' | 'ar' | 'jp';
  lastPriceCache: PriceCache | null;
  userName: string | null;
  displayUnit: DisplayUnit;
}

export const DEFAULT_SETTINGS: AppSettings = {
  autoLockTime: '5min',
  biometricEnabled: false,
  dailyReminderEnabled: true,
  dailyReminderTime: '21:00',
  paymentReminderEnabled: true,
  monthlyReportEnabled: true,
  subscriptionNotificationEnabled: true,
  theme: 'light',
  language: 'ko',
  region: 'kr',
  lastPriceCache: null,
  userName: null,
  displayUnit: 'BTC',
};
