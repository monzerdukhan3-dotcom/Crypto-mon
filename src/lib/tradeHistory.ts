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
  /** Which distinct return to this same still-unbroken zone this record is — see TradePlan.retestNumber. */
  retestNumber: number;
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
 * logged on, a candle that *closes* at or below the stop loss resolves it
 * as stopped out (checked before that candle's targets — the conservative
 * "worst case first" convention so a single wide candle can't overstate
 * the win rate); otherwise each target reached in turn raises the
 * highest-target-hit count. Only candles within the currently fetched
 * window are visible, so a record older than that window simply keeps its
 * last known state until re-checked with a wider window.
 *
 * Close, not low: a stop-loss is only "real" the same way a zone's own
 * break is (zones.ts' evaluateZoneRange uses `close`, not a wick, for
 * exactly this reason) — a candle that wicks a hair through the stop and
 * closes back above it hasn't actually invalidated the setup, it's the
 * same kind of liquidity grab a zone shrugs off. Confirmed live
 * (SAND/4h): a candle low of 0.03963 against a 0.039649 stop — a 0.00002
 * wick — closed at 0.04016 and price went on to recover to 0.041,
 * exactly the trade a wick-based check would have wrongly called a loss.
 *
 * This does NOT change what stopLoss itself means as a number: it's still
 * the correct price to rest a real stop order at with an exchange, and a
 * real stop-market/stop-limit order fills the instant price touches it,
 * wick or not, regardless of how this backtest scores it after the fact.
 * The gap between "a resting stop order would have executed here" and
 * "this setup, watched rather than pre-placed, wasn't actually
 * invalidated" is real; this function's job is the latter (was the setup
 * itself still good), not a prediction of every possible order type.
 *
 * Includes the entry candle itself deliberately: findEntryIndex only
 * requires that candle's *close* to be at or inside the zone, so a single
 * volatile candle can already close at or below the stop on the very
 * candle that triggered entry. Starting the walk one candle later missed
 * this "instant stop-out" case entirely: with no later candle also
 * closing at the stop, the record could sit pending indefinitely, or even
 * resolve as a win off a later bounce — either way silently skipping a
 * loss that genuinely happened.
 */
export function evaluateTradeOutcome(record: TradeRecord, candles: Candle[]): TradeRecord {
  if (record.resolved) return record;

  let highestTargetHit = record.highestTargetHit;
  let stoppedOut = false;
  let resolvedAt: number | null = null;

  for (const c of candles) {
    if (c.time < record.loggedAt) continue;

    if (c.close <= record.stopLoss) {
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
