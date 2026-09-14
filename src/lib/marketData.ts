import { SYMBOLS, type Symbol, type Timeframe } from "./constants";
import type { Candle } from "./types";

const CRYPTO_COM_CANDLESTICK_URL =
  "https://api.crypto.com/exchange/v1/public/get-candlestick";

// Crypto.com's public candlestick endpoint uses its own timeframe codes.
// Day candles are capitalized ("1D"); everything else matches our UI values.
const TIMEFRAME_TO_CRYPTO_COM: Record<Timeframe, string> = {
  "15m": "15m",
  "1h": "1h",
  "4h": "4h",
  "1d": "1D",
};

interface CryptoComCandle {
  o: string; // open
  h: string; // high
  l: string; // low
  c: string; // close
  v: string; // volume
  t: number; // start time, epoch milliseconds
}

interface CryptoComCandlestickResponse {
  code: number;
  result: {
    instrument_name: string;
    interval: string;
    data: CryptoComCandle[];
  };
}

/**
 * Fetches real OHLCV candles from Crypto.com Exchange's public market-data
 * API. This is a public endpoint — no API key or signature required, so
 * nothing is read from process.env here. If an authenticated Crypto.com
 * endpoint is needed later (e.g. account/trading data), read the key from
 * process.env.CRYPTO_COM_API_KEY at call time — never hardcode it.
 */
export async function getCandles(
  symbol: Symbol,
  timeframe: Timeframe
): Promise<Candle[]> {
  const info = SYMBOLS.find((s) => s.symbol === symbol);
  if (!info) {
    throw new Error(`Unknown symbol: ${symbol}`);
  }

  const url = new URL(CRYPTO_COM_CANDLESTICK_URL);
  url.searchParams.set("instrument_name", info.pair);
  url.searchParams.set("timeframe", TIMEFRAME_TO_CRYPTO_COM[timeframe]);

  const res = await fetch(url, { next: { revalidate: 30 } });
  if (!res.ok) {
    throw new Error(
      `Crypto.com API request failed (${res.status}): ${await res.text()}`
    );
  }

  const json = (await res.json()) as CryptoComCandlestickResponse;
  if (json.code !== 0) {
    throw new Error(`Crypto.com API returned error code ${json.code}`);
  }

  return json.result.data
    .map((c) => ({
      time: Math.floor(c.t / 1000),
      open: Number(c.o),
      high: Number(c.h),
      low: Number(c.l),
      close: Number(c.c),
      volume: Number(c.v),
    }))
    .sort((a, b) => a.time - b.time);
}
