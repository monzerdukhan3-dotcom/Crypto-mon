import { calculateATR } from "./indicators";
import type { Candle } from "./types";

export interface VolatilityCheck {
  isHigh: boolean;
  currentAtrPct: number;
  averageAtrPct: number;
}

/** Current volatility counts as "high" once it's this many times the dataset's own average. */
const HIGH_VOLATILITY_MULTIPLIER = 1.5;

/**
 * Flags when current volatility (ATR as a % of price) is running well above
 * this symbol's own recent average — a data-driven "is this unusually wild
 * right now" check rather than a fixed threshold, since normal volatility
 * varies a lot between coins.
 */
export function checkVolatility(candles: Candle[], atrPeriod = 14): VolatilityCheck | null {
  if (candles.length < atrPeriod + 1) return null;

  const atr = calculateATR(candles, atrPeriod);
  const atrPct: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (Number.isFinite(atr[i]) && candles[i].close > 0) {
      atrPct.push((atr[i] / candles[i].close) * 100);
    }
  }
  if (atrPct.length === 0) return null;

  const currentAtrPct = atrPct[atrPct.length - 1];
  const averageAtrPct = atrPct.reduce((sum, v) => sum + v, 0) / atrPct.length;

  return {
    isHigh: currentAtrPct >= averageAtrPct * HIGH_VOLATILITY_MULTIPLIER,
    currentAtrPct,
    averageAtrPct,
  };
}
