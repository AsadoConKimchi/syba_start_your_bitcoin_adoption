// Supabase Edge Function: Blink API 프록시
// Blink API 키를 서버에서만 관리하여 클라이언트 노출 방지

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const BLINK_API_URL = 'https://api.blink.sv/graphql';
const BLINK_API_KEY = Deno.env.get('BLINK_API_KEY') || '';

// --- CORS 설정: 허용된 오리진만 통과 ---
const ALLOWED_ORIGINS = [
  'http://localhost:8081',              // Expo 개발 서버
  'http://localhost:19006',             // Expo 웹
  'https://syba-sats.vercel.app',       // 프로덕션 웹 결제 페이지
];

function getCorsHeaders(origin: string | null): Record<string, string> {
  // 모바일 앱은 Origin 헤더를 보내지 않음 → 허용
  if (!origin) {
    return {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    };
  }
  // 허용된 오리진 → 해당 오리진 반환
  if (ALLOWED_ORIGINS.includes(origin)) {
    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    };
  }
  // 미허용 오리진 → CORS 헤더 없음 (브라우저가 차단)
  return {};
}

// --- Rate Limiting: IP별 요청 횟수 제한 ---
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;   // 1분
const RATE_LIMIT_MAX_REQUESTS = 10;        // 1분당 최대 10회

function isRateLimited(identifier: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(identifier);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(identifier, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  entry.count++;
  return entry.count > RATE_LIMIT_MAX_REQUESTS;
}

// 오래된 rate limit 항목 정리 (메모리 누수 방지)
function cleanupRateLimitMap() {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap) {
    if (now > entry.resetAt) {
      rateLimitMap.delete(key);
    }
  }
}

interface BlinkRequest {
  action: 'getWalletInfo' | 'createInvoice' | 'checkPaymentStatus';
  amountSats?: number;
  memo?: string;
  paymentRequest?: string;
}

async function blinkQuery(query: string, variables?: Record<string, unknown>) {
  const response = await fetch(BLINK_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY': BLINK_API_KEY,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`Blink API error: ${response.status}`);
  }

  const result = await response.json();
  if (result.errors) {
    throw new Error(result.errors[0]?.message || 'GraphQL error');
  }

  return result.data;
}

// 지갑 정보 조회
async function getWalletInfo() {
  const query = `
    query Me {
      me {
        defaultAccount {
          wallets {
            id
            walletCurrency
            balance
          }
        }
      }
    }
  `;
  const data = await blinkQuery(query);
  return data.me.defaultAccount.wallets;
}

// BTC 지갑 ID 조회
async function getBtcWalletId(): Promise<string> {
  const wallets = await getWalletInfo();
  const btcWallet = wallets.find((w: { walletCurrency: string }) => w.walletCurrency === 'BTC');
  if (!btcWallet) {
    throw new Error('BTC 지갑을 찾을 수 없습니다');
  }
  return btcWallet.id;
}

// Lightning Invoice 생성
async function createInvoice(amountSats: number, memo?: string) {
  const walletId = await getBtcWalletId();

  const query = `
    mutation LnInvoiceCreateOnBehalfOfRecipient($input: LnInvoiceCreateOnBehalfOfRecipientInput!) {
      lnInvoiceCreateOnBehalfOfRecipient(input: $input) {
        invoice {
          paymentHash
          paymentRequest
          paymentSecret
          satoshis
        }
        errors {
          message
        }
      }
    }
  `;

  const variables = {
    input: {
      recipientWalletId: walletId,
      amount: amountSats,
      memo: memo || 'SYBA 프리미엄 구독',
    },
  };

  const data = await blinkQuery(query, variables);
  const result = data.lnInvoiceCreateOnBehalfOfRecipient;

  if (result.errors?.length > 0) {
    throw new Error(result.errors[0].message);
  }

  return {
    paymentHash: result.invoice.paymentHash,
    paymentRequest: result.invoice.paymentRequest,
    satoshis: result.invoice.satoshis,
  };
}

// 결제 상태 확인
async function checkPaymentStatus(paymentRequest: string) {
  const query = `
    query LnInvoicePaymentStatus($input: LnInvoicePaymentStatusInput!) {
      lnInvoicePaymentStatus(input: $input) {
        status
        errors {
          message
        }
      }
    }
  `;

  const variables = {
    input: {
      paymentRequest,
    },
  };

  const data = await blinkQuery(query, variables);
  return data.lnInvoicePaymentStatus.status;
}

serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Rate limiting (IP 기반)
  const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('cf-connecting-ip')
    || 'unknown';

  if (isRateLimited(clientIp)) {
    cleanupRateLimitMap();
    return new Response(
      JSON.stringify({ success: false, error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' }),
      {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }

  try {
    if (!BLINK_API_KEY) {
      throw new Error('BLINK_API_KEY not configured');
    }

    const body: BlinkRequest = await req.json();
    let result;

    switch (body.action) {
      case 'getWalletInfo':
        result = await getWalletInfo();
        break;

      case 'createInvoice':
        if (!body.amountSats) {
          throw new Error('amountSats is required');
        }
        result = await createInvoice(body.amountSats, body.memo);
        break;

      case 'checkPaymentStatus':
        if (!body.paymentRequest) {
          throw new Error('paymentRequest is required');
        }
        result = await checkPaymentStatus(body.paymentRequest);
        break;

      default:
        throw new Error('Invalid action');
    }

    return new Response(JSON.stringify({ success: true, data: result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
