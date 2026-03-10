export interface Theme {
  // Backgrounds
  background: string;
  backgroundSecondary: string;
  backgroundTertiary: string;

  // Text
  text: string;
  textSecondary: string;
  textMuted: string;
  textInverse: string;

  // Borders
  border: string;
  borderLight: string;

  // Input
  inputBackground: string;
  inputBorder: string;
  inputText: string;
  placeholder: string;

  // Modal
  modalOverlay: string;
  modalBackground: string;

  // Status
  success: string;
  error: string;
  warning: string;
  info: string;

  // Brand
  primary: string;
  primaryDark: string;
  primaryLight: string;
  primaryText: string;
  bitcoin: string;
  lightning: string;

  // Tab bar
  tabBarBackground: string;
  tabBarBorder: string;
  tabBarActive: string;
  tabBarInactive: string;

  // Chart
  chartBackground: string;
  chartGridLine: string;
  chartLabelColor: string;

  // Toggle
  toggleTrack: string;
  toggleActiveKrw: string;
  switchTrackOn: string;

  // Banners
  warningBanner: string;
  warningBannerText: string;
  warningBannerSubtext: string;
  errorBanner: string;
  errorBannerBorder: string;
  infoBanner: string;
  infoBannerText: string;
  infoBannerSubtext: string;

  // Quick action buttons
  expenseButtonBg: string;
  incomeButtonBg: string;

  // Price banner
  priceBannerBg: string;
  priceBannerText: string;
  offlineBannerBg: string;
  offlineBannerText: string;
}

export const lightTheme: Theme = {
  background: '#FFFFFF',
  backgroundSecondary: '#F9FAFB',
  backgroundTertiary: '#F3F4F6',

  text: '#1A1A1A',
  textSecondary: '#666666',
  textMuted: '#9CA3AF',
  textInverse: '#FFFFFF',

  border: '#E5E7EB',
  borderLight: '#F3F4F6',

  inputBackground: '#FFFFFF',
  inputBorder: '#E5E7EB',
  inputText: '#1A1A1A',
  placeholder: '#9CA3AF',

  modalOverlay: 'rgba(0,0,0,0.5)',
  modalBackground: '#FFFFFF',

  success: '#22C55E',
  error: '#EF4444',
  warning: '#F59E0B',
  info: '#3B82F6',

  primary: '#F7931A',
  primaryDark: '#E8850F',
  primaryLight: '#FFB347',
  primaryText: '#FFFFFF',
  bitcoin: '#F7931A',
  lightning: '#792DE4',

  tabBarBackground: '#FFFFFF',
  tabBarBorder: '#E5E7EB',
  tabBarActive: '#F7931A',
  tabBarInactive: '#9CA3AF',

  chartBackground: '#FFFFFF',
  chartGridLine: '#E5E7EB',
  chartLabelColor: '#666666',

  toggleTrack: '#E5E7EB',
  toggleActiveKrw: '#FFFFFF',
  switchTrackOn: '#F7931A',

  warningBanner: '#FEF3C7',
  warningBannerText: '#92400E',
  warningBannerSubtext: '#78716C',
  errorBanner: '#FEF2F2',
  errorBannerBorder: '#FECACA',
  infoBanner: '#F0F9FF',
  infoBannerText: '#0369A1',
  infoBannerSubtext: '#0C4A6E',

  expenseButtonBg: '#FEF2F2',
  incomeButtonBg: '#F0FDF4',

  priceBannerBg: '#FEF3C7',
  priceBannerText: '#92400E',
  offlineBannerBg: '#FEE2E2',
  offlineBannerText: '#991B1B',
};

export const darkTheme: Theme = {
  background: '#0F0F0F',
  backgroundSecondary: '#1A1A1A',
  backgroundTertiary: '#2A2A2A',

  text: '#F5F5F5',
  textSecondary: '#A0A0A0',
  textMuted: '#666666',
  textInverse: '#0F0F0F',

  border: '#333333',
  borderLight: '#252525',

  inputBackground: '#1A1A1A',
  inputBorder: '#333333',
  inputText: '#F5F5F5',
  placeholder: '#666666',

  modalOverlay: 'rgba(0,0,0,0.7)',
  modalBackground: '#1A1A1A',

  success: '#4ADE80',
  error: '#F87171',
  warning: '#FBBF24',
  info: '#60A5FA',

  primary: '#F7931A',
  primaryDark: '#E8850F',
  primaryLight: '#FFB347',
  primaryText: '#FFFFFF',
  bitcoin: '#F7931A',
  lightning: '#A855F7',

  tabBarBackground: '#0F0F0F',
  tabBarBorder: '#252525',
  tabBarActive: '#F7931A',
  tabBarInactive: '#666666',

  chartBackground: '#1A1A1A',
  chartGridLine: '#333333',
  chartLabelColor: '#A0A0A0',

  toggleTrack: '#333333',
  toggleActiveKrw: '#2A2A2A',
  switchTrackOn: '#F7931A',

  warningBanner: '#3D2E0A',
  warningBannerText: '#FBBF24',
  warningBannerSubtext: '#A0A0A0',
  errorBanner: '#3D1515',
  errorBannerBorder: '#5C2020',
  infoBanner: '#0C1929',
  infoBannerText: '#60A5FA',
  infoBannerSubtext: '#60A5FA',

  expenseButtonBg: '#2D1515',
  incomeButtonBg: '#152D15',

  priceBannerBg: '#3D2E0A',
  priceBannerText: '#FBBF24',
  offlineBannerBg: '#3D1515',
  offlineBannerText: '#F87171',
};
