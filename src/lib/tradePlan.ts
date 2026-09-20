import { calculateATR } from "./indicators";
import type { Candle, TradePlan, Zone } from "./types";

function latestAtr(candles: Candle[], period = 14): number | null {
  const atr = calculateATR(candles, period);
  return [...atr].reverse().find((v) => Number.isFinite(v) && v > 0) ?? null;
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
 * Builds an automatic trade plan off the nearest active demand zone price
 * has actually returned to — not merely come close to. A zone only forms
 * after its impulse leaves it, so it still has to be waited on: there's no
 * "entry" the moment it forms (or while price is still off making that
 * impulse move elsewhere), only once price is back at or inside the zone
 * itself. A zone price hasn't returned to yet is a level to watch (see
 * findApproachingDemandZone), not a live setup, so it's excluded here even
 * though it's still a perfectly valid zone for the sidebar's zone list.
 *
 * Entry sits at the zone's top (where a pullback first tags it), stop loss
 * just under the zone's bottom, and 3 ascending targets that prefer real
 * active supply zones above entry, falling back to risk-multiples when
 * there aren't enough of those. Returns null if price hasn't returned to
 * any zone yet, or if the first target's reward:risk doesn't clear the
 * minimum bar — a technically strong zone still isn't a trade if the setup
 * itself is poor.
 */
export function buildTradePlan(
  zones: Zone[],
  currentPrice: number,
  candles: Candle[],
  options: BuildTradePlanOptions = {}
): TradePlan | null {
  const { stopBufferRatio = 0.15, targetRMultiples = [1.5, 2.5, 4], minFirstTargetRR = 1 } = options;

  const reachedDemandZones = zones.filter((z) => z.type === "demand" && z.active && currentPrice <= z.top);
  if (reachedDemandZones.length === 0) return null;

  // The shallowest zone price has reached — the one whose top is closest
  // to (just above, or at) the current price.
  const nearest = reachedDemandZones.reduce((closest, zone) => (zone.top < closest.top ? zone : closest));

  const entry = nearest.top;
  const zoneHeight = nearest.top - nearest.bottom;
  const stopLoss = nearest.bottom - zoneHeight * stopBufferRatio;
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

  return { zone: nearest, entry, stopLoss, targets, riskAmount, riskRewardRatios };
}

/**
 * The nearest active demand zone price is heading toward but hasn't
 * actually reached yet — anything price is still above counts, right up to
 * (but not including) the zone itself, since buildTradePlan takes over the
 * instant price reaches it. Close enough to be worth flagging so a limit
 * buy order can be queued at the zone's top ahead of the return, instead of
 * only finding out once price is already there. Returns null once a real
 * trade plan exists (that already covers it) or once nothing sits within
 * the watch range.
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
 * The time span a trade plan's entry/stop/target lines should be drawn
 * over: starting at the zone's own origin (its narrow box's end — where the
 * entry level was actually established) and ending the moment price first
 * reaches the stop loss or any target, whichever comes first — the same
 * "worst case first" convention tradeHistory.ts uses to resolve a trade.
 * Runs to the last available candle if nothing has been hit yet.
 */
export function computeTradePlanLineSpan(tradePlan: TradePlan, candles: Candle[]): { startTime: number; endTime: number } {
  const startIndex = candles.findIndex((c) => c.time >= tradePlan.zone.endTime);
  const fromIndex = startIndex === -1 ? 0 : startIndex;
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
