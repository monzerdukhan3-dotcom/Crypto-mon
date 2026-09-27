import { calculateATR } from "./indicators";
import type { Candle, TradePlan, Zone } from "./types";

function latestAtr(candles: Candle[], period = 14): number | null {
  const atr = calculateATR(candles, period);
  return [...atr].reverse().find((v) => Number.isFinite(v) && v > 0) ?? null;
}

/** How many times price may re-enter the same still-unbroken demand zone before it's considered exhausted. */
export const MAX_ZONE_ENTRIES = 3;

/**
 * Every distinct return to the zone since its confirmed breakout, up to
 * `maxEntries` (index 0 = the first return). The entry is a *touch*: the
 * first candle whose low reaches the zone's top — a buy limit order resting
 * at the top fills right there, whatever the candle does afterward.
 *
 * - The zone only counts once confirmed: some candle after the base must
 *   first close above `zoneTop` (the breakout).
 * - A later entry only counts once price has genuinely left the zone again
 *   in between: a whole candle above `zoneTop` (low > top), so a candle
 *   wicking in and out repeatedly is one visit, not several.
 * - A close below `zoneBottom` breaks the zone: no entries after it. The
 *   touch on the breaking candle itself still happened first (the order was
 *   filled), so it remains an entry — its outcome is then decided by the
 *   stop loss like any other trade.
 */
export function findEntryIndices(
  candles: Candle[],
  fromTime: number,
  zoneTop: number,
  zoneBottom: number,
  maxEntries: number = MAX_ZONE_ENTRIES
): number[] {
  const startIndex = candles.findIndex((c) => c.time >= fromTime);
  if (startIndex === -1) return [];

  let breakoutIndex = -1;
  for (let i = startIndex; i < candles.length; i++) {
    if (candles[i].close < zoneBottom) return []; // broken before it was ever confirmed
    if (candles[i].close > zoneTop) {
      breakoutIndex = i;
      break;
    }
  }
  if (breakoutIndex === -1) return [];

  const entries: number[] = [];
  // The breakout candle itself may not be fully above the zone yet; a new
  // visit can only start once price has been entirely above it.
  let awayFromZone = candles[breakoutIndex].low > zoneTop;

  for (let i = breakoutIndex + 1; i < candles.length && entries.length < maxEntries; i++) {
    const c = candles[i];
    if (awayFromZone && c.low <= zoneTop) {
      entries.push(i);
      awayFromZone = false;
    } else if (!awayFromZone && c.low > zoneTop) {
      awayFromZone = true;
    }
    if (c.close < zoneBottom) break; // zone broken — no further entries
  }

  return entries;
}

export interface BuildTradePlanOptions {
  /** Extra room below the zone for the stop loss, as a fraction of zone height. */
  stopBufferRatio?: number;
  /** Fallback risk-multiples used for any target with no supply zone to aim at. */
  targetRMultiples?: number[];
  /** Minimum acceptable reward:risk on the first target — reject the setup below this. */
  minFirstTargetRR?: number;
}

/**
 * Turns one specific demand zone into a trade plan: entry at the zone's
 * top (where a pullback first tags it), stop loss just under the zone's
 * bottom, and 3 ascending targets that prefer real active supply zones
 * above entry, falling back to risk-multiples when there aren't enough of
 * those. Returns null if the zone's own range leaves no room for a stop
 * (top <= bottom), or if the first target's reward:risk doesn't clear the
 * minimum bar — a technically strong zone still isn't a trade if the setup
 * itself is poor. Called by the causal signal engine (signalEngine.ts)
 * with the zone map as it stood at the entry candle.
 */
export function planFromZone(
  zone: Zone,
  zones: Zone[],
  options: BuildTradePlanOptions = {}
): TradePlan | null {
  const { stopBufferRatio = 0.15, targetRMultiples = [1.5, 2.5, 4], minFirstTargetRR = 1 } = options;

  const entry = zone.top;
  const zoneHeight = zone.top - zone.bottom;
  const stopLoss = zone.bottom - zoneHeight * stopBufferRatio;
  const riskAmount = entry - stopLoss;
  if (riskAmount <= 0) return null;

  const supplyTargetsAbove = zones
    .filter((z) => z.type === "supply" && z.active && z.bottom > entry)
    .sort((a, b) => a.bottom - b.bottom)
    .map((z) => z.bottom);

  // A real supply zone is only used as a target when it sits within a sane
  // distance of the risk-based level it's replacing. Without this cap, a
  // handful of supply zones that all happen to sit far above entry (the
  // nearest real resistance being, say, 15R away) get used as targets 1-3
  // verbatim: every target clusters together right under that resistance
  // instead of being spread across meaningfully distinct levels, and the
  // whole stretch of real, closer progress in between goes unmarked — a
  // plan can already be deep in profit and still read as barely started.
  const SUPPLY_TARGET_CEILING_MULTIPLIER = 2;

  const targets: number[] = [];
  for (let i = 0; i < targetRMultiples.length; i++) {
    const fallback = entry + riskAmount * targetRMultiples[i];
    const supplyCandidate = supplyTargetsAbove[i];
    const maxAllowedDistance = riskAmount * targetRMultiples[i] * SUPPLY_TARGET_CEILING_MULTIPLIER;
    const candidate =
      supplyCandidate !== undefined && supplyCandidate - entry <= maxAllowedDistance ? supplyCandidate : fallback;
    const minAllowed = (i === 0 ? entry : targets[i - 1]) + riskAmount * 0.5;
    targets.push(Math.max(candidate, minAllowed));
  }

  const riskRewardRatios = targets.map((t) => Number(((t - entry) / riskAmount).toFixed(2)));
  if (riskRewardRatios[0] < minFirstTargetRR) return null;

  // Defaults to the first entry — the signal engine overrides this with the
  // actual retest number, since planFromZone only computes the geometry.
  return { zone, entry, stopLoss, targets, riskAmount, riskRewardRatios, retestNumber: 1 };
}

/**
 * The nearest active demand zone price is heading toward, or is already
 * trading inside of without a trade having opened (the signal engine
 * rejected the touch — trend gate, entries used up, not yet confirmed, or
 * too little reward). Close enough to be worth flagging so a limit
 * buy order can be queued at the zone's top ahead of the return.
 */
export function findApproachingDemandZone(
  zones: Zone[],
  currentPrice: number,
  candles: Candle[],
  options: { watchDistanceAtrRatio?: number } = {}
): Zone | null {
  const { watchDistanceAtrRatio = 6 } = options;

  const referenceAtr = latestAtr(candles);
  if (referenceAtr === null) return null;
  const maxDistance = referenceAtr * watchDistanceAtrRatio;

  const candidates = zones.filter((z) => {
    if (z.type !== "demand" || !z.active || currentPrice < z.bottom) return false;
    return currentPrice - z.top <= maxDistance;
  });
  if (candidates.length === 0) return null;

  return candidates.reduce((closest, zone) => (zone.top > closest.top ? zone : closest));
}

/**
 * The first candle, after `fromTime`, whose close breaks decisively through
 * the zone — demand: close below `bottom`; supply: close above `top`.
 * Mirrors zones.ts' own evaluateZoneRange break condition exactly (just
 * scanning from the zone's endTime rather than its internal pivotIndex,
 * which land on the same candle in practice), so the candle this reports
 * is the same one that flipped the zone's own `active` flag to false.
 */
function findBreakTime(zone: Zone, candles: Candle[]): number | null {
  const startIndex = candles.findIndex((c) => c.time >= zone.endTime);
  if (startIndex === -1) return null;

  for (let i = startIndex; i < candles.length; i++) {
    const c = candles[i];
    const brokenThrough = zone.type === "demand" ? c.close < zone.bottom : c.close > zone.top;
    if (brokenThrough) return c.time;
  }
  return null;
}

/**
 * The nearest zone to `currentPrice` that has since broken (`active:
 * false`) — the zone that would otherwise just silently stop being drawn
 * once price closed decisively through it, leaving no trace of why a
 * demand/supply box that was on the chart a moment ago is now gone. Only
 * worth surfacing while price is still nearby (same watch band as
 * findApproachingDemandZone) *and* the break itself is still recent
 * (RECENT_BREAK_LOOKBACK_CANDLES) — price distance alone isn't enough: a
 * quiet, low-ATR market can leave an old break from weeks back sitting
 * just as "close" by price as a break from yesterday, so a candle-count
 * cutoff on the break itself is what actually keeps this from reading as
 * outdated once price has simply drifted back near a level it broke long
 * ago. Purely informational — CandlestickChart renders it dimmed and
 * dashed with a "منطقة مكسورة" label instead of the normal solid box, and
 * it never feeds into the signal engine or any other trading decision.
 *
 * The returned zone's `endTime` is moved up to the actual breakout candle
 * (rather than the zone's own narrow formation box) so the rectangle
 * CandlestickChart draws stops right where price broke it, instead of
 * trailing on as if the level were still active.
 *
 * A price shelf can break once and then form a brand new, independently
 * validated order block at practically the same range later on — merging
 * only combines candidates formed close together in time, so an old break
 * and a fresh active zone at the same price both legitimately exist as
 * separate Zone objects. Surfacing the old break here anyway would tell
 * the user to cancel a pending order at a level that's simultaneously
 * being offered as a live entry — silently excluding it whenever an
 * active zone of the same type already covers that price avoids that
 * contradiction.
 */
/** How many of the most recent candles a break can have happened in and still count as "recent" here. */
const RECENT_BREAK_LOOKBACK_CANDLES = 60;

export function findRecentlyBrokenZone(
  zones: Zone[],
  currentPrice: number,
  candles: Candle[],
  options: { watchDistanceAtrRatio?: number } = {}
): Zone | null {
  const { watchDistanceAtrRatio = 6 } = options;

  const referenceAtr = latestAtr(candles);
  if (referenceAtr === null) return null;
  const maxDistance = referenceAtr * watchDistanceAtrRatio;

  function distanceToPrice(zone: Zone): number {
    if (currentPrice >= zone.bottom && currentPrice <= zone.top) return 0;
    return currentPrice > zone.top ? currentPrice - zone.top : zone.bottom - currentPrice;
  }

  function overlaps(a: Zone, b: Zone): boolean {
    return a.bottom <= b.top && a.top >= b.bottom;
  }

  const supersededByActiveZone = (z: Zone) =>
    zones.some((other) => other.active && other.type === z.type && overlaps(other, z));

  const breakTimeByZoneId = new Map<string, number>();
  const isRecentBreak = (z: Zone): boolean => {
    const breakTime = findBreakTime(z, candles);
    if (breakTime === null) return false;
    breakTimeByZoneId.set(z.id, breakTime);
    const breakIndex = candles.findIndex((c) => c.time === breakTime);
    return breakIndex !== -1 && candles.length - breakIndex <= RECENT_BREAK_LOOKBACK_CANDLES;
  };

  const candidates = zones.filter(
    (z) => !z.active && distanceToPrice(z) <= maxDistance && !supersededByActiveZone(z) && isRecentBreak(z)
  );
  if (candidates.length === 0) return null;

  const nearest = candidates.reduce((closest, zone) =>
    distanceToPrice(zone) < distanceToPrice(closest) ? zone : closest
  );
  const breakTime = breakTimeByZoneId.get(nearest.id) ?? findBreakTime(nearest, candles);
  return breakTime === null ? nearest : { ...nearest, endTime: breakTime };
}

