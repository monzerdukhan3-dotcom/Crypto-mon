import { calculateATR } from "./indicators";
import { detectTrend } from "./trend";
import type { Candle, TradePlan, Zone } from "./types";

/**
 * How many of a plan's targets have actually been reached since entry,
 * checking every candle's high the same way isEntryStillOpen does — not
 * just where currentPrice happens to sit right now, which can't tell a
 * trade that touched (and pulled back from) target 1 apart from one that
 * never got there at all. Used to tell a genuinely fresh setup (still at
 * or near entry, nothing hit yet) apart from one that's already
 * progressed and simply hasn't been stopped out or fully resolved —
 * still an open position worth showing on its own chart, but no longer a
 * "new opportunity" to list on the opportunities page.
 */
export function getTradePlanProgress(tradePlan: TradePlan, candles: Candle[]): { highestTargetHit: number } {
  // tradePlan.retestNumber picks out *which* of this zone's (up to
  // MAX_ZONE_ENTRIES) returns this specific plan is — entry price is the
  // same zone.top every time, so the plain single-entry finder can't tell
  // them apart; see findEntryIndices' own doc comment.
  const entries = findEntryIndices(
    candles,
    tradePlan.zone.endTime,
    tradePlan.entry,
    tradePlan.zone.bottom,
    tradePlan.retestNumber
  );
  const entryIndex = entries[tradePlan.retestNumber - 1] ?? -1;
  if (entryIndex === -1) return { highestTargetHit: 0 };

  let highestTargetHit = 0;
  const entryTime = candles[entryIndex].time;
  // Includes the entry candle itself, and checks close (not low) against
  // the stop — see evaluateTradeOutcome's own doc comment (tradeHistory.ts)
  // for the full reasoning on both.
  for (const c of candles) {
    if (c.time < entryTime) continue;
    if (c.close <= tradePlan.stopLoss) break;
    while (highestTargetHit < tradePlan.targets.length && c.high >= tradePlan.targets[highestTargetHit]) {
      highestTargetHit++;
    }
    if (highestTargetHit === tradePlan.targets.length) break;
  }
  return { highestTargetHit };
}

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
      const trendAtEntry = detectTrend(candles.slice(0, entryIndex + 1));
      if (trendAtEntry === "down" && !zone.htfOverlap) continue;

      const basePlan = planFromZone(zone, zones, options);
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
 * findApproachingDemandZone); an old break from weeks back that price has
 * long since moved away from isn't relevant context anymore. Purely
 * informational — CandlestickChart renders it dimmed and dashed with a
 * "منطقة مكسورة" label instead of the normal solid box, and it never
 * feeds into buildTradePlan or any other trading decision.
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

  const candidates = zones.filter(
    (z) => !z.active && distanceToPrice(z) <= maxDistance && !supersededByActiveZone(z)
  );
  if (candidates.length === 0) return null;

  const nearest = candidates.reduce((closest, zone) =>
    distanceToPrice(zone) < distanceToPrice(closest) ? zone : closest
  );
  const breakTime = findBreakTime(nearest, candles);
  return breakTime === null ? nearest : { ...nearest, endTime: breakTime };
}

/**
 * The time span a live trade plan's risk/reward box should be drawn over:
 * starting at the actual entry candle (the first return to the zone, which
 * can be well after the zone's own narrow formation box if the position has
 * been open a while) and ending the moment price first reaches the stop
 * loss or any target, whichever comes first — the same "worst case first"
 * convention tradeHistory.ts uses to resolve a trade. Runs to the last
 * available candle if nothing has been hit yet.
 */
export function computeTradePlanSpan(tradePlan: TradePlan, candles: Candle[]): { startTime: number; endTime: number } {
  // Picks out this plan's own retest (see findEntryIndices) rather than
  // always the zone's first entry — entry price is the same zone.top
  // either way, so the plain single-entry finder can't tell them apart.
  const entries = findEntryIndices(
    candles,
    tradePlan.zone.endTime,
    tradePlan.entry,
    tradePlan.zone.bottom,
    tradePlan.retestNumber
  );
  const entryIndex = entries[tradePlan.retestNumber - 1] ?? -1;
  const fromIndex = entryIndex === -1 ? 0 : entryIndex;
  const startTime = candles[fromIndex]?.time ?? tradePlan.zone.endTime;

  let endTime = candles[candles.length - 1]?.time ?? startTime;
  for (let i = fromIndex; i < candles.length; i++) {
    const c = candles[i];
    // Stop is close-based (matches isEntryStillOpen/evaluateTradeOutcome);
    // a target is still touch-based — a real limit sell resting there
    // fills the instant price touches it, no close needed.
    if (c.close <= tradePlan.stopLoss || tradePlan.targets.some((t) => c.high >= t)) {
      endTime = c.time;
      break;
    }
  }

  return { startTime, endTime };
}
