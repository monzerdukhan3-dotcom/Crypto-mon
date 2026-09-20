/** A single OHLCV candle, matching the shape lightweight-charts expects. */
export interface Candle {
  time: number; // UNIX timestamp in seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

/** A local high or low identified by comparing each candle to its neighbors. */
export interface SwingPoint {
  index: number;
  time: number;
  price: number;
  type: "high" | "low";
}

export type ZoneType = "demand" | "supply";
export type ZoneStrength = "strong" | "medium" | "weak";

/** A supply (resistance) or demand (support) price zone. */
export interface Zone {
  id: string;
  type: ZoneType;
  top: number;
  bottom: number;
  /** Time of the first base candle — the zone box's left edge. */
  startTime: number;
  /**
   * Time the zone's box extends to. Narrow by design (ICT/SMC Order Block
   * style): just past the base's last candle, not extended to the present.
   */
  endTime: number;
  strength: ZoneStrength;
  /** 0-8 score the strength label is derived from. */
  strengthScore: number;
  /** Size of the impulsive move that formed the zone, in ATR units. */
  impulseMoveAtr: number;
  /** How many times price has re-entered the zone since it formed. */
  testCount: number;
  /** False once price has closed decisively through the zone. */
  active: boolean;
  /**
   * True when a same-type zone on the higher timeframe actually shares
   * price with this one (not just nearby) — the "تداخل المناطق" condition
   * that overrides a broken/bearish entry-timeframe trend.
   */
  htfOverlap: boolean;
}

/** An automatically generated trade plan based on the nearest active demand zone. */
export interface TradePlan {
  zone: Zone;
  entry: number;
  stopLoss: number;
  /** Exactly 3 take-profit targets, ascending. */
  targets: number[];
  /** Risk per unit (entry - stopLoss). */
  riskAmount: number;
  /** Reward-to-risk ratio for each target, matching the targets array. */
  riskRewardRatios: number[];
}
