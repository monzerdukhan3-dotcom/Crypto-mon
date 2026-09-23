import type { Timeframe } from "./constants";
import type { Candle, Zone } from "./types";

export interface TradeRecord {
  id: string;
  symbol: string;
  timeframe: Timeframe;
  loggedAt: number; // unix seconds
  entry: number;
  stopLoss: number;
  targets: number[];
  riskRewardRatios: number[];
  /**
   * The exact zone this record's plan came from — kept on the record itself
   * (rather than re-detected from today's candles when the chart's drawn)
   * so an old or already-resolved trade's chart always shows the zone that
   * actually produced it, even once that zone has broken or dropped out of
   * detectZones' current top-N ranking. Re-detecting live would draw
   * whatever's active *today*, which is frequently a different zone
   * entirely from the one this specific trade was based on.
   */
  zone: Zone;
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
 * symbol+timeframe: walking forward from (and including) the candle it was
 * logged on, a candle whose low reaches the stop loss resolves it as
 * stopped out (checked before that candle's targets — the conservative
 * "worst case first" convention so a single wide candle can't overstate
 * the win rate); otherwise each target reached in turn raises the
 * highest-target-hit count. Only candles within the currently fetched
 * window are visible, so a record older than that window simply keeps its
 * last known state until re-checked with a wider window.
 *
 * Includes the entry candle itself deliberately: findEntryIndex only
 * requires that candle's *close* to be at or inside the zone, so a single
 * volatile candle can wick from above the zone all the way through it
 * and below the stop before closing back inside — entry (crossing
 * zoneTop) and the stop-loss level are hit within the same candle, entry
 * always first since price moves continuously and the stop sits further
 * below the zone than the entry itself. Starting the walk one candle
 * later missed this "instant stop-out" case entirely: with no later
 * candle also reaching the stop, the record could sit pending
 * indefinitely, or even resolve as a win off a later bounce — either way
 * silently skipping a loss that genuinely happened. Confirmed live: about
 * 1 in 6 real entries across a sample of major pairs has this shape.
 */
export function evaluateTradeOutcome(record: TradeRecord, candles: Candle[]): TradeRecord {
  if (record.resolved) return record;

  let highestTargetHit = record.highestTargetHit;
  let stoppedOut = false;
  let resolvedAt: number | null = null;

  for (const c of candles) {
    if (c.time < record.loggedAt) continue;

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
