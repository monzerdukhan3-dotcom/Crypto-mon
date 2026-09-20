import type { Timeframe } from "./constants";
import type { Candle } from "./types";

export interface TradeRecord {
  id: string;
  symbol: string;
  timeframe: Timeframe;
  loggedAt: number; // unix seconds
  entry: number;
  stopLoss: number;
  targets: number[];
  riskRewardRatios: number[];
  confidenceScore: number;
  /** Highest target index reached so far (0 = none). */
  highestTargetHit: number;
  stoppedOut: boolean;
  /** True once no further change is expected: all targets hit, or stopped out. */
  resolved: boolean;
  resolvedAt: number | null;
}

/**
 * Re-evaluates a pending record against freshly fetched candles for its own
 * symbol+timeframe: walking forward from when it was logged, a candle whose
 * low reaches the stop loss resolves it as stopped out (checked before that
 * candle's targets — the conservative "worst case first" convention so a
 * single wide candle can't overstate the win rate); otherwise each target
 * reached in turn raises the highest-target-hit count. Only candles within
 * the currently fetched window are visible, so a record older than that
 * window simply keeps its last known state until re-checked with a wider
 * window.
 */
export function evaluateTradeOutcome(record: TradeRecord, candles: Candle[]): TradeRecord {
  if (record.resolved) return record;

  let highestTargetHit = record.highestTargetHit;
  let stoppedOut = false;
  let resolvedAt: number | null = null;

  for (const c of candles) {
    if (c.time <= record.loggedAt) continue;

    if (c.low <= record.stopLoss) {
      stoppedOut = true;
      resolvedAt = c.time;
      break;
    }

    while (highestTargetHit < record.targets.length && c.high >= record.targets[highestTargetHit]) {
      highestTargetHit++;
    }
    if (highestTargetHit === record.targets.length) {
      resolvedAt = c.time;
      break;
    }
  }

  const resolved = stoppedOut || highestTargetHit === record.targets.length;
  return { ...record, highestTargetHit, stoppedOut, resolved, resolvedAt };
}
