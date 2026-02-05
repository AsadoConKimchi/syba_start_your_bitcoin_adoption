// Supabase 설정 (환경 변수에서 로드)
export const SUPABASE_CONFIG = {
  URL: process.env.EXPO_PUBLIC_SUPABASE_URL || '',
  ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '',
} as const;

// Blink API 설정 (환경 변수에서 로드)
export const BLINK_CONFIG = {
  API_URL: process.env.EXPO_PUBLIC_BLINK_API_URL || 'https://api.blink.sv/graphql',
  API_KEY: process.env.EXPO_PUBLIC_BLINK_API_KEY || '',
} as const;
