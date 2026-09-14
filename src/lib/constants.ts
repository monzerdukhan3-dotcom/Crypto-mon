/** A ticker symbol, e.g. "BTC". The tradable set is fetched dynamically — see /api/symbols. */
export type Symbol = string;

export interface SymbolInfo {
  symbol: Symbol;
  label: string;
  /** Trading pair as used by most exchange APIs, e.g. BTC_USDT */
  pair: string;
}

/**
 * Pinned quick-access defaults, always shown first in the dropdown and kept
 * in the top-30 list regardless of their current volume ranking. Used as an
 * immediate fallback before /api/symbols' dynamic list has loaded.
 */
export const DEFAULT_SYMBOLS: SymbolInfo[] = [
  { symbol: "BTC", label: "Bitcoin (BTC)", pair: "BTC_USDT" },
  { symbol: "ETH", label: "Ethereum (ETH)", pair: "ETH_USDT" },
  { symbol: "WLD", label: "Worldcoin (WLD)", pair: "WLD_USDT" },
];

export type Timeframe = "15m" | "1h" | "4h" | "1d";

export interface TimeframeInfo {
  value: Timeframe;
  label: string;
}

export const TIMEFRAMES: TimeframeInfo[] = [
  { value: "15m", label: "15 Minutes" },
  { value: "1h", label: "1 Hour" },
  { value: "4h", label: "4 Hours" },
  { value: "1d", label: "1 Day" },
];
