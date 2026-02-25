import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import * as secp256k1 from 'https://esm.sh/@noble/secp256k1@1.7.1'

// Hex 문자열 형식 검증용 정규식
const HEX_REGEX = /^[0-9a-fA-F]+$/

/**
 * Hex string → Uint8Array 변환 (검증 포함)
 * 잘못된 hex 입력 시 예외 발생
 */
function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex
  if (clean.length % 2 !== 0) throw new Error('Invalid hex: odd length')
  if (!HEX_REGEX.test(clean)) throw new Error('Invalid hex: non-hex characters')

  const bytes = new Uint8Array(clean.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

/**
 * LNURL-auth 서명 검증 (LUD-04 spec)
 * - k1: 32바이트 hex 챌린지 (서버가 생성한 랜덤값)
 * - sig: DER 인코딩 후 hex 인코딩된 secp256k1 서명
 * - key: 33바이트 압축 공개키 (hex, 0x02 또는 0x03 시작)
 *
 * LUD-04 흐름:
 *   지갑: sig = hex(sign(hexToBytes(k1), linkingPrivKey))
 *   서버: verify(sig_bytes, k1_bytes, linkingPubKey)
 *
 * 주의: k1은 이미 32바이트 랜덤값이므로 메시지 해시로 직접 사용.
 * libsecp256k1의 secp256k1_ecdsa_sign(msg32, ...)는 32바이트를 직접 받음.
 * 별도의 SHA256 해싱 불필요.
 */
function verifyLnurlSignature(k1: string, sig: string, key: string): boolean {
  try {
    // 1. 입력값 형식 검증
    if (k1.length !== 64 || !HEX_REGEX.test(k1)) return false
    if (key.length !== 66 || !HEX_REGEX.test(key)) return false
    if (sig.length < 140 || sig.length > 146 || sig.length % 2 !== 0 || !HEX_REGEX.test(sig)) return false

    // 2. 압축 공개키 접두사 검증 (02 또는 03이어야 함)
    const keyPrefix = key.slice(0, 2)
    if (keyPrefix !== '02' && keyPrefix !== '03') return false

    // 3. Hex → Bytes 변환
    const k1Bytes = hexToBytes(k1)
    const sigBytes = hexToBytes(sig)
    const pubkeyBytes = hexToBytes(key)

    // 4. DER 서명 파싱
    const signature = secp256k1.Signature.fromDER(sigBytes)

    // 5. secp256k1 서명 검증
    // noble/secp256k1 v1.x: verify(sig, msgHash, pubkey)
    // k1(32바이트)을 메시지 해시로 직접 사용 (LUD-04 스펙)
    return secp256k1.verify(signature, k1Bytes, pubkeyBytes)
  } catch (error) {
    console.error('Signature verification failed:', error instanceof Error ? error.message : 'unknown')
    return false
  }
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const k1 = url.searchParams.get('k1')
    const sig = url.searchParams.get('sig')
    const key = url.searchParams.get('key')

    console.log('Request params:', { k1, sig: sig?.substring(0, 20), key: key?.substring(0, 20) })

    // 초기 요청 (QR 스캔 시) - sig, key 없이 k1만 있는 경우
    if (k1 && !sig && !key) {
      // 환경변수에서 callback URL 가져오기 (커스텀 도메인 지원)
      const callbackUrl = Deno.env.get('LNURL_CALLBACK_URL') || `${url.origin}${url.pathname}`

      const response = {
        tag: 'login',
        k1: k1,
        callback: callbackUrl,
        action: 'login',
      }
      console.log('Initial request response:', response)
      return new Response(JSON.stringify(response), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 서명 검증 요청
    if (!k1 || !sig || !key) {
      return new Response(JSON.stringify({ status: 'ERROR', reason: 'Missing parameters' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 세션 확인
    const { data: session, error: sessionError } = await supabase
      .from('lnurl_auth_sessions')
      .select('*')
      .eq('k1', k1)
      .single()

    console.log('Session lookup:', { session, sessionError })

    if (sessionError || !session) {
      return new Response(JSON.stringify({ status: 'ERROR', reason: 'Session not found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (session.status !== 'pending') {
      return new Response(JSON.stringify({ status: 'ERROR', reason: 'Session already used' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // secp256k1 서명 검증 (LNURL-auth LUD-04 spec)
    // k1은 32바이트 챌린지(hex), 지갑이 linkingPrivKey로 서명한 것을 검증
    const isValidSignature = verifyLnurlSignature(k1, sig, key)

    if (!isValidSignature) {
      console.error('Signature verification failed for k1:', k1.substring(0, 16))
      return new Response(JSON.stringify({ status: 'ERROR', reason: 'Signature verification failed' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log('Signature verified successfully')

    // 세션 업데이트
    const { error: updateError } = await supabase
      .from('lnurl_auth_sessions')
      .update({ status: 'authenticated', linking_key: key })
      .eq('k1', k1)

    console.log('Update result:', { updateError })

    if (updateError) {
      return new Response(JSON.stringify({ status: 'ERROR', reason: 'Failed to update session' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ status: 'OK' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('Error:', error)
    return new Response(JSON.stringify({ status: 'ERROR', reason: String(error) }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
