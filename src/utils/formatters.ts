import i18n from '../i18n';

const LOCALE_MAP: Record<string, string> = {
  ko: 'ko-KR',
  en: 'en-US',
  es: 'es-AR',
  ja: 'ja-JP',
};

function getLocale(): string {
  return LOCALE_MAP[i18n.language] || 'ko-KR';
}

// KRW currency format
export function formatKrw(amount: number): string {
  return new Intl.NumberFormat(getLocale(), {
    style: 'currency',
    currency: 'KRW',
  }).format(amount);
}

// KRW plain format (no currency symbol)
export function formatKrwPlain(amount: number): string {
  return new Intl.NumberFormat(getLocale()).format(amount);
}

// sats format
export function formatSats(amount: number): string {
  return new Intl.NumberFormat(getLocale()).format(amount) + ' sats';
}

// Date format (e.g., 2026년 1월 29일 / January 29, 2026)
export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat(getLocale(), {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);
}

// Short date format (e.g., 1월 29일 / Jan 29)
export function formatDateShort(dateString: string): string {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat(getLocale(), {
    month: 'short',
    day: 'numeric',
  }).format(date);
}

// Date + weekday (e.g., 1월 29일 수요일 / Wednesday, January 29)
export function formatDateWithDay(dateString: string): string {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat(getLocale(), {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(date);
}

// Percent format
export function formatPercent(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

// Percent format (no sign)
export function formatPercentPlain(value: number): string {
  return `${value.toFixed(1)}%`;
}

// Relative time format
export function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();

  const minutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMs / 3600000);
  const days = Math.floor(diffMs / 86400000);

  if (minutes < 1) return i18n.t('format.justNow');
  if (minutes < 60) return i18n.t('format.minutesAgo', { count: minutes });
  if (hours < 24) return i18n.t('format.hoursAgo', { count: hours });
  if (days < 7) return i18n.t('format.daysAgo', { count: days });

  return formatDateShort(dateString);
}

// Today date string (YYYY-MM-DD)
export function getTodayString(): string {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// Current year-month (YYYY-MM)
export function getCurrentYearMonth(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}
