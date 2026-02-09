import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDailyReminderMessages, getSubscriptionMessages } from '../constants/messages';
import i18n from '../i18n';

// 알림 설정
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// 알림 ID 저장 키
const NOTIFICATION_IDS_KEY = 'SYBA_SCHEDULED_NOTIFICATIONS';

interface ScheduledNotification {
  id: string;
  type: 'subscription_expiry_7days' | 'subscription_expiry' | 'subscription_expired';
  scheduledAt: string;
}

// 알림 권한 요청
export async function requestNotificationPermissions(): Promise<boolean> {
  if (!Device.isDevice) {
    console.log('[Notifications] 시뮬레이터에서는 푸시 알림이 제한됩니다');
    return false;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('[Notifications] 알림 권한이 거부되었습니다');
    return false;
  }

  // Android 채널 설정
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('subscription', {
      name: i18n.t('notifications.channelName'),
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#F7931A',
    });
  }

  console.log('[Notifications] 알림 권한 허용됨');
  return true;
}

// 알림 권한 상태 확인
export async function checkNotificationPermissions(): Promise<boolean> {
  const { status } = await Notifications.getPermissionsAsync();
  return status === 'granted';
}

// 저장된 알림 ID 가져오기
async function getScheduledNotificationIds(): Promise<ScheduledNotification[]> {
  try {
    const data = await AsyncStorage.getItem(NOTIFICATION_IDS_KEY);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('[Notifications] 알림 ID 로드 실패:', error);
    return [];
  }
}

// 알림 ID 저장
async function saveScheduledNotificationId(notification: ScheduledNotification): Promise<void> {
  try {
    const existing = await getScheduledNotificationIds();
    const updated = [...existing.filter(n => n.type !== notification.type), notification];
    await AsyncStorage.setItem(NOTIFICATION_IDS_KEY, JSON.stringify(updated));
  } catch (error) {
    console.error('[Notifications] 알림 ID 저장 실패:', error);
  }
}

// 특정 타입의 알림 취소
async function cancelNotificationByType(type: ScheduledNotification['type']): Promise<void> {
  try {
    const notifications = await getScheduledNotificationIds();
    const target = notifications.find(n => n.type === type);

    if (target) {
      await Notifications.cancelScheduledNotificationAsync(target.id);
      const updated = notifications.filter(n => n.type !== type);
      await AsyncStorage.setItem(NOTIFICATION_IDS_KEY, JSON.stringify(updated));
    }
  } catch (error) {
    console.error('[Notifications] 알림 취소 실패:', error);
  }
}

// 모든 구독 관련 알림 취소
export async function cancelAllSubscriptionNotifications(): Promise<void> {
  try {
    const notifications = await getScheduledNotificationIds();

    for (const notification of notifications) {
      await Notifications.cancelScheduledNotificationAsync(notification.id);
    }

    await AsyncStorage.removeItem(NOTIFICATION_IDS_KEY);
    console.log('[Notifications] 모든 구독 알림 취소됨');
  } catch (error) {
    console.error('[Notifications] 알림 취소 실패:', error);
  }
}

// 구독 만료 알림 스케줄링
export async function scheduleSubscriptionExpiryNotifications(expiresAt: Date): Promise<void> {
  const hasPermission = await checkNotificationPermissions();
  if (!hasPermission) {
    console.log('[Notifications] 알림 권한 없음, 스케줄링 건너뜀');
    return;
  }

  // 기존 구독 알림 모두 취소
  await cancelAllSubscriptionNotifications();

  const now = new Date();
  const expiryTime = new Date(expiresAt);

  const subMessages = getSubscriptionMessages();

  // 7 days before expiry
  const sevenDaysBefore = new Date(expiryTime.getTime() - 7 * 24 * 60 * 60 * 1000);
  if (sevenDaysBefore > now) {
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: subMessages.sevenDaysBefore.title,
        body: subMessages.sevenDaysBefore.body,
        data: { type: 'subscription_expiry_7days' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: sevenDaysBefore,
        channelId: Platform.OS === 'android' ? 'subscription' : undefined,
      },
    });

    await saveScheduledNotificationId({
      id,
      type: 'subscription_expiry_7days',
      scheduledAt: sevenDaysBefore.toISOString(),
    });

    console.log('[Notifications] 7-day reminder scheduled:', sevenDaysBefore.toISOString());
  }

  // Expiry day notification
  const expiryDay = new Date(expiryTime);
  expiryDay.setHours(9, 0, 0, 0);
  if (expiryDay > now) {
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: subMessages.expiryDay.title,
        body: subMessages.expiryDay.body,
        data: { type: 'subscription_expiry' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: expiryDay,
        channelId: Platform.OS === 'android' ? 'subscription' : undefined,
      },
    });

    await saveScheduledNotificationId({
      id,
      type: 'subscription_expiry',
      scheduledAt: expiryDay.toISOString(),
    });

    console.log('[Notifications] Expiry day reminder scheduled:', expiryDay.toISOString());
  }

  // Post-expiry notification (1 day after)
  const oneDayAfter = new Date(expiryTime.getTime() + 24 * 60 * 60 * 1000);
  oneDayAfter.setHours(10, 0, 0, 0);
  if (oneDayAfter > now) {
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: subMessages.expired.title,
        body: subMessages.expired.body,
        data: { type: 'subscription_expired' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: oneDayAfter,
        channelId: Platform.OS === 'android' ? 'subscription' : undefined,
      },
    });

    await saveScheduledNotificationId({
      id,
      type: 'subscription_expired',
      scheduledAt: oneDayAfter.toISOString(),
    });

    console.log('[Notifications] Post-expiry reminder scheduled:', oneDayAfter.toISOString());
  }
}

// Test notification (instant)
export async function sendTestNotification(): Promise<void> {
  const hasPermission = await requestNotificationPermissions();
  if (!hasPermission) {
    console.log('[Notifications] Test notification failed: no permission');
    return;
  }

  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'SYBA',
      body: i18n.t('settings.testNotificationSent'),
      data: { type: 'test' },
    },
    trigger: null,
  });

  console.log('[Notifications] Test notification sent');
}

const DAILY_REMINDER_ID_KEY = 'SYBA_DAILY_REMINDER_ID';

// 매일 기록 알림 스케줄링
export async function scheduleDailyReminder(timeString: string): Promise<void> {
  const hasPermission = await checkNotificationPermissions();
  if (!hasPermission) {
    console.log('[Notifications] 알림 권한 없음, 매일 알림 스케줄링 건너뜀');
    return;
  }

  // 기존 알림 취소
  await cancelDailyReminder();

  // 시간 파싱 (HH:mm)
  const [hours, minutes] = timeString.split(':').map(Number);

  // Select message based on day of year for daily variety
  const today = new Date();
  const dayOfYear = Math.floor(
    (today.getTime() - new Date(today.getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24)
  );
  const messages = getDailyReminderMessages();
  const messageIndex = dayOfYear % messages.length;
  const message = messages[messageIndex];

  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: message.title,
      body: message.body,
      data: { type: 'daily_reminder' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: hours,
      minute: minutes,
      channelId: Platform.OS === 'android' ? 'subscription' : undefined,
    },
  });

  await AsyncStorage.setItem(DAILY_REMINDER_ID_KEY, id);
  console.log(`[Notifications] 매일 알림 스케줄됨: ${hours}:${minutes}`);
}

// 매일 기록 알림 취소
export async function cancelDailyReminder(): Promise<void> {
  try {
    const id = await AsyncStorage.getItem(DAILY_REMINDER_ID_KEY);
    if (id) {
      await Notifications.cancelScheduledNotificationAsync(id);
      await AsyncStorage.removeItem(DAILY_REMINDER_ID_KEY);
      console.log('[Notifications] 매일 알림 취소됨');
    }
  } catch (error) {
    console.error('[Notifications] 매일 알림 취소 실패:', error);
  }
}

// Random daily reminder (test)
export async function sendRandomDailyReminder(): Promise<void> {
  const hasPermission = await requestNotificationPermissions();
  if (!hasPermission) return;

  const messages = getDailyReminderMessages();
  const randomIndex = Math.floor(Math.random() * messages.length);
  const message = messages[randomIndex];

  await Notifications.scheduleNotificationAsync({
    content: {
      title: message.title,
      body: message.body,
      data: { type: 'daily_reminder_test' },
    },
    trigger: null,
  });
}

// 스케줄된 알림 목록 조회 (디버깅용)
export async function getScheduledNotifications(): Promise<Notifications.NotificationRequest[]> {
  return await Notifications.getAllScheduledNotificationsAsync();
}

// 월말 분석 알림 ID 저장 키
const MONTHLY_SUMMARY_ID_KEY = 'SYBA_MONTHLY_SUMMARY_ID';

// 이번 달 마지막 날 계산
function getLastDayOfMonth(): Date {
  const now = new Date();
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  lastDay.setHours(21, 0, 0, 0); // 오후 9시
  return lastDay;
}

// 월말 분석 알림 스케줄링
export async function scheduleMonthlySummaryNotification(): Promise<void> {
  const hasPermission = await checkNotificationPermissions();
  if (!hasPermission) {
    console.log('[Notifications] 알림 권한 없음, 월말 알림 스케줄링 건너뜀');
    return;
  }

  // 기존 알림 취소
  await cancelMonthlySummaryNotification();

  const lastDay = getLastDayOfMonth();
  const now = new Date();

  // 이미 지났으면 다음 달로
  if (lastDay <= now) {
    lastDay.setMonth(lastDay.getMonth() + 1);
    // 다음 달 마지막 날 재계산
    const nextLastDay = new Date(lastDay.getFullYear(), lastDay.getMonth() + 1, 0);
    nextLastDay.setHours(21, 0, 0, 0);
    lastDay.setTime(nextLastDay.getTime());
  }

  const month = lastDay.getMonth() + 1;

  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: i18n.t('notifications.monthlySummaryTitle', { month }),
      body: i18n.t('notifications.monthlySummaryBody'),
      data: { type: 'monthly_summary' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: lastDay,
      channelId: Platform.OS === 'android' ? 'subscription' : undefined,
    },
  });

  await AsyncStorage.setItem(MONTHLY_SUMMARY_ID_KEY, id);
  console.log(`[Notifications] 월말 알림 스케줄됨: ${lastDay.toISOString()}`);
}

// 월말 분석 알림 취소
export async function cancelMonthlySummaryNotification(): Promise<void> {
  try {
    const id = await AsyncStorage.getItem(MONTHLY_SUMMARY_ID_KEY);
    if (id) {
      await Notifications.cancelScheduledNotificationAsync(id);
      await AsyncStorage.removeItem(MONTHLY_SUMMARY_ID_KEY);
      console.log('[Notifications] 월말 알림 취소됨');
    }
  } catch (error) {
    console.error('[Notifications] 월말 알림 취소 실패:', error);
  }
}
