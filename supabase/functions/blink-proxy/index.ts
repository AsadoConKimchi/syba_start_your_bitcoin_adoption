// Supabase Edge Function: Blink API 프록시
// Blink API 키를 서버에서만 관리하여 클라이언트 노출 방지

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const BLINK_API_URL = 'https://api.blink.sv/graphql';
const BLINK_API_KEY = Deno.env.get('BLINK_API_KEY') || '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
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
