import { calculateATR } from "./indicators";
import { detectSwingPoints } from "./swings";
import { detectTrendlines, trendlineValueAt, type TrendlineSegment } from "./trendlines";
import type { Candle, Zone, ZoneStrength, ZoneType } from "./types";

export interface DetectZonesOptions {
  /** Candles on each side a swing point must beat, passed to detectSwingPoints. */
  swingLookback?: number;
  /** Period for the ATR used throughout (merge/price-distance thresholds). */
  atrPeriod?: number;
  /** How many candles after the base to scan for the impulsive move's extreme. */
  impulseLookahead?: number;
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
  /** The impulse move (from the zone's own near edge to its extreme) must be at least this many times the zone's own height. */
  minImpulseToZoneHeightRatio?: number;
  /** An opposing zone on the target side closer than this many times this zone's own height gets it rejected (no room to run). */
  minOpposingZoneDistanceRatio?: number;
  /** Base candle count above this is capped when building the base outward from the pivot. */
  maxBaseSize?: number;
  /** How many "opposing zone was itself validated by..." hops to follow before giving up. */
  maxValidationDepth?: number;
  /** Strongest N active demand zones to keep. */
  maxDemandZones?: number;
  /** Strongest N active supply zones to keep. */
  maxSupplyZones?: number;
  /**
   * Candles from one timeframe up (e.g. daily candles when detecting zones
   * on the 1h chart), used only for the higher-timeframe confluence check
   * (condition 10) — a same-direction HTF zone nearby is a bonus, an
   * opposing one nearby is a penalty. Omit to skip the check.
   */
  higherTimeframeCandles?: Candle[] | null;
}

interface ZoneCandidate {
  type: ZoneType;
  top: number;
  bottom: number;
  /** Index of the last base candle; retests/breaks are scanned from right after this. */
  pivotIndex: number;
  /** Time of the first base candle — where the zone's box starts on the chart. */
  startTime: number;
  /** How many candles made up the consolidation base (1-6). */
  baseSize: number;
  impulseMoveAtr: number;
  /** Average body-to-range ratio of the first few impulse candles (0-1); higher = cleaner move. */
  impulseCleanliness: number;
  /** Average body-to-range ratio of the base candles (0-1); higher = fewer/smaller wicks inside the zone. */
  baseBodyRatio: number;
  /** Average volume during formation, relative to the dataset's average volume. */
  volumeRatio: number;
}

// A near-zero body relative to the candle's range — "شمعة دوجي" in the
// source material, which gets its full high-low range taken as the zone box
// instead of splitting price/body between wick and body like a normal base.
const DOJI_BODY_RATIO_THRESHOLD = 0.15;

function bodyToRangeRatio(candle: Candle): number {
  const range = candle.high - candle.low;
  if (range <= 0) return 0;
  return Math.abs(candle.close - candle.open) / range;
}

function isDoji(candle: Candle): boolean {
  return bodyToRangeRatio(candle) < DOJI_BODY_RATIO_THRESHOLD;
}

/**
 * Extends a swing point backward into a 1-6 candle consolidation base, as
 * long as neighboring candles stay small relative to ATR — a proper
 * Rally-Base-Drop / Drop-Base-Rally base instead of a single spike reversal.
 * Fewer candles is stronger (condition 3), but up to 6 is still acceptable,
 * so the cap here is generous; strength scoring is what prefers the
 * tighter bases. Returns the index of the first (earliest) base candle.
 */
function buildBaseStartIndex(
  candles: Candle[],
  pivotIndex: number,
  atrValue: number,
  smallCandleAtrRatio: number,
  maxBaseSize: number
): number {
  const pivotRange = candles[pivotIndex].high - candles[pivotIndex].low;
  if (pivotRange > atrValue * smallCandleAtrRatio) return pivotIndex;

  let startIndex = pivotIndex;
  const earliestAllowed = Math.max(0, pivotIndex - (maxBaseSize - 1));
  for (let j = pivotIndex - 1; j >= earliestAllowed; j--) {
    if (candles[j].high - candles[j].low > atrValue * smallCandleAtrRatio) break;
    startIndex = j;
  }
  return startIndex;
}

/** Computes a zone's top/bottom from its base candles per the price/body rule, with the single-doji exception. */
function computeZoneBox(baseCandles: Candle[], isDemand: boolean): { top: number; bottom: number } {
  if (baseCandles.length === 1 && isDoji(baseCandles[0])) {
    return { top: baseCandles[0].high, bottom: baseCandles[0].low };
  }
  const top = isDemand
    ? Math.max(...baseCandles.map((c) => Math.max(c.open, c.close)))
    : Math.max(...baseCandles.map((c) => c.high));
  const bottom = isDemand
    ? Math.min(...baseCandles.map((c) => c.low))
    : Math.min(...baseCandles.map((c) => Math.min(c.open, c.close)));
  return { top, bottom };
}

/**
 * Scans forward from the base for a break (a full candle closing decisively
 * through the zone) and counts distinct retest "visits" — condition 5/6 in
 * the source material: a touch only counts once price has fully left the
 * zone again (a candle entirely outside it), not for every candle that
 * merely overlaps it, so one long consolidation sitting on the edge counts
 * as one visit rather than a dozen. `hasQuickReturn` is a light read on
 * condition 7 (a fast, direct return is better than a choppy one): true
 * when the first confirmed retest arrives within a handful of candles of
 * the breakout, with no swing reversal in between.
 */
function evaluateZoneRange(candles: Candle[], type: ZoneType, top: number, bottom: number, pivotIndex: number) {
  let active = true;
  let testCount = 0;
  let insideZone = false;
  let firstVisitStartIndex: number | null = null;
  let hasQuickReturn = false;
  let quickReturnChecked = false;

  for (let i = pivotIndex + 1; i < candles.length; i++) {
    const c = candles[i];
    const brokenThrough = type === "demand" ? c.close < bottom : c.close > top;
    if (brokenThrough) {
      active = false;
      break;
    }

    const overlapsZone = c.low <= top && c.high >= bottom;
    const fullyOutside = c.low > top || c.high < bottom;

    if (overlapsZone && !insideZone) {
      insideZone = true;
      firstVisitStartIndex = i;
    } else if (insideZone && fullyOutside) {
      testCount++;
      if (!quickReturnChecked && firstVisitStartIndex !== null) {
        // "Quick" here means the price came straight back with no
        // intervening swing high/low of its own — a direct round trip
        // rather than a choppy zig-zag on the way back.
        hasQuickReturn = firstVisitStartIndex - (pivotIndex + 1) <= 3;
        quickReturnChecked = true;
      }
      insideZone = false;
      firstVisitStartIndex = null;
    }
  }

  return { active, testCount, hasQuickReturn };
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
    baseSize: Math.min(a.baseSize, b.baseSize),
    impulseMoveAtr: Math.max(a.impulseMoveAtr, b.impulseMoveAtr),
    impulseCleanliness: Math.max(a.impulseCleanliness, b.impulseCleanliness),
    baseBodyRatio: Math.max(a.baseBodyRatio, b.baseBodyRatio),
    volumeRatio: Math.max(a.volumeRatio, b.volumeRatio),
  };
}

function mergeCluster(cluster: ZoneCandidate[]): ZoneCandidate {
  return cluster.slice(1).reduce((acc, c) => mergeCandidatePair(acc, c), cluster[0]);
}

/**
 * Merges same-type candidates whose ranges are within `threshold` of each
 * other AND whose pivots are within `maxCandleGap` candles of each other.
 * Both have to hold: a market that ranges for a long time keeps forming new
 * bases at a similar price purely by chance, and without the time bound
 * those would all merge into one box spanning the entire range — taller and
 * older than any of them individually, which both misrepresents the level
 * and can fail the room-to-run check (condition 4) for a fresh zone that
 * would've passed it fine on its own. The bound is generous on purpose
 * (a genuine retest of the same short-lived structure, just detected off a
 * slightly different swing candle) without reaching across what's really a
 * separate, independently-validated base+impulse weeks later. Each cluster
 * is anchored to a fixed seed (its lowest candidate) and new members are
 * only admitted if they're close to that seed — comparing against the seed
 * rather than the cluster's own growing bounds prevents a long run of
 * candidates from chain-merging into one zone spanning the entire range.
 */
function mergeCloseCandidates(candidates: ZoneCandidate[], threshold: number, maxCandleGap: number): ZoneCandidate[] {
  const result: ZoneCandidate[] = [];

  for (const type of ["demand", "supply"] as const) {
    const group = candidates.filter((c) => c.type === type).sort((a, b) => a.bottom - b.bottom);
    let seed: ZoneCandidate | null = null;
    let cluster: ZoneCandidate[] = [];

    for (const candidate of group) {
      const canMerge =
        seed !== null &&
        zonesGap(seed, candidate) <= threshold &&
        Math.abs(candidate.pivotIndex - seed.pivotIndex) <= maxCandleGap;
      if (canMerge) {
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

function scoreZone(
  candidate: ZoneCandidate,
  testCount: number,
  hasQuickReturn: boolean,
  htfConfluence: "aligned" | "opposing" | "none"
): { score: number; strength: ZoneStrength } {
  let score = 0;

  // Freshness: an untested zone is the strongest signal a zone can have.
  if (testCount === 0) score += 3;
  else if (testCount === 1) score += 1;

  if (candidate.impulseMoveAtr >= 3) score += 2;
  else if (candidate.impulseMoveAtr >= 1.5) score += 1;

  // Condition 3: fewer base candles is stronger.
  if (candidate.baseSize <= 3) score += 1;
  if (candidate.impulseCleanliness >= 0.65) score += 1;
  // Condition 9: a base made mostly of body (small wicks) is cleaner.
  if (candidate.baseBodyRatio >= 0.6) score += 1;
  // A zone formed on above-average volume had real participation behind it.
  if (candidate.volumeRatio >= 1.3) score += 1;
  // Condition 7: only relevant once there's been a retest to judge.
  if (testCount > 0 && hasQuickReturn) score += 1;
  // Condition 10: higher-timeframe confluence.
  if (htfConfluence === "aligned") score += 1;
  if (htfConfluence === "opposing") score -= 1;

  const strength: ZoneStrength = score >= 6 ? "strong" : score >= 2 ? "medium" : "weak";
  return { score, strength };
}

interface RawCandidate extends ZoneCandidate {
  /** Absolute end of the impulse-lookahead window, for recomputing it later without re-scanning swings. */
  impulseWindowEnd: number;
}

function getImpulseWindow(candles: Candle[], candidate: Pick<RawCandidate, "pivotIndex" | "impulseWindowEnd">) {
  return candles.slice(candidate.pivotIndex + 1, candidate.impulseWindowEnd + 1);
}

function breaksTrendline(
  candidate: RawCandidate,
  window: Candle[],
  trendlines: TrendlineSegment[]
): boolean {
  const isDemand = candidate.type === "demand";
  const relevantTrendlineType = isDemand ? "resistance" : "support";
  return window.some((c, offset) => {
    const absoluteIndex = candidate.pivotIndex + 1 + offset;
    return trendlines.some((line) => {
      if (line.type !== relevantTrendlineType) return false;
      if (line.point2.index > candidate.pivotIndex) return false; // must predate this zone's breakout
      const projected = trendlineValueAt(line, absoluteIndex);
      return isDemand ? c.close > projected : c.close < projected;
    });
  });
}

function findBrokenOpposing(
  candidate: RawCandidate,
  window: Candle[],
  validatedSoFar: RawCandidate[]
): RawCandidate | undefined {
  const isDemand = candidate.type === "demand";
  const opposingType: ZoneType = isDemand ? "supply" : "demand";
  return validatedSoFar.find((other) => {
    if (other.type !== opposingType) return false;
    if (other.pivotIndex >= candidate.pivotIndex) return false;
    // The impulse must close cleanly through the opposing zone's far edge,
    // not merely overlap its range.
    return isDemand ? window.some((c) => c.close > other.top) : window.some((c) => c.close < other.bottom);
  });
}

/**
 * The stricter proof required to CITE an opposing zone as the basis for
 * validating another one (اثبات، تابع — "the zone that was broken must
 * itself be validated by a trendline break"): a self-validated new extreme
 * doesn't count here even though it's a perfectly valid zone in its own
 * right — only an actual trendline break does, whether on this zone
 * directly or, recursively, on the opposing zone it broke in turn.
 */
function isValidatedByTrendlineChain(
  candidate: RawCandidate,
  candles: Candle[],
  trendlines: TrendlineSegment[],
  validatedSoFar: RawCandidate[],
  depth: number,
  maxDepth: number
): boolean {
  const window = getImpulseWindow(candles, candidate);
  if (window.length === 0) return false;
  if (breaksTrendline(candidate, window, trendlines)) return true;

  if (depth >= maxDepth) return false;
  const brokenOpposing = findBrokenOpposing(candidate, window, validatedSoFar);
  if (!brokenOpposing) return false;

  return isValidatedByTrendlineChain(brokenOpposing, candles, trendlines, validatedSoFar, depth + 1, maxDepth);
}

/**
 * "اثبات المنطقة" — a zone only counts as real if its origin impulse is
 * validated one of three ways:
 * 1. The impulse crosses a trendline (major or minor — any 2+ prior same-
 *    type swings that price hadn't broken before) established before the
 *    zone formed.
 * 2. The impulse breaks clean through an earlier opposing zone — but only
 *    if that opposing zone can itself be traced back to a trendline break
 *    (isValidatedByTrendlineChain), not merely a self-validated new
 *    extreme; a historical high/low is strong enough to validate itself,
 *    but the source material is explicit that it isn't strong enough to
 *    lend that validation to another zone on its own.
 * 3. The impulse's extreme sets a new high (demand) or low (supply) versus
 *    every candle before it in the fetched history — self-validated, no
 *    further proof needed.
 * `validatedSoFar` must contain only candidates already confirmed valid,
 * in chronological order, so the opposing-zone check only ever cites a real
 * zone rather than a rejected candidate.
 */
function isImpulseValidated(
  candidate: RawCandidate,
  candles: Candle[],
  trendlines: TrendlineSegment[],
  validatedSoFar: RawCandidate[],
  maxDepth: number
): boolean {
  const isDemand = candidate.type === "demand";
  const window = getImpulseWindow(candles, candidate);
  if (window.length === 0) return false;

  if (breaksTrendline(candidate, window, trendlines)) return true;

  const priorExtreme = isDemand
    ? Math.max(...candles.slice(0, candidate.pivotIndex + 1).map((c) => c.high))
    : Math.min(...candles.slice(0, candidate.pivotIndex + 1).map((c) => c.low));
  const impulseExtreme = isDemand ? Math.max(...window.map((c) => c.high)) : Math.min(...window.map((c) => c.low));
  const setsNewExtreme = isDemand ? impulseExtreme >= priorExtreme : impulseExtreme <= priorExtreme;
  if (setsNewExtreme) return true;

  const brokenOpposing = findBrokenOpposing(candidate, window, validatedSoFar);
  if (!brokenOpposing) return false;

  return isValidatedByTrendlineChain(brokenOpposing, candles, trendlines, validatedSoFar, 0, maxDepth);
}

interface EvaluatedZonesResult {
  /** Every validated, merged zone that ever formed — including ones since broken through. */
  all: (Zone & { pivotIndex: number })[];
  /** Only the zones still active as of the latest candle, matching detectZones' historical behavior. */
  activeOnly: (Zone & { pivotIndex: number })[];
  currentPrice: number;
  minDistanceFromPrice: number;
}

/**
 * Shared pipeline behind both detectZones (the live chart's view: only
 * currently-active zones, filtered and capped down to the strongest few)
 * and detectZoneHistory (the trade-history backtest's view: every zone that
 * ever validly formed, broken or not, uncapped). Runs validation ("اثبات"),
 * merging, scoring, and the room-to-run filter — everything that doesn't
 * depend on whether a zone has since broken or is still near the price.
 */
function computeEvaluatedZones(candles: Candle[], options: DetectZonesOptions): EvaluatedZonesResult {
  const {
    swingLookback = 2,
    atrPeriod = 14,
    impulseLookahead = 10,
    smallCandleAtrRatio = 0.6,
    mergeDistanceAtrRatio = 0.5,
    minDistanceFromPriceAtrRatio = 0.5,
    maxZoneHeightAtrRatio = 2,
    minImpulseBodyRatio = 1.5,
    minImpulseBodyToWickRatio = 0.6,
    minImpulseToZoneHeightRatio = 2,
    minOpposingZoneDistanceRatio = 2,
    maxBaseSize = 6,
    maxValidationDepth = 6,
    higherTimeframeCandles = null,
  } = options;

  if (candles.length < swingLookback * 2 + 2) {
    return { all: [], activeOnly: [], currentPrice: candles[candles.length - 1]?.close ?? 0, minDistanceFromPrice: 0 };
  }

  const swings = detectSwingPoints(candles, swingLookback);
  const trendlines = detectTrendlines(candles, swings);
  const atr = calculateATR(candles, atrPeriod);
  const referenceAtr = [...atr].reverse().find((v) => Number.isFinite(v) && v > 0) ?? null;

  const datasetAvgVolume = candles.reduce((sum, c) => sum + (c.volume ?? 0), 0) / candles.length;
  const datasetAvgBody = candles.reduce((sum, c) => sum + Math.abs(c.close - c.open), 0) / candles.length;

  const rawCandidates: RawCandidate[] = [];

  for (const swing of swings) {
    const atrValue = atr[swing.index];
    if (!Number.isFinite(atrValue) || atrValue <= 0) continue;

    const baseStartIndex = buildBaseStartIndex(candles, swing.index, atrValue, smallCandleAtrRatio, maxBaseSize);
    const baseCandles = candles.slice(baseStartIndex, swing.index + 1);
    const isDemand = swing.type === "low";

    const { top, bottom } = computeZoneBox(baseCandles, isDemand);
    if (top <= bottom) continue;
    // A base candle with an outlier-sized range (a spike/wick) produces a zone
    // too tall to represent a real, tradable level — reject it outright rather
    // than let it swallow nearby candidates during merging.
    if (referenceAtr !== null && top - bottom > referenceAtr * maxZoneHeightAtrRatio) continue;

    const windowEnd = Math.min(swing.index + impulseLookahead, candles.length - 1);
    if (windowEnd <= swing.index) continue;
    const window = candles.slice(swing.index + 1, windowEnd + 1);

    const zoneHeight = top - bottom;
    const impulseExtreme = isDemand ? Math.max(...window.map((c) => c.high)) : Math.min(...window.map((c) => c.low));
    // Condition 1 (slide 5): measured from the zone's own near edge — the
    // side price actually left from — not from ATR.
    const impulseMove = isDemand ? impulseExtreme - top : bottom - impulseExtreme;
    if (impulseMove < zoneHeight * minImpulseToZoneHeightRatio) continue;
    const impulseMoveAtr = referenceAtr !== null && referenceAtr > 0 ? impulseMove / referenceAtr : 0;

    // Professional Order Block filters — all must hold. Checked across the
    // first few window candles rather than strictly window[0]/window[0:2]:
    // the real breakout doesn't always fire on the very next candle after
    // the swing pivot — a candle or two of continued drift before it
    // ignites is normal and shouldn't disqualify an otherwise clean move.
    const impulseStart = window.slice(0, Math.min(3, window.length));
    // 1. The breakout candle(s) must be unusually large (real conviction, not drift).
    if (datasetAvgBody > 0) {
      const bodies = impulseStart.map((c) => Math.abs(c.close - c.open));
      const hasStrongImpulseCandle = bodies.some(
        (_, i) => bodies.slice(0, i + 1).reduce((sum, b) => sum + b, 0) > datasetAvgBody * minImpulseBodyRatio
      );
      if (!hasStrongImpulseCandle) continue;
    }
    // 2. The break must be a close beyond the base, not just a wick poking through.
    const closesBeyondBase = isDemand ? window.some((c) => c.close > top) : window.some((c) => c.close < bottom);
    if (!closesBeyondBase) continue;
    // 3. At least one of those early candles must itself be clean (mostly body, not mostly wick).
    if (!impulseStart.some((c) => bodyToRangeRatio(c) > minImpulseBodyToWickRatio)) continue;

    const impulseCleanliness =
      impulseStart.reduce((sum, c) => sum + bodyToRangeRatio(c), 0) / impulseStart.length;
    const baseBodyRatio = baseCandles.reduce((sum, c) => sum + bodyToRangeRatio(c), 0) / baseCandles.length;

    const volumeSample = [...baseCandles, ...window.slice(0, Math.min(2, window.length))];
    const avgFormationVolume = volumeSample.reduce((sum, c) => sum + (c.volume ?? 0), 0) / volumeSample.length;
    const volumeRatio = datasetAvgVolume > 0 ? avgFormationVolume / datasetAvgVolume : 1;

    rawCandidates.push({
      type: isDemand ? "demand" : "supply",
      top,
      bottom,
      pivotIndex: swing.index,
      startTime: candles[baseStartIndex].time,
      baseSize: swing.index - baseStartIndex + 1,
      impulseMoveAtr,
      impulseCleanliness,
      baseBodyRatio,
      volumeRatio,
      impulseWindowEnd: windowEnd,
    });
  }

  // اثبات: validate in formation order so each candidate's opposing-zone
  // check can only cite zones already confirmed valid.
  const validated: RawCandidate[] = [];
  for (const candidate of rawCandidates) {
    if (isImpulseValidated(candidate, candles, trendlines, validated, maxValidationDepth)) {
      validated.push(candidate);
    }
  }
  const mergeThreshold = referenceAtr !== null ? referenceAtr * mergeDistanceAtrRatio : 0;
  const merged = mergeCloseCandidates(validated, mergeThreshold, impulseLookahead * 2);

  const currentPrice = candles[candles.length - 1].close;
  const minDistanceFromPrice = referenceAtr !== null ? referenceAtr * minDistanceFromPriceAtrRatio : 0;

  // Higher-timeframe confluence (condition 10) — one level up only, no
  // further recursion, and skipped entirely when not provided.
  const higherTimeframeZones =
    higherTimeframeCandles && higherTimeframeCandles.length > 0
      ? detectZones(higherTimeframeCandles, { ...options, higherTimeframeCandles: null })
      : [];

  function htfConfluenceFor(zone: { type: ZoneType; top: number; bottom: number }): "aligned" | "opposing" | "none" {
    if (higherTimeframeZones.length === 0 || referenceAtr === null) return "none";
    const proximity = referenceAtr * 1.5;
    const nearbyHtf = higherTimeframeZones.find(
      (h) => h.bottom - proximity <= zone.top && h.top + proximity >= zone.bottom
    );
    if (!nearbyHtf) return "none";
    return nearbyHtf.type === zone.type ? "aligned" : "opposing";
  }

  // "تداخل المناطق" — actually sharing a price with a same-type
  // higher-timeframe zone, not merely sitting nearby like the softer
  // confluence score above. This is what's allowed to override a broken or
  // bearish entry-timeframe trend (see buildTradePlan).
  function htfOverlapFor(zone: { type: ZoneType; top: number; bottom: number }): boolean {
    return higherTimeframeZones.some((h) => h.type === zone.type && h.bottom <= zone.top && h.top >= zone.bottom);
  }

  // Every validated candidate gets evaluated and scored, whether it's still
  // active or has since broken — detectZoneHistory needs the broken ones
  // too, for a full backtest of what would have traded and how it resolved.
  const evaluatedZones: (Zone & { pivotIndex: number })[] = [];
  for (const candidate of merged) {
    const { active, testCount, hasQuickReturn } = evaluateZoneRange(
      candles,
      candidate.type,
      candidate.top,
      candidate.bottom,
      candidate.pivotIndex
    );

    const htfConfluence = htfConfluenceFor(candidate);
    const { score, strength } = scoreZone(candidate, testCount, hasQuickReturn, htfConfluence);

    // Narrow, ICT-style Order Block box: just the base candles' own width
    // (1-6 candles), not extended forward to the present or to a break time.
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
      htfOverlap: htfOverlapFor(candidate),
      pivotIndex: candidate.pivotIndex,
    });
  }

  // Condition 4: reject a zone if a still-active opposing zone on its
  // target side sits closer than `minOpposingZoneDistanceRatio` times its
  // own height — no room left to run before hitting resistance/support.
  // An opposing zone price has already closed decisively through isn't a
  // live obstacle anymore, so it's excluded here even though it's still
  // included (as broken) in detectZoneHistory's own output.
  const withRoomToRun = evaluatedZones.filter((zone) => {
    const zoneHeight = zone.top - zone.bottom;
    const opposing = evaluatedZones.filter((other) => other.type !== zone.type && other.active);
    const nearestOpposing =
      zone.type === "demand"
        ? opposing.filter((o) => o.bottom > zone.top).sort((a, b) => a.bottom - b.bottom)[0]
        : opposing.filter((o) => o.top < zone.bottom).sort((a, b) => b.top - a.top)[0];
    if (!nearestOpposing) return true;
    const distance = zone.type === "demand" ? nearestOpposing.bottom - zone.top : zone.bottom - nearestOpposing.top;
    return distance >= zoneHeight * minOpposingZoneDistanceRatio;
  });

  const activeOnly = withRoomToRun.filter((zone) => {
    if (!zone.active) return false;
    const distanceToPrice =
      currentPrice >= zone.bottom && currentPrice <= zone.top
        ? 0
        : currentPrice > zone.top
          ? currentPrice - zone.top
          : zone.bottom - currentPrice;
    return distanceToPrice >= minDistanceFromPrice;
  });

  return { all: withRoomToRun, activeOnly, currentPrice, minDistanceFromPrice };
}

/**
 * Detects supply (resistance) and demand (support) zones with a
 * Base-and-Impulse model, gated by a validation ("اثبات") pass before
 * anything is scored or drawn, then scored by freshness, impulse size, base
 * quality, breakout cleanliness, retest behavior, and (optionally)
 * higher-timeframe confluence:
 * - a zone whose origin impulse isn't validated (no trendline break, no
 *   validated opposing zone broken, no new historical extreme) is dropped
 *   outright — it never gets drawn
 * - broken zones (a full candle closes decisively through them) are dropped
 *   entirely rather than kept around for historical context
 * - near-duplicate zones of the same type (within half an ATR of each
 *   other) are merged into one
 * - zones sitting within half an ATR of the current price are dropped as
 *   impractically close to trade
 * - a zone with a closer opposing zone on its target side than 2x its own
 *   height is dropped — no room to run
 * - only the strongest few zones of each type are kept
 */
export function detectZones(candles: Candle[], options: DetectZonesOptions = {}): Zone[] {
  const { maxDemandZones = 3, maxSupplyZones = 2 } = options;
  const { activeOnly } = computeEvaluatedZones(candles, options);

  const capped: Zone[] = [];
  for (const type of ["demand", "supply"] as const) {
    const max = type === "demand" ? maxDemandZones : maxSupplyZones;
    capped.push(
      ...activeOnly
        .filter((z) => z.type === type)
        .sort((a, b) => b.strengthScore - a.strengthScore || a.testCount - b.testCount)
        .slice(0, max)
        .map((zone): Zone => {
          const { pivotIndex, ...rest } = zone;
          void pivotIndex;
          return rest;
        })
    );
  }

  return capped.sort((a, b) => a.startTime - b.startTime);
}

/**
 * Every zone that ever validly formed in this candle history, broken or
 * not, uncapped — for backtesting the full trade history rather than just
 * showing today's live setups. Each zone keeps its `pivotIndex` (the last
 * base candle) so a backtest can replay forward from the moment it formed.
 */
export function detectZoneHistory(
  candles: Candle[],
  options: DetectZonesOptions = {}
): (Zone & { pivotIndex: number })[] {
  return computeEvaluatedZones(candles, options).all;
}
