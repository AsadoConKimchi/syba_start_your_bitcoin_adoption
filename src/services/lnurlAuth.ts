import * as Crypto from 'expo-crypto';
import { supabase } from './supabase';
import { SUPABASE_CONFIG } from '../constants/supabase';

// Bech32 인코딩 (LNURL용)
const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

function bech32Polymod(values: number[]): number {
  const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const v of values) {
    const b = chk >> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) {
      if ((b >> i) & 1) chk ^= GEN[i];
    }
  }
  return chk;
}

function bech32HrpExpand(hrp: string): number[] {
  const ret: number[] = [];
  for (let i = 0; i < hrp.length; i++) {
    ret.push(hrp.charCodeAt(i) >> 5);
  }
  ret.push(0);
  for (let i = 0; i < hrp.length; i++) {
    ret.push(hrp.charCodeAt(i) & 31);
  }
  return ret;
}

function bech32CreateChecksum(hrp: string, data: number[]): number[] {
  const values = bech32HrpExpand(hrp).concat(data).concat([0, 0, 0, 0, 0, 0]);
  const polymod = bech32Polymod(values) ^ 1;
  const ret: number[] = [];
  for (let i = 0; i < 6; i++) {
    ret.push((polymod >> (5 * (5 - i))) & 31);
  }
  return ret;
}

function convertBits(data: number[], fromBits: number, toBits: number, pad: boolean): number[] {
  let acc = 0;
  let bits = 0;
  const ret: number[] = [];
  const maxv = (1 << toBits) - 1;
  for (const value of data) {
    acc = (acc << fromBits) | value;
    bits += fromBits;
    while (bits >= toBits) {
      bits -= toBits;
      ret.push((acc >> bits) & maxv);
    }
  }
  if (pad && bits > 0) {
    ret.push((acc << (toBits - bits)) & maxv);
  }
  return ret;
}

function encodeLnurl(url: string): string {
  const hrp = 'lnurl';
  const data = convertBits(
    Array.from(new TextEncoder().encode(url)),
    8,
    5,
    true
  );
  const checksum = bech32CreateChecksum(hrp, data);
  const combined = data.concat(checksum);
  let encoded = hrp + '1';
  for (const d of combined) {
    encoded += CHARSET[d];
  }
  return encoded.toUpperCase();
}

// LNURL-auth 세션 타입
export interface LnurlAuthSession {
  id: string;
  k1: string;
  status: 'pending' | 'authenticated' | 'expired';
  linking_key: string | null;
  created_at: string;
}

// 랜덤 hex 문자열 생성
async function generateRandomHex(bytes: number): Promise<string> {
  const randomBytes = await Crypto.getRandomBytesAsync(bytes);
  return Array.from(randomBytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// 마지막 에러 저장 (디버깅용)
export let lastLnurlError: string | null = null;

// LNURL-auth 세션 생성
export async function createLnurlAuthSession(): Promise<{
  sessionId: string;
  lnurl: string;
  lnurlEncoded: string;
  k1: string;
} | null> {
  lastLnurlError = null;

  try {
    // 환경 변수 확인
    if (!SUPABASE_CONFIG.URL || !SUPABASE_CONFIG.ANON_KEY) {
      lastLnurlError = `환경변수 누락 - URL: ${!!SUPABASE_CONFIG.URL}, KEY: ${!!SUPABASE_CONFIG.ANON_KEY}`;
      console.error('[LNURL]', lastLnurlError);
      return null;
    }

    // 32바이트 k1 challenge 생성
    let k1: string;
    try {
      k1 = await generateRandomHex(32);
    } catch (cryptoError) {
      lastLnurlError = `Crypto 에러: ${cryptoError}`;
      console.error('[LNURL]', lastLnurlError);
      return null;
    }

    // 세션 생성
    const { data, error } = await supabase
      .from('lnurl_auth_sessions')
      .insert({
        k1,
        status: 'pending',
      })
      .select()
      .single();

    if (error || !data) {
      lastLnurlError = `Supabase 에러: ${error?.message || 'Unknown'} (code: ${error?.code || 'N/A'})`;
      console.error('[LNURL]', lastLnurlError);
      console.error('[LNURL] 상세:', JSON.stringify(error, null, 2));
      return null;
    }

    // LNURL-auth URL 생성 (Vercel 프록시 사용)
    const LNURL_AUTH_PROXY = 'https://syba-citadel.vercel.app';
    const callbackUrl = `${LNURL_AUTH_PROXY}?tag=login&k1=${k1}&action=login`;

    // Bech32 인코딩된 LNURL (복사용)
    const lnurlEncoded = encodeLnurl(callbackUrl);

    return {
      sessionId: data.id,
      lnurl: callbackUrl, // QR 코드용 (raw URL)
      lnurlEncoded, // 복사용 (bech32)
      k1,
    };
  } catch (error) {
    console.error('LNURL-auth 세션 생성 에러:', error);
    return null;
  }
}

// 세션 상태 확인
export async function checkAuthSession(sessionId: string): Promise<LnurlAuthSession | null> {
  const { data, error } = await supabase
    .from('lnurl_auth_sessions')
    .select('*')
    .eq('id', sessionId)
    .single();

  if (error || !data) {
    return null;
  }

  return data;
}

// 인증 완료 대기 (폴링)
export async function waitForAuth(
  sessionId: string,
  onStatusChange?: (status: string) => void,
  maxWaitMs: number = 5 * 60 * 1000, // 5분
  pollIntervalMs: number = 2000 // 2초
): Promise<{ success: boolean; linkingKey?: string }> {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    const session = await checkAuthSession(sessionId);

    if (!session) {
      return { success: false };
    }

    if (onStatusChange) {
      onStatusChange(session.status);
    }

    if (session.status === 'authenticated' && session.linking_key) {
      return { success: true, linkingKey: session.linking_key };
    }

    if (session.status === 'expired') {
      return { success: false };
    }

    // 대기
    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
  }

  return { success: false }; // 타임아웃
}

// linking_key로 사용자 조회 또는 생성
export async function getOrCreateUserByLinkingKey(linkingKey: string): Promise<{
  id: string;
  linking_key: string;
  created_at: string;
} | null> {
  // 기존 사용자 확인
  const { data: existingUser } = await supabase
    .from('users')
    .select('*')
    .eq('linking_key', linkingKey)
    .single();

  if (existingUser) {
    return existingUser;
  }

  // 새 사용자 생성
  const { data: newUser, error } = await supabase
    .from('users')
    .insert({ linking_key: linkingKey })
    .select()
    .single();

  if (error) {
    console.error('사용자 생성 실패:', error);
    return null;
  }

  return newUser;
}
