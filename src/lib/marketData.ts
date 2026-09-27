import { TIMEFRAME_SECONDS, type Timeframe } from "./constants";
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

const BINANCE_MAX_LIMIT = 1000;

/**
 * Every candle from `startTimeSeconds` up to now (including the still-forming
 * one), paging through Binance's 1000-candle limit as needed — for the
 * signal engine, which must see an exact, fixed span of history rather than
 * "the latest N candles", so a decision doesn't depend on when it's made.
 */
export async function getCandlesSince(
  symbol: string,
  timeframe: Timeframe,
  startTimeSeconds: number
): Promise<Candle[]> {
  const pair = `${symbol.toUpperCase()}USDT`;
  const result: Candle[] = [];
  let startMs = Math.max(0, Math.floor(startTimeSeconds)) * 1000;

  for (let page = 0; page < 20; page++) {
    const url = new URL(BINANCE_KLINES_URL);
    url.searchParams.set("symbol", pair);
    url.searchParams.set("interval", timeframe);
    url.searchParams.set("startTime", String(startMs));
    // Only as many as can exist since startMs — Binance weighs requests by limit.
    const expected = Math.ceil((Date.now() - startMs) / (TIMEFRAME_SECONDS[timeframe] * 1000)) + 2;
    url.searchParams.set("limit", String(Math.max(1, Math.min(BINANCE_MAX_LIMIT, expected))));

    // Never cached: the engine decides which candles are closed by the
    // clock, so a cached response could present a candle that was still
    // forming when fetched as if it had closed at those prices.
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`Binance API request failed (${res.status}): ${await res.text()}`);
    }
    const data = (await res.json()) as BinanceKline[];
    for (const k of data) {
      result.push({
        time: Math.floor(k[0] / 1000),
        open: Number(k[1]),
        high: Number(k[2]),
        low: Number(k[3]),
        close: Number(k[4]),
        volume: Number(k[5]),
      });
    }
    if (data.length < BINANCE_MAX_LIMIT || data.length === 0) break;
    startMs = data[data.length - 1][0] + 1;
  }

  const byTime = new Map(result.map((c) => [c.time, c]));
  return [...byTime.values()].sort((a, b) => a.time - b.time);
}
