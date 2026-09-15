import { calculateATR } from "./indicators";
import { detectSwingPoints } from "./swings";
import type { Candle, Zone, ZoneStrength, ZoneType } from "./types";

export interface DetectZonesOptions {
  /** Candles on each side a swing point must beat, passed to detectSwingPoints. */
  swingLookback?: number;
  /** Period for the ATR used throughout (impulse strength, merge/price-distance thresholds). */
  atrPeriod?: number;
  /** How many candles after the base to scan for the impulsive move's extreme. */
  impulseLookahead?: number;
  /** Minimum impulse size (in ATR units) required for a swing to form a zone at all. */
  minImpulseAtr?: number;
  /** A candle's range at or below this fraction of ATR counts as a small "base" candle. */
  smallCandleAtrRatio?: number;
  /** Same-type zones whose price ranges are closer than this fraction of ATR are merged into one. */
  mergeDistanceAtrRatio?: number;
  /** Zones whose nearest edge sits closer than this fraction of ATR to the current price are dropped. */
  minDistanceFromPriceAtrRatio?: number;
  /** A candidate taller than this many ATRs is rejected outright (an outlier candle, not a tradable zone). */
  maxZoneHeightAtrRatio?: number;
  /** The impulse leg's first 1-2 candles must have a body at least this many times the dataset's average body. */
  minImpulseBodyRatio?: number;
  /** The impulse leg's first candle must have a body-to-range ratio above this (a clean break, not an indecisive wick). */
  minImpulseBodyToWickRatio?: number;
  /** Strongest N active demand zones to keep. */
  maxDemandZones?: number;
  /** Strongest N active supply zones to keep. */
  maxSupplyZones?: number;
}

interface ZoneCandidate {
  type: ZoneType;
  top: number;
  bottom: number;
  /** Index of the last base candle; retests/breaks are scanned from right after this. */
  pivotIndex: number;
  /** Time of the first base candle — where the zone's box starts on the chart. */
  startTime: number;
  /** How many candles made up the consolidation base (1-3). */
  baseSize: number;
  impulseMoveAtr: number;
  /** Average body-to-range ratio of the first few impulse candles (0-1); higher = cleaner move. */
  impulseCleanliness: number;
  /** Average volume during formation, relative to the dataset's average volume. */
  volumeRatio: number;
}

function bodyToRangeRatio(candle: Candle): number {
  const range = candle.high - candle.low;
  if (range <= 0) return 0;
  return Math.abs(candle.close - candle.open) / range;
}

/**
 * Extends a swing point backward into a 1-3 candle consolidation base, as
 * long as neighboring candles stay small relative to ATR — a proper
 * Rally-Base-Drop / Drop-Base-Rally base instead of a single spike reversal.
 * Returns the index of the first (earliest) base candle.
 */
function buildBaseStartIndex(
  candles: Candle[],
  pivotIndex: number,
  atrValue: number,
  smallCandleAtrRatio: number
): number {
  const pivotRange = candles[pivotIndex].high - candles[pivotIndex].low;
  if (pivotRange > atrValue * smallCandleAtrRatio) return pivotIndex;

  let startIndex = pivotIndex;
  for (let j = pivotIndex - 1; j >= Math.max(0, pivotIndex - 2); j--) {
    if (candles[j].high - candles[j].low > atrValue * smallCandleAtrRatio) break;
    startIndex = j;
  }
  return startIndex;
}

function evaluateZoneRange(candles: Candle[], type: ZoneType, top: number, bottom: number, pivotIndex: number) {
  let active = true;
  let testCount = 0;

  for (let i = pivotIndex + 1; i < candles.length; i++) {
    const c = candles[i];
    const brokenThrough = type === "demand" ? c.close < bottom : c.close > top;
    if (brokenThrough) {
      active = false;
      break;
    }
    if (c.low <= top && c.high >= bottom) testCount++;
  }

  return { active, testCount };
}

function zonesGap(a: ZoneCandidate, b: ZoneCandidate): number {
  if (a.bottom <= b.top && b.bottom <= a.top) return 0; // already overlapping
  return a.top < b.bottom ? b.bottom - a.top : a.bottom - b.top;
}

function mergeCandidatePair(a: ZoneCandidate, b: ZoneCandidate): ZoneCandidate {
  // The earlier-formed candidate is primary: its base/impulse describe the
  // original move, and the later candidate re-entering this same area
  // becomes just another retest once bounds are re-evaluated below.
  const primary = a.startTime <= b.startTime ? a : b;
  return {
    ...primary,
    top: Math.max(a.top, b.top),
    bottom: Math.min(a.bottom, b.bottom),
    baseSize: Math.max(a.baseSize, b.baseSize),
    impulseMoveAtr: Math.max(a.impulseMoveAtr, b.impulseMoveAtr),
    impulseCleanliness: Math.max(a.impulseCleanliness, b.impulseCleanliness),
    volumeRatio: Math.max(a.volumeRatio, b.volumeRatio),
  };
}

function mergeCluster(cluster: ZoneCandidate[]): ZoneCandidate {
  return cluster.slice(1).reduce((acc, c) => mergeCandidatePair(acc, c), cluster[0]);
}

/**
 * Merges same-type candidates whose ranges are within `threshold` of each
 * other. Each cluster is anchored to a fixed seed (its lowest candidate) and
 * new members are only admitted if they're close to that seed — comparing
 * against the seed rather than the cluster's own growing bounds prevents a
 * long run of candidates from chain-merging into one zone spanning the
 * entire price range.
 */
function mergeCloseCandidates(candidates: ZoneCandidate[], threshold: number): ZoneCandidate[] {
  const result: ZoneCandidate[] = [];

  for (const type of ["demand", "supply"] as const) {
    const group = candidates.filter((c) => c.type === type).sort((a, b) => a.bottom - b.bottom);
    let seed: ZoneCandidate | null = null;
    let cluster: ZoneCandidate[] = [];

    for (const candidate of group) {
      if (seed && zonesGap(seed, candidate) <= threshold) {
        cluster.push(candidate);
      } else {
        if (cluster.length > 0) result.push(mergeCluster(cluster));
        seed = candidate;
        cluster = [candidate];
      }
    }
    if (cluster.length > 0) result.push(mergeCluster(cluster));
  }

  return result;
}

function scoreZone(candidate: ZoneCandidate, testCount: number): { score: number; strength: ZoneStrength } {
  let score = 0;

  // Freshness: an untested zone is the strongest signal a zone can have.
  if (testCount === 0) score += 3;
  else if (testCount === 1) score += 1;

  if (candidate.impulseMoveAtr >= 3) score += 2;
  else if (candidate.impulseMoveAtr >= 1.5) score += 1;

  if (candidate.baseSize >= 2) score += 1;
  if (candidate.impulseCleanliness >= 0.65) score += 1;
  // A zone formed on above-average volume had real participation behind it.
  if (candidate.volumeRatio >= 1.3) score += 1;

  const strength: ZoneStrength = score >= 6 ? "strong" : score >= 2 ? "medium" : "weak";
  return { score, strength };
}

/**
 * Detects supply (resistance) and demand (support) zones with a
 * Base-and-Impulse model — scored by freshness, impulse size, base quality,
 * breakout cleanliness, and formation volume — then cleans the result up for
 * practical use:
 * - broken zones (a full candle closes decisively through them) are dropped
 *   entirely rather than kept around for historical context
 * - near-duplicate zones of the same type (within half an ATR of each
 *   other) are merged into one
 * - zones sitting within half an ATR of the current price are dropped as
 *   impractically close to trade
 * - only the strongest few zones of each type are kept
 */
export function detectZones(candles: Candle[], options: DetectZonesOptions = {}): Zone[] {
  const {
    swingLookback = 2,
    atrPeriod = 14,
    impulseLookahead = 10,
    minImpulseAtr = 1,
    smallCandleAtrRatio = 0.6,
    mergeDistanceAtrRatio = 0.5,
    minDistanceFromPriceAtrRatio = 0.5,
    maxZoneHeightAtrRatio = 2,
    minImpulseBodyRatio = 1.5,
    minImpulseBodyToWickRatio = 0.6,
    maxDemandZones = 3,
    maxSupplyZones = 2,
  } = options;

  if (candles.length < swingLookback * 2 + 2) return [];

  const swings = detectSwingPoints(candles, swingLookback);
  const atr = calculateATR(candles, atrPeriod);
  const referenceAtr = [...atr].reverse().find((v) => Number.isFinite(v) && v > 0) ?? null;

  const datasetAvgVolume =
    candles.reduce((sum, c) => sum + (c.volume ?? 0), 0) / candles.length;
  const datasetAvgBody =
    candles.reduce((sum, c) => sum + Math.abs(c.close - c.open), 0) / candles.length;

  const candidates: ZoneCandidate[] = [];

  for (const swing of swings) {
    const atrValue = atr[swing.index];
    if (!Number.isFinite(atrValue) || atrValue <= 0) continue;

    const baseStartIndex = buildBaseStartIndex(candles, swing.index, atrValue, smallCandleAtrRatio);
    const baseCandles = candles.slice(baseStartIndex, swing.index + 1);
    const isDemand = swing.type === "low";

    const top = isDemand
      ? Math.max(...baseCandles.map((c) => Math.max(c.open, c.close)))
      : Math.max(...baseCandles.map((c) => c.high));
    const bottom = isDemand
      ? Math.min(...baseCandles.map((c) => c.low))
      : Math.min(...baseCandles.map((c) => Math.min(c.open, c.close)));
    if (top <= bottom) continue;
    // A base candle with an outlier-sized range (a spike/wick) produces a zone
    // too tall to represent a real, tradable level — reject it outright rather
    // than let it swallow nearby candidates during merging.
    if (top - bottom > atrValue * maxZoneHeightAtrRatio) continue;

    const windowEnd = Math.min(swing.index + impulseLookahead, candles.length - 1);
    if (windowEnd <= swing.index) continue;
    const window = candles.slice(swing.index + 1, windowEnd + 1);

    const impulseExtreme = isDemand
      ? Math.max(...window.map((c) => c.high))
      : Math.min(...window.map((c) => c.low));
    const impulseMove = isDemand ? impulseExtreme - bottom : top - impulseExtreme;
    const impulseMoveAtr = impulseMove / atrValue;
    if (impulseMoveAtr < minImpulseAtr) continue;

    // Professional Order Block filters — all four must hold:
    // 1. The breakout candle(s) must be unusually large (real conviction, not drift).
    if (datasetAvgBody > 0) {
      const firstBody = Math.abs(window[0].close - window[0].open);
      const firstTwoBody =
        window.length >= 2 ? firstBody + Math.abs(window[1].close - window[1].open) : firstBody;
      const hasStrongImpulseCandle =
        firstBody > datasetAvgBody * minImpulseBodyRatio || firstTwoBody > datasetAvgBody * minImpulseBodyRatio;
      if (!hasStrongImpulseCandle) continue;
    }
    // 2. The break must be a close beyond the base, not just a wick poking through.
    const closesBeyondBase = isDemand ? window.some((c) => c.close > top) : window.some((c) => c.close < bottom);
    if (!closesBeyondBase) continue;
    // 3. The breakout candle itself must be clean (mostly body, not mostly wick).
    if (bodyToRangeRatio(window[0]) <= minImpulseBodyToWickRatio) continue;

    const cleanlinessSample = window.slice(0, Math.min(3, window.length));
    const impulseCleanliness =
      cleanlinessSample.reduce((sum, c) => sum + bodyToRangeRatio(c), 0) / cleanlinessSample.length;

    const volumeSample = [...baseCandles, ...window.slice(0, Math.min(2, window.length))];
    const avgFormationVolume =
      volumeSample.reduce((sum, c) => sum + (c.volume ?? 0), 0) / volumeSample.length;
    const volumeRatio = datasetAvgVolume > 0 ? avgFormationVolume / datasetAvgVolume : 1;

    candidates.push({
      type: isDemand ? "demand" : "supply",
      top,
      bottom,
      pivotIndex: swing.index,
      startTime: candles[baseStartIndex].time,
      baseSize: swing.index - baseStartIndex + 1,
      impulseMoveAtr,
      impulseCleanliness,
      volumeRatio,
    });
  }

  const mergeThreshold = referenceAtr !== null ? referenceAtr * mergeDistanceAtrRatio : 0;
  const merged = mergeCloseCandidates(candidates, mergeThreshold);

  const currentPrice = candles[candles.length - 1].close;
  const minDistanceFromPrice = referenceAtr !== null ? referenceAtr * minDistanceFromPriceAtrRatio : 0;

  const evaluatedZones: Zone[] = [];
  for (const candidate of merged) {
    const { active, testCount } = evaluateZoneRange(
      candles,
      candidate.type,
      candidate.top,
      candidate.bottom,
      candidate.pivotIndex
    );
    if (!active) continue;

    const distanceToPrice =
      currentPrice >= candidate.bottom && currentPrice <= candidate.top
        ? 0
        : currentPrice > candidate.top
          ? currentPrice - candidate.top
          : candidate.bottom - currentPrice;
    if (distanceToPrice < minDistanceFromPrice) continue;

    const { score, strength } = scoreZone(candidate, testCount);

    // Narrow, ICT-style Order Block box: just the base candles' own width
    // (1-3 candles), not extended forward to the present or to a break time.
    const narrowEndTime = candles[Math.min(candidate.pivotIndex + 1, candles.length - 1)].time;

    evaluatedZones.push({
      id: `${candidate.type}-${candidate.startTime}`,
      type: candidate.type,
      top: candidate.top,
      bottom: candidate.bottom,
      startTime: candidate.startTime,
      endTime: narrowEndTime,
      strength,
      strengthScore: score,
      impulseMoveAtr: candidate.impulseMoveAtr,
      testCount,
      active,
    });
  }

  const capped: Zone[] = [];
  for (const type of ["demand", "supply"] as const) {
    const max = type === "demand" ? maxDemandZones : maxSupplyZones;
    capped.push(
      ...evaluatedZones
        .filter((z) => z.type === type)
        .sort((a, b) => b.strengthScore - a.strengthScore || a.testCount - b.testCount)
        .slice(0, max)
    );
  }

  return capped.sort((a, b) => a.startTime - b.startTime);
}
