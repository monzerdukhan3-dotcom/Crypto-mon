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

/** Simple moving average — one value per input, NaN before there's enough data. */
export function calculateSMA(values: number[], period: number): number[] {
  const result: number[] = new Array(values.length).fill(NaN);
  for (let i = period - 1; i < values.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += values[j];
    result[i] = sum / period;
  }
  return result;
}

/**
 * Exponential moving average, seeded with the plain SMA of the first
 * `period` values (the standard convention) and smoothed forward from
 * there. NaN before the seed point.
 */
export function calculateEMA(values: number[], period: number): number[] {
  const result: number[] = new Array(values.length).fill(NaN);
  if (values.length < period) return result;

  const multiplier = 2 / (period + 1);
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  let ema = sum / period;
  result[period - 1] = ema;

  for (let i = period; i < values.length; i++) {
    ema = (values[i] - ema) * multiplier + ema;
    result[i] = ema;
  }
  return result;
}

/**
 * Relative Strength Index (Wilder's smoothing): the seed average gain/loss
 * comes from the first `period` changes, then each later change rolls that
 * average forward. NaN before the seed point.
 */
export function calculateRSI(values: number[], period = 14): number[] {
  const result: number[] = new Array(values.length).fill(NaN);
  if (values.length <= period) return result;

  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const change = values[i] - values[i - 1];
    if (change >= 0) gainSum += change;
    else lossSum -= change;
  }
  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;
  result[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period + 1; i < values.length; i++) {
    const change = values[i] - values[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    result[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return result;
}

export interface MACDResult {
  macd: number[];
  signal: number[];
  histogram: number[];
}

/**
 * MACD: the fast EMA minus the slow EMA, plus a signal line that's itself
 * an EMA of that MACD line (computed only over the tail where the MACD line
 * is actually defined, so the signal EMA isn't seeded on leading NaNs), and
 * a histogram of the gap between the two.
 */
export function calculateMACD(
  values: number[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9
): MACDResult {
  const fastEma = calculateEMA(values, fastPeriod);
  const slowEma = calculateEMA(values, slowPeriod);
  const macd = values.map((_, i) =>
    Number.isFinite(fastEma[i]) && Number.isFinite(slowEma[i]) ? fastEma[i] - slowEma[i] : NaN
  );

  const signal: number[] = new Array(values.length).fill(NaN);
  const firstValidIndex = macd.findIndex((v) => Number.isFinite(v));
  if (firstValidIndex !== -1) {
    const macdTail = macd.slice(firstValidIndex);
    const signalTail = calculateEMA(macdTail, signalPeriod);
    signalTail.forEach((v, i) => {
      signal[firstValidIndex + i] = v;
    });
  }

  const histogram = values.map((_, i) =>
    Number.isFinite(macd[i]) && Number.isFinite(signal[i]) ? macd[i] - signal[i] : NaN
  );

  return { macd, signal, histogram };
}
