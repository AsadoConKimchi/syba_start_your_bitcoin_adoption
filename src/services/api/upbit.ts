const UPBIT_BASE_URL = 'https://api.upbit.com/v1';

interface UpbitTicker {
  market: string;
  trade_price: number;
}

interface UpbitCandle {
  market: string;
  candle_date_time_kst: string;
  trade_price: number;
}

// 현재 BTC/KRW 시세
export async function fetchCurrentBtcKrw(): Promise<number> {
  const response = await fetch(`${UPBIT_BASE_URL}/ticker?markets=KRW-BTC`);

  if (!response.ok) {
    throw new Error('Upbit API error');
  }

  const data: UpbitTicker[] = await response.json();
  return data[0].trade_price;
}

// 특정 날짜 BTC/KRW 종가
export async function fetchHistoricalBtcPrice(date: string): Promise<number> {
  // date: "2026-01-03" → "2026-01-03T23:59:59"
  const to = `${date}T23:59:59`;

  const response = await fetch(
    `${UPBIT_BASE_URL}/candles/days?market=KRW-BTC&to=${to}&count=1`
  );

  if (!response.ok) {
    throw new Error('Upbit API error');
  }

  const data: UpbitCandle[] = await response.json();

  if (data.length === 0) {
    throw new Error('No price data for the given date');
  }

  return data[0].trade_price;
}

// 최근 N일간 BTC/KRW 일봉 데이터 (날짜 → 종가 맵)
export async function fetchDailyPrices(days: number = 200): Promise<Map<string, number>> {
  const response = await fetch(
    `${UPBIT_BASE_URL}/candles/days?market=KRW-BTC&count=${days}`
  );

  if (!response.ok) {
    throw new Error('Upbit API error');
  }

  const data: UpbitCandle[] = await response.json();

  // 날짜 → 종가 맵 생성
  const priceMap = new Map<string, number>();
  for (const candle of data) {
    // "2026-01-15T00:00:00" → "2026-01-15"
    const date = candle.candle_date_time_kst.split('T')[0];
    priceMap.set(date, candle.trade_price);
  }

  return priceMap;
}
