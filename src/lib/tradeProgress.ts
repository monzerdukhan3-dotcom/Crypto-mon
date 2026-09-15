import type { TradePlan } from "./types";

export type TradeProgressStatus = "profit" | "loss" | "at_entry";
export type TradeProgressNearestLevel = "target1" | "stop";

export interface TradeProgress {
  /** currentPrice - entry, in price units. */
  priceDiff: number;
  /** Same, as a % of entry. */
  priceDiffPct: number;
  status: TradeProgressStatus;
  /** Whichever of target 1 or the stop loss is currently closer to price. */
  nearestLevel: TradeProgressNearestLevel;
  /** 0-100+ progress from entry toward that nearest level. */
  proximityPct: number;
}

/** Within this % of entry counts as "at entry" rather than a clear profit/loss. */
const AT_ENTRY_TOLERANCE_PCT = 0.05;

/** Live profit/loss and proximity-to-target-or-stop for an open trade plan. */
export function computeTradeProgress(tradePlan: TradePlan, currentPrice: number): TradeProgress {
  const { entry, stopLoss, targets } = tradePlan;
  const target1 = targets[0];

  const priceDiff = currentPrice - entry;
  const priceDiffPct = (priceDiff / entry) * 100;

  const status: TradeProgressStatus =
    Math.abs(priceDiffPct) <= AT_ENTRY_TOLERANCE_PCT ? "at_entry" : priceDiff > 0 ? "profit" : "loss";

  const distanceToTarget1 = Math.abs(target1 - currentPrice);
  const distanceToStop = Math.abs(currentPrice - stopLoss);
  const nearestLevel: TradeProgressNearestLevel = distanceToTarget1 <= distanceToStop ? "target1" : "stop";

  const proximityPct =
    nearestLevel === "target1"
      ? clamp(((currentPrice - entry) / (target1 - entry)) * 100)
      : clamp(((entry - currentPrice) / (entry - stopLoss)) * 100);

  return { priceDiff, priceDiffPct, status, nearestLevel, proximityPct };
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}
