import { calculateATR } from "./indicators";
import { detectTrend } from "./trend";
import type { Candle, TradePlan, Zone } from "./types";
import { detectSearchableZones } from "./zones";

function latestAtr(candles: Candle[], period = 14): number | null {
  const atr = calculateATR(candles, period);
  return [...atr].reverse().find((v) => Number.isFinite(v) && v > 0) ?? null;
}

/**
 * Index of the first candle, after `fromTime`, whose close genuinely
 * *returns* to (or inside) `zoneTop` — a real pullback, not a fresh zone
 * that hasn't actually left yet. `fromTime` must be the zone's own
 * `endTime` (just past its base): the base candles themselves are what
 * defined the zone's price range, and the impulse that follows doesn't
 * always clear the zone on its very first candle — some breakouts take 2-3
 * candles to actually close above `zoneTop`. Scanning for "close <= top"
 * starting right at the base's end would trivially match one of those
 * still-inside-the-zone candles before the impulse even confirms, which
 * isn't a return at all. So this first requires a confirmed break (some
 * candle actually closing beyond `zoneTop`), then looks for the first
 * later close back at or inside it — the only thing "price came back"
 * should mean.
 */
export function findEntryIndex(candles: Candle[], fromTime: number, zoneTop: number): number {
  const startIndex = candles.findIndex((c) => c.time >= fromTime);
  if (startIndex === -1) return -1;

  let breakoutIndex = -1;
  for (let i = startIndex; i < candles.length; i++) {
    if (candles[i].close > zoneTop) {
      breakoutIndex = i;
      break;
    }
  }
  if (breakoutIndex === -1) return -1;

  for (let i = breakoutIndex + 1; i < candles.length; i++) {
    if (candles[i].close <= zoneTop) return i;
  }
  return -1;
}

/** How many times price may re-enter the same still-unbroken demand zone before it's considered exhausted. */
export const MAX_ZONE_ENTRIES = 3;

/**
 * Every distinct return to the zone since its confirmed breakout, up to
 * `maxEntries` (index 0 = the same first entry findEntryIndex itself
 * finds). Each entry past the first only counts once the previous one has
 * genuinely resolved *away* from the zone again — a close back above
 * `zoneTop`, meaning that test succeeded and price left, not just ticked
 * back and forth inside the box — and only as long as the zone hasn't
 * broken (a close decisively below `zoneBottom`, zones.ts' own definition
 * of `Zone.active` flipping false) at any point since. A zone that breaks
 * is exhausted for good at that point: "صالحة للدخول 3 مرات ما دامت
 * سليمة" — no further entries, whether or not it's found all 3 yet.
 *
 * The entry condition itself (`close <= zoneTop`) is identical for every
 * one of them, including the first — deliberately not stricter for a
 * retest than for the original entry, even for a candle that's already
 * crashed clean through the zone and its stop: that candle is still a
 * genuine fill, just one evaluateTradeOutcome then correctly resolves as
 * an instant loss (see its own doc comment) rather than one this function
 * should second-guess by excluding.
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
    if (candles[i].close > zoneTop) {
      breakoutIndex = i;
      break;
    }
  }
  if (breakoutIndex === -1) return [];

  const entries: number[] = [];
  let searchFrom = breakoutIndex + 1;

  while (entries.length < maxEntries) {
    let entryIndex = -1;
    for (let i = searchFrom; i < candles.length; i++) {
      if (candles[i].close <= zoneTop) {
        entryIndex = i;
        break;
      }
    }
    if (entryIndex === -1) break;
    entries.push(entryIndex);
    if (entries.length >= maxEntries) break;

    let leftAgainIndex = -1;
    for (let i = entryIndex + 1; i < candles.length; i++) {
      if (candles[i].close < zoneBottom) return entries; // broken — no further entries
      if (candles[i].close > zoneTop) {
        leftAgainIndex = i;
        break;
      }
    }
    if (leftAgainIndex === -1) break;
    searchFrom = leftAgainIndex + 1;
  }

  return entries;
}

/**
 * False once price has, at or after `entryTime` (see evaluateTradeOutcome's
 * own doc comment in tradeHistory.ts for why the entry candle itself is
 * included), closed the trade out — a *close* reaching the stop loss
 * (checked first, same "worst case first" convention tradeHistory.ts
 * uses; close rather than a wick low, for the same reason
 * evaluateTradeOutcome uses close — see its own doc comment) or a high
 * reaching every target in turn. Mirrors evaluateTradeOutcome's own
 * resolution loop, just collapsed to the yes/no "is this still an open
 * position" buildTradePlan needs instead of a full
 * resolved/stoppedOut/highestTargetHit record.
 */
function isEntryStillOpen(stopLoss: number, targets: number[], entryTime: number, candles: Candle[]): boolean {
  let highestTargetHit = 0;
  for (const c of candles) {
    if (c.time < entryTime) continue;
    if (c.close <= stopLoss) return false;
    while (highestTargetHit < targets.length && c.high >= targets[highestTargetHit]) {
      highestTargetHit++;
    }
    if (highestTargetHit === targets.length) return false;
  }
  return true;
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
 * itself is poor. Shared by buildTradePlan (today's live setup) and the
 * trade-history backtest (every zone that ever formed).
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

  // Defaults to the first entry — buildTradePlan and backtestTradeHistory
  // both override this with the actual retest number once they know it,
  // since planFromZone itself only computes the zone's geometry, not which
  // return to it this particular plan is for.
  return { zone, entry, stopLoss, targets, riskAmount, riskRewardRatios, retestNumber: 1 };
}

/**
 * Builds an automatic trade plan off a demand zone with a currently open
 * position on it — price has, at some point since the zone formed, closed
 * at or inside it (a real return, not merely a wick through), and that
 * resulting trade hasn't since hit its stop loss or all of its targets.
 * This is deliberately NOT "is currentPrice inside the zone right now": a
 * live snapshot like that would lose the plan the moment price ticks back
 * away from a zone it only just tagged, even though the trade it triggered
 * is still open — exactly the same entry+resolution logic the trade-history
 * backtest uses, so a zone showing an open position here is the same zone
 * that shows a "قيد الانتظار" record in /history. A zone price hasn't
 * returned to at all yet is a level to watch (see findApproachingDemandZone),
 * not a live setup, so it's excluded here even though it's still a
 * perfectly valid zone for the sidebar's zone list.
 *
 * Deliberately NOT gated on zone.active either, for the same reason: the
 * stop loss sits a buffer below the zone's own raw bottom (see
 * planFromZone's stopBufferRatio), so price can close below that raw
 * bottom — marking the zone box itself "broken" for display purposes —
 * without actually reaching the trade's real stop loss. The trade-history
 * backtest never checks zone.active at all, only the real stop/targets via
 * isEntryStillOpen below; gating on it here too would make a position
 * buildTradePlan can no longer see for a plan /history still correctly
 * shows as open — confirmed directly against live data (FLOW/4h).
 *
 * "تداخل المناطق": when this timeframe's own trend wasn't clearly up as of
 * the entry candle, a demand zone here was only safe to buy if it overlaps
 * a same-type zone on the higher timeframe (zone.htfOverlap) — real support
 * from above, not just this timeframe's own read at the time. Judged from
 * what was known then, not from today's trend, which can have changed
 * since.
 */
export function buildTradePlan(
  zones: Zone[],
  currentPrice: number,
  candles: Candle[],
  options: BuildTradePlanOptions = {}
): TradePlan | null {
  interface Candidate {
    zone: Zone;
    retestNumber: number;
    plan: TradePlan;
  }

  const candidates: Candidate[] = [];

  for (const zone of zones) {
    if (zone.type !== "demand") continue;

    // Every distinct return to this zone so far (up to MAX_ZONE_ENTRIES),
    // each independently eligible — the market's trend can genuinely
    // differ between a zone's 1st and 2nd retest, so this isn't just "was
    // entry 1 valid, copy that for the rest".
    const entryIndices = findEntryIndices(candles, zone.endTime, zone.top, zone.bottom);
    for (let i = 0; i < entryIndices.length; i++) {
      const entryIndex = entryIndices[i];
      const retestNumber = i + 1;

      // Reject only a confirmed downtrend at entry — a demand-zone bounce
      // fighting an actively falling market, unless the zone shares price
      // with a daily zone (zone.htfOverlap), the one case worth taking
      // even against the entry-timeframe trend. A sideways trend is let
      // through too: still a real bounce off a real level, just without a
      // clear trend either way.
      const candlesAtEntry = candles.slice(0, entryIndex + 1);
      const trendAtEntry = detectTrend(candlesAtEntry);
      if (trendAtEntry === "down" && !zone.htfOverlap) continue;

      // Target selection (planFromZone's supplyTargetsAbove) picks the
      // nearest currently-active supply zones — using the live `zones`
      // here would let an already-entered position's own targets silently
      // shift on every later poll as fresh candles change which supply
      // zones are active, even though a real trader's limit-sell orders
      // were placed once at entry and don't move themselves afterward.
      // Same fix, and the same live-data confirmation (SAND/1h), as
      // backtestTradeHistory's identical use of planFromZone.
      const zonesAsOfEntry = detectSearchableZones(candlesAtEntry);
      const basePlan = planFromZone(zone, zonesAsOfEntry, options);
      if (!basePlan) continue;

      if (!isEntryStillOpen(basePlan.stopLoss, basePlan.targets, candles[entryIndex].time, candles)) continue;

      candidates.push({ zone, retestNumber, plan: { ...basePlan, retestNumber } });
    }
  }

  if (candidates.length === 0) return null;

  // A zone can have more than one of its retests simultaneously "still
  // open" (price left after an early one without yet hitting its stop or
  // final target, then came back for another) — only the latest is the
  // position actually worth showing as this zone's live plan.
  const latestPerZone = new Map<string, Candidate>();
  for (const candidate of candidates) {
    const existing = latestPerZone.get(candidate.zone.id);
    if (!existing || candidate.retestNumber > existing.retestNumber) {
      latestPerZone.set(candidate.zone.id, candidate);
    }
  }

  // Among every zone with a still-open position, the one whose top sits
  // closest to the current price — the most immediately relevant to show.
  const nearest = [...latestPerZone.values()].reduce((closest, candidate) =>
    Math.abs(candidate.zone.top - currentPrice) < Math.abs(closest.zone.top - currentPrice) ? candidate : closest
  );

  return nearest.plan;
}

/**
 * The nearest active demand zone price is heading toward but hasn't
 * actually reached yet — anything price is still above counts, right up to
 * (but not including) the zone itself, since buildTradePlan takes over once
 * price closes at or inside it. Close enough to be worth flagging so a
 * limit buy order can be queued at the zone's top ahead of the return,
 * instead of only finding out once price is already there. Returns null
 * once a real trade plan exists (that already covers it) or once nothing
 * sits within the watch range.
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
    if (z.type !== "demand" || !z.active || z.top >= currentPrice) return false;
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
 * it never feeds into buildTradePlan or any other trading decision.
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

