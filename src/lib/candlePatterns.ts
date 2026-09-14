import type { Candle } from "./types";

/** A candle with a long lower wick and a small body/upper wick — a bullish rejection of lower prices. */
export function isBullishPinBar(candle: Candle): boolean {
  const range = candle.high - candle.low;
  if (range <= 0) return false;

  const body = Math.abs(candle.close - candle.open);
  const bodyTop = Math.max(candle.open, candle.close);
  const bodyBottom = Math.min(candle.open, candle.close);
  const lowerWick = bodyBottom - candle.low;
  const upperWick = candle.high - bodyTop;

  return lowerWick >= body * 2 && lowerWick >= range * 0.5 && upperWick <= body;
}

/** The current candle's body fully engulfs the previous (bearish) candle's body, and is itself bullish. */
export function isBullishEngulfing(previous: Candle, current: Candle): boolean {
  const isCurrentBullish = current.close > current.open;
  const isPreviousBearish = previous.close < previous.open;
  if (!isCurrentBullish || !isPreviousBearish) return false;

  return current.open <= previous.close && current.close >= previous.open;
}

/**
 * Checks the last few candles for a bullish reversal pattern (pin bar or
 * bullish engulfing) whose range overlaps the given zone — used to confirm
 * price is actually reacting at a demand zone right now, not just sitting
 * nearby.
 */
export function hasBullishReversalAtZone(candles: Candle[], zoneTop: number, zoneBottom: number): boolean {
  const recentCount = Math.min(3, candles.length);

  for (let i = candles.length - recentCount; i < candles.length; i++) {
    if (i < 0) continue;
    const candle = candles[i];
    const overlapsZone = candle.low <= zoneTop && candle.high >= zoneBottom;
    if (!overlapsZone) continue;

    if (isBullishPinBar(candle)) return true;
    if (i > 0 && isBullishEngulfing(candles[i - 1], candle)) return true;
  }

  return false;
}
