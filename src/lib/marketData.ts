import { SUPPORTED_SYMBOLS, type Timeframe } from "./constants";
import type { Candle } from "./types";

const CRYPTO_COM_CANDLESTICK_URL =
  "https://api.crypto.com/exchange/v1/public/get-candlestick";

// Crypto.com Exchange doesn't quote every coin in USDT — a good number of
// SUPPORTED_SYMBOLS only trade against USD there (see each entry's `pair`
// in constants.ts), so the instrument name has to come from that lookup
// rather than always assuming `${symbol}_USDT`.
const PAIR_BY_SYMBOL = new Map(SUPPORTED_SYMBOLS.map((s) => [s.symbol, s.pair]));

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

// Default number of candles to fetch. Zone detection needs enough history
// that older (but still active) supply/demand zones aren't cut off the left
// edge of the chart; Crypto.com's endpoint accepts up to 300.
const DEFAULT_CANDLE_COUNT = 250;

/**
 * Fetches real OHLCV candles from Crypto.com Exchange's public market-data
 * API. This is a public endpoint — no API key or signature required, so
 * nothing is read from process.env here. If an authenticated Crypto.com
 * endpoint is needed later (e.g. account/trading data), read the key from
 * process.env.CRYPTO_COM_API_KEY at call time — never hardcode it.
 */
export async function getCandles(
  symbol: string,
  timeframe: Timeframe,
  limit: number = DEFAULT_CANDLE_COUNT
): Promise<Candle[]> {
  const pair = PAIR_BY_SYMBOL.get(symbol.toUpperCase()) ?? `${symbol.toUpperCase()}_USDT`;

  const url = new URL(CRYPTO_COM_CANDLESTICK_URL);
  url.searchParams.set("instrument_name", pair);
  url.searchParams.set("timeframe", TIMEFRAME_TO_CRYPTO_COM[timeframe]);
  url.searchParams.set("count", String(limit));

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

