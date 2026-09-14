import type { Candle } from "./types";

export type Trend = "up" | "down" | "sideways";

const TREND_LOOKBACK = 20;
const TREND_THRESHOLD = 0.015; // 1.5%

/** Simple trend classification: compares the latest close to the close ~20 candles back. */
export function detectTrend(candles: Candle[]): Trend {
  if (candles.length < 2) return "sideways";

  const lookback = Math.min(TREND_LOOKBACK, candles.length - 1);
  const past = candles[candles.length - 1 - lookback].close;
  const current = candles[candles.length - 1].close;
  const change = (current - past) / past;

  if (change > TREND_THRESHOLD) return "up";
  if (change < -TREND_THRESHOLD) return "down";
  return "sideways";
}
