import type { Timeframe } from "./constants";
import type { TradeConfidence } from "./tradeConfidence";
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
  /** The full confidence breakdown as scored at entry (null only for records predating it). */
  confidence: TradeConfidence | null;
  /** Highest target index reached so far (0 = none). */
  highestTargetHit: number;
  stoppedOut: boolean;
  /** True once no further change is expected: all targets hit, or stopped out. */
  resolved: boolean;
  resolvedAt: number | null;
}

/**
 * Walks forward from the entry candle and resolves the trade by the site's
 * stated rules:
 * - Stop loss only by a candle *close* at or below it — a wick through the
 *   stop that closes back above hasn't invalidated the setup (the same
 *   close-based rule zones use for a break). Confirmed live (SAND/4h): a
 *   0.00002 wick under the stop closed well above it and price recovered.
 * - Targets by touch (a candle high reaching them) — a resting take-profit
 *   order fills the moment price trades there.
 * - Within one candle, targets are counted before that candle's close is
 *   checked against the stop: the close is by definition the last price of
 *   the candle, so any target its high reached was reached before it.
 * - The entry candle itself only counts for the stop (its close), never for
 *   targets: its high may have printed *before* price came down into the
 *   zone, so counting it would credit a target hit before the entry.
 * - A still-forming candle (time >= formingCandleTime) can reach a target
 *   (its high is already final) but can't stop the trade out — its close
 *   isn't known yet. This is what makes a result shown live identical to
 *   the one later recorded once that candle closes.
 * `record.highestTargetHit` is taken as already-established progress.
 */
export function evaluateTradeOutcome(
  record: TradeRecord,
  candles: Candle[],
  formingCandleTime: number = Number.POSITIVE_INFINITY
): TradeRecord {
  if (record.resolved) return record;

  let highestTargetHit = record.highestTargetHit;
  let stoppedOut = false;
  let resolvedAt: number | null = null;

  for (const c of candles) {
    if (c.time < record.loggedAt) continue;
    const isEntryCandle = c.time === record.loggedAt;
    const isForming = c.time >= formingCandleTime;

    if (!isEntryCandle) {
      while (highestTargetHit < record.targets.length && c.high >= record.targets[highestTargetHit]) {
        highestTargetHit++;
      }
      if (highestTargetHit === record.targets.length) {
        resolvedAt = c.time;
        break;
      }
    }

    if (!isForming && c.close <= record.stopLoss) {
      stoppedOut = true;
      resolvedAt = c.time;
      break;
    }
  }

  const resolved = stoppedOut || highestTargetHit === record.targets.length;
  return { ...record, highestTargetHit, stoppedOut, resolved, resolvedAt };
}
