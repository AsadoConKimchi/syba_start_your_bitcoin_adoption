import i18n from '../i18n';

// Daily reminder messages (i18n)
export function getDailyReminderMessages() {
  return Array.from({ length: 15 }, (_, i) => ({
    title: i18n.t(`notifications.reminder${i + 1}Title`),
    body: i18n.t(`notifications.reminder${i + 1}Body`),
  }));
}

// Legacy export for backward compatibility
export const DAILY_REMINDER_MESSAGES = Array.from({ length: 15 }, (_, i) => ({
  titleKey: `notifications.reminder${i + 1}Title`,
  bodyKey: `notifications.reminder${i + 1}Body`,
}));

// Subscription expiry notification messages (i18n)
export function getSubscriptionMessages() {
  return {
    sevenDaysBefore: {
      title: i18n.t('notifications.subExpiring7Days'),
      body: i18n.t('notifications.subExpiring7DaysBody'),
    },
    expiryDay: {
      title: i18n.t('notifications.subExpiringToday'),
      body: i18n.t('notifications.subExpiringTodayBody'),
    },
    expired: {
      title: i18n.t('notifications.subExpired'),
      body: i18n.t('notifications.subExpiredBody'),
    },
  };
}

// Legacy export for backward compatibility
export const SUBSCRIPTION_MESSAGES = {
  sevenDaysBefore: {
    titleKey: 'notifications.subExpiring7Days',
    bodyKey: 'notifications.subExpiring7DaysBody',
  },
  expiryDay: {
    titleKey: 'notifications.subExpiringToday',
    bodyKey: 'notifications.subExpiringTodayBody',
  },
  expired: {
    titleKey: 'notifications.subExpired',
    bodyKey: 'notifications.subExpiredBody',
  },
};
