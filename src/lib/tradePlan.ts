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
  const entryIndex = findEntryIndex(candles, tradePlan.zone.endTime, tradePlan.entry);
  if (entryIndex === -1) return { highestTargetHit: 0 };

  let highestTargetHit = 0;
  const entryTime = candles[entryIndex].time;
  for (const c of candles) {
    if (c.time <= entryTime) continue;
    if (c.low <= tradePlan.stopLoss) break;
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

/**
 * False once price has, at any candle after `entryTime`, closed the trade
 * out — a low reaching the stop loss (checked first, same "worst case
 * first" convention tradeHistory.ts uses) or a high reaching every target
 * in turn. Mirrors evaluateTradeOutcome's own resolution loop, just
 * collapsed to the yes/no "is this still an open position" buildTradePlan
 * needs instead of a full resolved/stoppedOut/highestTargetHit record.
 */
function isEntryStillOpen(stopLoss: number, targets: number[], entryTime: number, candles: Candle[]): boolean {
  let highestTargetHit = 0;
  for (const c of candles) {
    if (c.time <= entryTime) continue;
    if (c.low <= stopLoss) return false;
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

  const targets: number[] = [];
  for (let i = 0; i < targetRMultiples.length; i++) {
    const candidate = supplyTargetsAbove[i] ?? entry + riskAmount * targetRMultiples[i];
    const minAllowed = (i === 0 ? entry : targets[i - 1]) + riskAmount * 0.5;
    targets.push(Math.max(candidate, minAllowed));
  }

  const riskRewardRatios = targets.map((t) => Number(((t - entry) / riskAmount).toFixed(2)));
  if (riskRewardRatios[0] < minFirstTargetRR) return null;

  return { zone, entry, stopLoss, targets, riskAmount, riskRewardRatios };
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
  const openZones = zones.filter((zone) => {
    if (zone.type !== "demand") return false;

    const entryIndex = findEntryIndex(candles, zone.endTime, zone.top);
    if (entryIndex === -1) return false;

    const trendAtEntry = detectTrend(candles.slice(0, entryIndex + 1));
    if (trendAtEntry !== "up" && !zone.htfOverlap) return false;

    const plan = planFromZone(zone, zones, options);
    if (!plan) return false;

    return isEntryStillOpen(plan.stopLoss, plan.targets, candles[entryIndex].time, candles);
  });

  if (openZones.length === 0) return null;

  // Among every zone with a still-open position, the one whose top sits
  // closest to the current price — the most immediately relevant to show.
  const nearest = openZones.reduce((closest, zone) =>
    Math.abs(zone.top - currentPrice) < Math.abs(closest.top - currentPrice) ? zone : closest
  );

  return planFromZone(nearest, zones, options);
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

  const candidates = zones.filter((z) => !z.active && distanceToPrice(z) <= maxDistance);
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
  const entryIndex = findEntryIndex(candles, tradePlan.zone.endTime, tradePlan.entry);
  const fromIndex = entryIndex === -1 ? 0 : entryIndex;
  const startTime = candles[fromIndex]?.time ?? tradePlan.zone.endTime;

  let endTime = candles[candles.length - 1]?.time ?? startTime;
  for (let i = fromIndex; i < candles.length; i++) {
    const c = candles[i];
    if (c.low <= tradePlan.stopLoss || tradePlan.targets.some((t) => c.high >= t)) {
      endTime = c.time;
      break;
    }
  }

  return { startTime, endTime };
}
