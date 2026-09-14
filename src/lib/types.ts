/** A single OHLCV candle, matching the shape lightweight-charts expects. */
export interface Candle {
  time: number; // UNIX timestamp in seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}
