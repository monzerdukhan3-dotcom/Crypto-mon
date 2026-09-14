import type { Candle } from "./types";

/**
 * Average True Range: a simple moving average of the true range, used here
 * to normalize how large a price move is relative to recent volatility.
 * Returns one value per candle (NaN for candles before there's enough data).
 */
export function calculateATR(candles: Candle[], period = 14): number[] {
  const trueRanges: number[] = candles.map((candle, i) => {
    if (i === 0) return candle.high - candle.low;
    const prevClose = candles[i - 1].close;
    return Math.max(
      candle.high - candle.low,
      Math.abs(candle.high - prevClose),
      Math.abs(candle.low - prevClose)
    );
  });

  const atr: number[] = new Array(candles.length).fill(NaN);
  for (let i = period - 1; i < trueRanges.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += trueRanges[j];
    atr[i] = sum / period;
  }
  return atr;
}
