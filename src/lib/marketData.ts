import type { SymbolInfo } from "./constants";
import type { Timeframe } from "./constants";
import type { Candle } from "./types";

const CRYPTO_COM_CANDLESTICK_URL =
  "https://api.crypto.com/exchange/v1/public/get-candlestick";
const CRYPTO_COM_TICKERS_URL = "https://api.crypto.com/exchange/v1/public/get-tickers";

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
const DEFAULT_CANDLE_COUNT = 200;

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
  const pair = `${symbol.toUpperCase()}_USDT`;

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

interface CryptoComTicker {
  i: string; // instrument name, e.g. "BTC_USDT"
  vv: string; // 24h volume value (quote currency, ~USD for *_USDT pairs)
}

interface CryptoComTickersResponse {
  code: number;
  result: { data: CryptoComTicker[] };
}

// Fiat/stablecoin-adjacent base currencies to exclude from a "top coins" list.
const EXCLUDED_BASE_SYMBOLS = new Set(["USD", "EUR", "GBP", "AUD", "JPY", "CAD", "CHF"]);

/**
 * A best-effort exclusion list for an Islamic-finance-conscious "halal
 * coins" filter — NOT a certified religious ruling. There's no official API
 * or standardized service for Sharia-screening individual cryptocurrencies,
 * so this only excludes the clearest, least-disputed categories: coins
 * built around gambling/betting platforms, and pure-speculation meme coins
 * with no underlying utility. Everything else here is treated as a normal
 * crypto asset. Consult a qualified source for anything beyond that.
 */
const HALAL_EXCLUDED_SYMBOLS = new Set([
  // Gambling / betting platforms.
  "FUN", // FunFair — online casino platform
  "DICE",
  "WINK", // WINkLink — gambling-focused oracle/dApp ecosystem
  // Pure-speculation meme coins (no underlying utility beyond the joke).
  "DOGE",
  "SHIB",
  "PEPE",
  "BONK",
  "WIF",
  "FLOKI",
  "BOME",
  "TRUMP",
  "PUMP",
]);

/**
 * Fetches all USDT trading pairs from Crypto.com's public tickers endpoint
 * (also public, no API key) and ranks them by 24h quote volume — the closest
 * practical proxy to market activity/size this exchange API exposes (it
 * doesn't report market cap directly).
 */
export async function getTopSymbolsByVolume(limit = 30, halalOnly = true): Promise<SymbolInfo[]> {
  const res = await fetch(CRYPTO_COM_TICKERS_URL, { next: { revalidate: 300 } });
  if (!res.ok) {
    throw new Error(`Crypto.com tickers request failed (${res.status}): ${await res.text()}`);
  }

  const json = (await res.json()) as CryptoComTickersResponse;
  if (json.code !== 0) {
    throw new Error(`Crypto.com API returned error code ${json.code}`);
  }

  return json.result.data
    .filter((t) => t.i.endsWith("_USDT"))
    .filter((t) => !EXCLUDED_BASE_SYMBOLS.has(t.i.replace("_USDT", "")))
    .filter((t) => !halalOnly || !HALAL_EXCLUDED_SYMBOLS.has(t.i.replace("_USDT", "")))
    .map((t) => ({ symbol: t.i.replace("_USDT", ""), pair: t.i, volumeUsd: Number(t.vv) }))
    .sort((a, b) => b.volumeUsd - a.volumeUsd)
    .slice(0, limit)
    .map(({ symbol, pair }) => ({ symbol, label: symbol, pair }));
}
