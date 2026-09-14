import { calculateATR } from "./indicators";
import { detectSwingPoints } from "./swings";
import type { Candle, Zone, ZoneStrength } from "./types";

export interface DetectZonesOptions {
  /** Candles on each side a swing point must beat, passed to detectSwingPoints. */
  swingLookback?: number;
  /** Period for the ATR used to normalize impulse strength. */
  atrPeriod?: number;
  /** How many candles after the base candle to scan for the impulsive move's extreme. */
  impulseLookahead?: number;
  /** Minimum impulse size (in ATR units) required for a swing to form a zone at all. */
  minImpulseAtr?: number;
}

function scoreZone(impulseMoveAtr: number, testCount: number): { score: number; strength: ZoneStrength } {
  let score = 0;
  if (impulseMoveAtr >= 3) score += 2;
  else if (impulseMoveAtr >= 1.5) score += 1;

  if (testCount === 0) score += 2;
  else if (testCount <= 2) score += 1;

  const strength: ZoneStrength = score >= 3 ? "strong" : score >= 1 ? "medium" : "weak";
  return { score, strength };
}

/**
 * Detects supply (resistance) and demand (support) zones.
 *
 * A demand zone forms from the base candle right before an impulsive move up
 * (marked from its body top down to its wick low); a supply zone mirrors this
 * for an impulsive move down. A swing only becomes a zone if the move away
 * from it is large enough, relative to ATR, to count as "impulsive" rather
 * than noise. Each zone is then scored by how strong that impulse was and how
 * many times price has re-entered the zone since, and marked inactive once
 * price closes decisively through it.
 */
export function detectZones(candles: Candle[], options: DetectZonesOptions = {}): Zone[] {
  const {
    swingLookback = 2,
    atrPeriod = 14,
    impulseLookahead = 10,
    minImpulseAtr = 1,
  } = options;

  if (candles.length < swingLookback * 2 + 2) return [];

  const swings = detectSwingPoints(candles, swingLookback);
  const atr = calculateATR(candles, atrPeriod);
  const lastTime = candles[candles.length - 1].time;
  const zones: Zone[] = [];

  for (const swing of swings) {
    const atrValue = atr[swing.index];
    if (!Number.isFinite(atrValue) || atrValue <= 0) continue;

    const windowEnd = Math.min(swing.index + impulseLookahead, candles.length - 1);
    if (windowEnd <= swing.index) continue;
    const window = candles.slice(swing.index + 1, windowEnd + 1);

    const base = candles[swing.index];
    const isDemand = swing.type === "low";

    const top = isDemand ? Math.max(base.open, base.close) : base.high;
    const bottom = isDemand ? base.low : Math.min(base.open, base.close);
    if (top <= bottom) continue;

    const impulseExtreme = isDemand
      ? Math.max(...window.map((c) => c.high))
      : Math.min(...window.map((c) => c.low));
    const impulseMove = isDemand ? impulseExtreme - bottom : top - impulseExtreme;
    const impulseMoveAtr = impulseMove / atrValue;
    if (impulseMoveAtr < minImpulseAtr) continue;

    let active = true;
    let testCount = 0;
    let endTime = lastTime;

    for (let i = swing.index + 1; i < candles.length; i++) {
      const c = candles[i];
      const brokenThrough = isDemand ? c.close < bottom : c.close > top;
      if (brokenThrough) {
        active = false;
        endTime = c.time;
        break;
      }
      const overlaps = c.low <= top && c.high >= bottom;
      if (overlaps) testCount++;
    }

    const { score, strength } = scoreZone(impulseMoveAtr, testCount);

    zones.push({
      id: `${isDemand ? "demand" : "supply"}-${base.time}`,
      type: isDemand ? "demand" : "supply",
      top,
      bottom,
      startTime: base.time,
      endTime,
      strength,
      strengthScore: score,
      impulseMoveAtr,
      testCount,
      active,
    });
  }

  return zones.sort((a, b) => a.startTime - b.startTime);
}
