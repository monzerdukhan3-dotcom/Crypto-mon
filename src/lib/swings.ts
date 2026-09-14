import type { Candle, SwingPoint } from "./types";

/**
 * Detects swing highs/lows (fractals): a candle whose high (low) is strictly
 * greater (less) than every candle within `lookback` bars on both sides.
 */
export function detectSwingPoints(candles: Candle[], lookback = 2): SwingPoint[] {
  const points: SwingPoint[] = [];

  for (let i = lookback; i < candles.length - lookback; i++) {
    const current = candles[i];
    let isSwingHigh = true;
    let isSwingLow = true;

    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j === i) continue;
      if (candles[j].high >= current.high) isSwingHigh = false;
      if (candles[j].low <= current.low) isSwingLow = false;
      if (!isSwingHigh && !isSwingLow) break;
    }

    if (isSwingHigh) {
      points.push({ index: i, time: current.time, price: current.high, type: "high" });
    }
    if (isSwingLow) {
      points.push({ index: i, time: current.time, price: current.low, type: "low" });
    }
  }

  return points;
}
