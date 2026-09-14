import { calculateATR } from "./indicators";
import { detectSwingPoints } from "./swings";
import type { Candle } from "./types";

export type LiquidityType = "buyside" | "sellside";

export interface LiquidityLevel {
  id: string;
  /** Buy-side = a cluster of equal highs (liquidity resting above price). Sell-side = equal lows (below price). */
  type: LiquidityType;
  price: number;
  startTime: number;
  endTime: number;
  /** How many swing points cluster at this level. */
  touches: number;
  /** True once a candle has closed decisively through the level (the pool was grabbed). */
  swept: boolean;
}

export interface DetectLiquidityZonesOptions {
  swingLookback?: number;
  atrPeriod?: number;
  /** Swing points within this fraction of ATR of each other are treated as "equal". */
  clusterToleranceAtrRatio?: number;
  /** Minimum swings clustered together to count as a liquidity pool. */
  minTouches?: number;
  /** Strongest N unswept levels of each type to keep. */
  maxLevelsPerType?: number;
}

/** Fixed-seed clustering (see zones.ts) — avoids one long run of nearby points chaining into a single level. */
function clusterPoints(
  points: { price: number; time: number; index: number }[],
  tolerance: number
): { price: number; time: number; index: number }[][] {
  const sorted = [...points].sort((a, b) => a.price - b.price);
  const clusters: { price: number; time: number; index: number }[][] = [];
  let seed: { price: number; time: number; index: number } | null = null;
  let current: { price: number; time: number; index: number }[] = [];

  for (const point of sorted) {
    if (seed && point.price - seed.price <= tolerance) {
      current.push(point);
    } else {
      if (current.length > 0) clusters.push(current);
      seed = point;
      current = [point];
    }
  }
  if (current.length > 0) clusters.push(current);

  return clusters;
}

/**
 * Detects liquidity pools: clusters of equal (or near-equal) swing highs or
 * lows, the classic "resting stops" levels from Smart Money Concepts. Each
 * pool is tracked until a candle closes through it (swept); only unswept
 * pools are returned, since a grabbed pool is no longer actionable.
 */
export function detectLiquidityZones(
  candles: Candle[],
  options: DetectLiquidityZonesOptions = {}
): LiquidityLevel[] {
  const {
    swingLookback = 2,
    atrPeriod = 14,
    clusterToleranceAtrRatio = 0.25,
    minTouches = 2,
    maxLevelsPerType = 4,
  } = options;

  if (candles.length < swingLookback * 2 + 2) return [];

  const swings = detectSwingPoints(candles, swingLookback);
  const atr = calculateATR(candles, atrPeriod);
  const referenceAtr = [...atr].reverse().find((v) => Number.isFinite(v) && v > 0) ?? null;
  if (referenceAtr === null) return [];

  const tolerance = referenceAtr * clusterToleranceAtrRatio;

  const highs = swings.filter((s) => s.type === "high").map((s) => ({ price: s.price, time: s.time, index: s.index }));
  const lows = swings.filter((s) => s.type === "low").map((s) => ({ price: s.price, time: s.time, index: s.index }));

  const levels: LiquidityLevel[] = [];

  const buildLevels = (points: typeof highs, type: LiquidityType) => {
    for (const cluster of clusterPoints(points, tolerance)) {
      if (cluster.length < minTouches) continue;

      const price =
        type === "buyside"
          ? Math.max(...cluster.map((p) => p.price))
          : Math.min(...cluster.map((p) => p.price));
      const startTime = Math.min(...cluster.map((p) => p.time));
      const lastTouchIndex = Math.max(...cluster.map((p) => p.index));

      let swept = false;
      let endTime = candles[candles.length - 1].time;
      for (let i = lastTouchIndex + 1; i < candles.length; i++) {
        const c = candles[i];
        const brokenThrough = type === "buyside" ? c.close > price : c.close < price;
        if (brokenThrough) {
          swept = true;
          endTime = c.time;
          break;
        }
      }
      if (swept) continue; // only unswept pools are worth showing

      levels.push({
        id: `${type}-${startTime}`,
        type,
        price,
        startTime,
        endTime,
        touches: cluster.length,
        swept,
      });
    }
  };

  buildLevels(highs, "buyside");
  buildLevels(lows, "sellside");

  const capped: LiquidityLevel[] = [];
  for (const type of ["buyside", "sellside"] as const) {
    capped.push(
      ...levels
        .filter((l) => l.type === type)
        .sort((a, b) => b.touches - a.touches || b.startTime - a.startTime)
        .slice(0, maxLevelsPerType)
    );
  }

  return capped.sort((a, b) => a.startTime - b.startTime);
}
