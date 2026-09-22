import type { Timeframe } from "./constants";
import type { Candle } from "./types";

// data-api.binance.vision is Binance's own read-only public market-data
// mirror — the exact same spot klines as api.binance.com, but without the
// "b. Eligibility" geo-restriction that makes the regular API return HTTP
// 451 from a number of regions (this project's own hosting included).
// No API key needed; this is a public endpoint.
const BINANCE_KLINES_URL = "https://data-api.binance.vision/api/v3/klines";

// Binance's own interval codes for these four already match this app's
// Timeframe values exactly (unlike the previous Crypto.com integration,
// which needed "1D" capitalized) — no lookup table required.

// Every SUPPORTED_SYMBOLS coin trades against USDT on Binance directly
// (verified against Binance's exchangeInfo), so the pair is always just
// `${symbol}USDT` — no per-symbol pair table needed either.

type BinanceKline = [
  number, // open time, epoch milliseconds
  string, // open
  string, // high
  string, // low
  string, // close
  string, // volume
  number, // close time
  string, // quote asset volume
  number, // number of trades
  string, // taker buy base asset volume
  string, // taker buy quote asset volume
  string, // unused
];

// Default number of candles to fetch. Zone detection needs enough history
// that older (but still active) supply/demand zones aren't cut off the left
// edge of the chart; Binance's klines endpoint accepts up to 1000.
const DEFAULT_CANDLE_COUNT = 250;

/**
 * Fetches real OHLCV candles from Binance's public market-data mirror. See
 * BINANCE_KLINES_URL above for why this endpoint rather than api.binance.com.
 */
export async function getCandles(
  symbol: string,
  timeframe: Timeframe,
  limit: number = DEFAULT_CANDLE_COUNT
): Promise<Candle[]> {
  const pair = `${symbol.toUpperCase()}USDT`;

  const url = new URL(BINANCE_KLINES_URL);
  url.searchParams.set("symbol", pair);
  url.searchParams.set("interval", timeframe);
  url.searchParams.set("limit", String(limit));

  const res = await fetch(url, { next: { revalidate: 30 } });
  if (!res.ok) {
    throw new Error(`Binance API request failed (${res.status}): ${await res.text()}`);
  }

  const data = (await res.json()) as BinanceKline[];

  return data
    .map((k) => ({
      time: Math.floor(k[0] / 1000),
      open: Number(k[1]),
      high: Number(k[2]),
      low: Number(k[3]),
      close: Number(k[4]),
      volume: Number(k[5]),
    }))
    .sort((a, b) => a.time - b.time);
}
