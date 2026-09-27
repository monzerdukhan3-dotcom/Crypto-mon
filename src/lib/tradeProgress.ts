import type { TradePlan } from "./types";

export type TradeProgressStatus = "profit" | "loss" | "at_entry";
export type TradeProgressNearestLevel = "target" | "stop";

export interface TradeProgress {
  /** currentPrice - entry, in price units. */
  priceDiff: number;
  /** Same, as a % of entry. */
  priceDiffPct: number;
  status: TradeProgressStatus;
  /** Whichever of the next un-hit target or the stop loss is currently closer to price. */
  nearestLevel: TradeProgressNearestLevel;
  /** 1-based target number nearestLevel refers to — meaningless when nearestLevel is "stop". */
  targetNumber: number;
  /** 0-100+ progress from the previous level (entry, or the last hit target) toward that nearest level. */
  proximityPct: number;
}

/** Within this % of entry counts as "at entry" rather than a clear profit/loss. */
const AT_ENTRY_TOLERANCE_PCT = 0.05;

/**
 * Live profit/loss and proximity-to-target-or-stop for an open trade plan.
 * `highestTargetHit` (0 = none yet) picks which target this tracks toward —
 * without it, this always tracked target 1 specifically, so once price
 * actually passed it the bar just stuck at a clamped 100% "approaching
 * target 1" forever instead of moving on to track target 2 or 3 the way
 * the trade itself keeps going. Clamped to the last target once every
 * target's been hit, since there's nothing further to approach.
 */
export function computeTradeProgress(
  tradePlan: TradePlan,
  currentPrice: number,
  highestTargetHit: number = 0
): TradeProgress {
  const { entry, stopLoss, targets } = tradePlan;
  const targetIndex = Math.min(highestTargetHit, targets.length - 1);
  const nextTarget = targets[targetIndex];
  const previousLevel = targetIndex === 0 ? entry : targets[targetIndex - 1];

  const priceDiff = currentPrice - entry;
  const priceDiffPct = (priceDiff / entry) * 100;

  const status: TradeProgressStatus =
    Math.abs(priceDiffPct) <= AT_ENTRY_TOLERANCE_PCT ? "at_entry" : priceDiff > 0 ? "profit" : "loss";

  // Which side to track is decided by direction (price is above entry →
  // heading toward the target; below → toward the stop), not by which one
  // happens to be numerically closer in raw price terms — a real
  // asymmetric R:R plan can put the stop closer to entry than target 1 is,
  // which made a trade already sitting in profit read as "approaching
  // stop loss" purely because of that geometry, not because price was
  // actually moving toward it. "at_entry" (too close to call either way)
  // still falls back to whichever is nearer.
  const nearestLevel: TradeProgressNearestLevel =
    status === "profit" ? "target" : status === "loss" ? "stop" : Math.abs(nextTarget - currentPrice) <= Math.abs(currentPrice - stopLoss) ? "target" : "stop";

  const proximityPct =
    nearestLevel === "target"
      ? clamp(((currentPrice - previousLevel) / (nextTarget - previousLevel)) * 100)
      : clamp(((entry - currentPrice) / (entry - stopLoss)) * 100);

  return { priceDiff, priceDiffPct, status, nearestLevel, targetNumber: targetIndex + 1, proximityPct };
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}
