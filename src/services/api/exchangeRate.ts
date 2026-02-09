const API_URL = 'https://api.exchangerate-api.com/v4/latest/USD';

interface ExchangeRateResponse {
  rates: { KRW: number };
}

// USD/KRW 환율
export async function fetchUsdKrw(): Promise<number> {
  const response = await fetch(API_URL);

  if (!response.ok) {
    throw new Error('Exchange rate API error');
  }

  const data: ExchangeRateResponse = await response.json();
  return data.rates.KRW;
}
