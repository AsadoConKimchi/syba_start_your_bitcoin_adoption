// Blink API 프록시 클라이언트
// Supabase Edge Function을 통해 Blink API 호출 (API 키 서버 보관)

import { supabase } from './supabase';

export interface LightningInvoice {
  paymentHash: string;
  paymentRequest: string;
  satoshis: number;
}

export type PaymentStatus = 'PENDING' | 'PAID' | 'EXPIRED';

// Edge Function 호출 헬퍼
async function callBlinkProxy<T>(
  action: string,
  params?: Record<string, unknown>
): Promise<T> {
  const { data, error } = await supabase.functions.invoke('blink-proxy', {
    body: { action, ...params },
  });

  if (error) {
    throw new Error(`Blink proxy error: ${error.message}`);
  }

  if (!data.success) {
    throw new Error(data.error || 'Unknown error');
  }

  return data.data;
}

// 지갑 정보 조회
export async function getWalletInfo() {
  return callBlinkProxy<Array<{
    id: string;
    walletCurrency: string;
    balance: number;
  }>>('getWalletInfo');
}

// Lightning Invoice 생성
export async function createLightningInvoice(
  amountSats: number,
  memo?: string
): Promise<LightningInvoice> {
  return callBlinkProxy<LightningInvoice>('createInvoice', {
    amountSats,
    memo,
  });
}

// 결제 상태 확인
export async function checkPaymentStatus(paymentRequest: string): Promise<PaymentStatus> {
  return callBlinkProxy<PaymentStatus>('checkPaymentStatus', {
    paymentRequest,
  });
}

// 폴링 방식으로 결제 대기
export async function waitForPayment(
  paymentRequest: string,
  onStatusChange?: (status: PaymentStatus) => void,
  maxWaitMs: number = 10 * 60 * 1000,
  pollIntervalMs: number = 3000
): Promise<boolean> {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    try {
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
    } catch (error) {
      console.error('[BlinkProxy] 상태 확인 실패:', error);
    }

    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
  }

  return false;
}
