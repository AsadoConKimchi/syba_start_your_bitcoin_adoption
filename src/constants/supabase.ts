// Supabase 설정 (환경 변수에서 로드)
export const SUPABASE_CONFIG = {
  URL: process.env.EXPO_PUBLIC_SUPABASE_URL || '',
  ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '',
} as const;

// Blink API 설정은 Supabase Edge Function에서 관리
// API 키가 앱에 포함되지 않도록 Edge Function 프록시 사용
// Supabase 대시보드 > Edge Functions > Secrets에서 BLINK_API_KEY 설정 필요
