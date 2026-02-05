/**
 * @deprecated 이 파일은 더 이상 사용되지 않습니다.
 * blinkProxy.ts를 사용하세요. (Supabase Edge Function 프록시)
 * API 키가 앱에 포함되지 않도록 Edge Function을 통해 Blink API를 호출합니다.
 */

// 레거시 코드 - 참조용으로 유지
const BLINK_CONFIG = {
  API_URL: 'https://api.blink.sv/graphql',
  API_KEY: '', // 더 이상 사용하지 않음
};

// WebSocket URL
const BLINK_WS_URL = 'wss://ws.blink.sv/graphql';

// GraphQL 요청 헬퍼
async function blinkQuery<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const response = await fetch(BLINK_CONFIG.API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY': BLINK_CONFIG.API_KEY,
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
interface WalletInfo {
  me: {
    defaultAccount: {
      wallets: Array<{
        id: string;
        walletCurrency: string;
        balance: number;
      }>;
    };
  };
}

export async function getWalletInfo(): Promise<WalletInfo['me']['defaultAccount']['wallets']> {
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

  const data = await blinkQuery<WalletInfo>(query);
  return data.me.defaultAccount.wallets;
}

// BTC 지갑 ID 조회
export async function getBtcWalletId(): Promise<string> {
  const wallets = await getWalletInfo();
  const btcWallet = wallets.find(w => w.walletCurrency === 'BTC');
  if (!btcWallet) {
    throw new Error('BTC 지갑을 찾을 수 없습니다');
  }
  return btcWallet.id;
}

// Lightning Invoice 생성
interface CreateInvoiceResponse {
  lnInvoiceCreateOnBehalfOfRecipient: {
    invoice: {
      paymentHash: string;
      paymentRequest: string;
      paymentSecret: string;
      satoshis: number;
    };
    errors: Array<{ message: string }>;
  };
}

export interface LightningInvoice {
  paymentHash: string;
  paymentRequest: string; // bolt11 invoice (QR 코드로 표시)
  satoshis: number;
}

export async function createLightningInvoice(
  amountSats: number,
  memo?: string
): Promise<LightningInvoice> {
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

  const data = await blinkQuery<CreateInvoiceResponse>(query, variables);
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
interface InvoiceStatusResponse {
  lnInvoicePaymentStatus: {
    status: 'PENDING' | 'PAID' | 'EXPIRED';
    errors: Array<{ message: string }>;
  };
}

export type PaymentStatus = 'PENDING' | 'PAID' | 'EXPIRED';

export async function checkPaymentStatus(paymentRequest: string): Promise<PaymentStatus> {
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

  const data = await blinkQuery<InvoiceStatusResponse>(query, variables);
  return data.lnInvoicePaymentStatus.status;
}

// WebSocket으로 결제 상태 실시간 구독
export function subscribeToPaymentStatus(
  paymentRequest: string,
  onStatusChange: (status: PaymentStatus) => void,
  onError?: (error: Error) => void
): () => void {
  let ws: WebSocket | null = null;
  let isCleanedUp = false;

  const connect = () => {
    if (isCleanedUp) return;

    ws = new WebSocket(BLINK_WS_URL, 'graphql-transport-ws');

    ws.onopen = () => {
      console.log('[Blink WS] 연결됨');
      // 인증
      ws?.send(JSON.stringify({
        type: 'connection_init',
        payload: {
          'X-API-KEY': BLINK_CONFIG.API_KEY,
        },
      }));
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        console.log('[Blink WS] 메시지:', message.type);

        if (message.type === 'connection_ack') {
          // 연결 확인 후 구독 시작
          ws?.send(JSON.stringify({
            id: '1',
            type: 'subscribe',
            payload: {
              query: `subscription LnInvoicePaymentStatus($input: LnInvoicePaymentStatusInput!) {
                lnInvoicePaymentStatus(input: $input) {
                  status
                  errors {
                    message
                  }
                }
              }`,
              variables: {
                input: {
                  paymentRequest,
                },
              },
            },
          }));
        }

        if (message.type === 'next' && message.payload?.data?.lnInvoicePaymentStatus) {
          const status = message.payload.data.lnInvoicePaymentStatus.status as PaymentStatus;
          console.log('[Blink WS] 결제 상태:', status);
          onStatusChange(status);

          // PAID 또는 EXPIRED면 구독 종료
          if (status === 'PAID' || status === 'EXPIRED') {
            ws?.close();
          }
        }

        if (message.type === 'error') {
          console.error('[Blink WS] 에러:', message.payload);
          onError?.(new Error(message.payload?.errors?.[0]?.message || 'WebSocket error'));
        }
      } catch (error) {
        console.error('[Blink WS] 메시지 파싱 에러:', error);
      }
    };

    ws.onerror = (error) => {
      console.error('[Blink WS] 연결 에러:', error);
      onError?.(new Error('WebSocket connection error'));
    };

    ws.onclose = () => {
      console.log('[Blink WS] 연결 종료');
      // 비정상 종료 시 재연결 (cleanup되지 않은 경우)
      if (!isCleanedUp) {
        setTimeout(connect, 3000);
      }
    };
  };

  connect();

  // cleanup 함수 반환
  return () => {
    isCleanedUp = true;
    if (ws) {
      ws.close();
      ws = null;
    }
  };
}

// 폴링 방식 (fallback)
export async function waitForPaymentPolling(
  paymentRequest: string,
  onStatusChange?: (status: PaymentStatus) => void,
  maxWaitMs: number = 10 * 60 * 1000,
  pollIntervalMs: number = 3000
): Promise<boolean> {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    const status = await checkPaymentStatus(paymentRequest);

    if (onStatusChange) {
      onStatusChange(status);
    }

    if (status === 'PAID') {
      return true;
    }

    if (status === 'EXPIRED') {
      return false;
    }

    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
  }

  return false;
}
