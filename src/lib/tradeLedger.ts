import { ensureSchema, sql } from "./db";
import { scoreTradeConfidence } from "./tradeConfidence";
import { findEntryIndices } from "./tradePlan";
import type { Candle, TradePlan, Zone } from "./types";
import { detectSearchableZones } from "./zones";

/**
 * Everything about a trade setup that must stay fixed forever once a
 * visitor first sees it — the fields tradeLedger.ts freezes in the
 * `trade_plans` table.
 */
export interface FrozenTradePlanFields {
  entry: number;
  stopLoss: number;
  targets: number[];
  riskRewardRatios: number[];
  confidenceScore: number;
  zone: Zone;
}

export interface TradePlanCandidate extends FrozenTradePlanFields {
  /** `${symbol}:${timeframe}:${zone.id}:${retestNumber}` — matches TradeRecord.id. */
  id: string;
  symbol: string;
  timeframe: string;
  retestNumber: number;
  loggedAt: number;
}

interface TradePlanRow {
  id: string;
  entry: number;
  stop_loss: number;
  targets: number[];
  risk_reward_ratios: number[];
  confidence_score: number;
  zone: Zone;
}

/**
 * Every candidate trade setup here was just freshly recomputed from
 * whatever the live candle/zone data looks like *right now* — accurate for
 * a setup nobody has seen yet, but wrong for one that already exists:
 * detectZones/detectSearchableZones are always re-run from scratch on
 * every request, so a supply zone's own active status (and therefore
 * which one a target picks) keeps changing long after a trade first
 * appeared or even resolved. Left unchecked, a resolved trade's own
 * recorded targets — and the confidence score derived from the same zone
 * map — would silently keep drifting on every future page load, which is
 * exactly the "the targets I saw live don't match what's in the history
 * now" mismatch a live comparison (SAND/1h) confirmed even after the
 * no-look-ahead fix (candles.slice(0, entryIndex + 1)) closed the
 * *future*-data half of the problem: two separate requests (the live
 * dashboard, the history/opportunities scan) still each independently
 * re-fetch and re-derive "the zone map as of entry" from whatever candle
 * window Binance happens to hand back at that exact moment, and those two
 * windows are never guaranteed byte-identical.
 *
 * The only way to guarantee a trade's own numbers stay exactly what a
 * visitor actually saw is to stop recomputing them after the first
 * sighting: this function looks up every candidate by id, freezes
 * (inserts) whichever ones aren't in `trade_plans` yet using the value
 * just computed for them, and returns the *stored* fields for every id —
 * the ones just inserted for a genuinely new setup, or the untouched
 * original for one already logged. Callers should overwrite their own
 * freshly-computed entry/stopLoss/targets/riskRewardRatios/
 * confidenceScore/zone with whatever this returns before doing anything
 * else with them (evaluating the outcome against current candles is still
 * fine to do fresh every time — only the setup's own definition needs to
 * be fixed, not how far price has since moved against it).
 *
 * Never throws: a database hiccup here shouldn't take down the whole
 * opportunities/history page, so on any error every candidate's own
 * freshly-computed fields are returned unfrozen instead (the same
 * behavior this whole function exists to fix, but only for that one
 * request rather than a hard failure).
 */
export async function freezeTradePlans(
  candidates: TradePlanCandidate[]
): Promise<Map<string, FrozenTradePlanFields>> {
  const result = new Map<string, FrozenTradePlanFields>();
  if (candidates.length === 0) return result;

  try {
    await ensureSchema();
    const db = sql();
    const ids = candidates.map((c) => c.id);

    const existingRows = (await db`
      select id, entry, stop_loss, targets, risk_reward_ratios, confidence_score, zone
      from trade_plans
      where id = any(${ids})
    `) as TradePlanRow[];

    for (const row of existingRows) {
      result.set(row.id, {
        entry: Number(row.entry),
        stopLoss: Number(row.stop_loss),
        targets: row.targets,
        riskRewardRatios: row.risk_reward_ratios,
        confidenceScore: row.confidence_score,
        zone: row.zone,
      });
    }

    const missing = candidates.filter((c) => !result.has(c.id));
    for (const c of missing) {
      // on conflict do nothing: two concurrent requests racing to log the
      // same brand-new setup both attempt the insert, but only one wins —
      // harmless either way since both were about to write identical data
      // freshly computed from the same live state.
      await db`
        insert into trade_plans
          (id, symbol, timeframe, retest_number, logged_at, entry, stop_loss, targets, risk_reward_ratios, confidence_score, zone)
        values (
          ${c.id}, ${c.symbol}, ${c.timeframe}, ${c.retestNumber}, ${c.loggedAt},
          ${c.entry}, ${c.stopLoss}, ${JSON.stringify(c.targets)}::jsonb,
          ${JSON.stringify(c.riskRewardRatios)}::jsonb, ${c.confidenceScore}, ${JSON.stringify(c.zone)}::jsonb
        )
        on conflict (id) do nothing
      `;
      result.set(c.id, {
        entry: c.entry,
        stopLoss: c.stopLoss,
        targets: c.targets,
        riskRewardRatios: c.riskRewardRatios,
        confidenceScore: c.confidenceScore,
        zone: c.zone,
      });
    }
  } catch {
    for (const c of candidates) {
      if (!result.has(c.id)) {
        result.set(c.id, {
          entry: c.entry,
          stopLoss: c.stopLoss,
          targets: c.targets,
          riskRewardRatios: c.riskRewardRatios,
          confidenceScore: c.confidenceScore,
          zone: c.zone,
        });
      }
    }
  }

  return result;
}

/**
 * Freezes a single live-computed TradePlan (see freezeTradePlans' own doc
 * comment) and returns it with entry/stopLoss/targets/riskRewardRatios/zone
 * overwritten by whatever's actually stored — the shared helper both the
 * opportunities scan and the single-coin dashboard's own trade-plan
 * endpoint use, so a setup first seen through either one freezes with an
 * identical id and identical fields.
 */
export async function freezeLiveTradePlan(
  tradePlan: TradePlan,
  candles: Candle[],
  symbol: string,
  timeframe: string
): Promise<{ tradePlan: TradePlan; confidenceScore: number }> {
  const entryIndices = findEntryIndices(candles, tradePlan.zone.endTime, tradePlan.zone.top, tradePlan.zone.bottom);
  const entryIndex = entryIndices[tradePlan.retestNumber - 1];
  if (entryIndex === undefined) {
    // Shouldn't happen for a plan buildTradePlan itself just returned, but
    // falls back to the freshly-computed (unfrozen) plan rather than
    // throwing if it somehow does.
    return { tradePlan, confidenceScore: 0 };
  }

  const candlesAtEntry = candles.slice(0, entryIndex + 1);
  const zonesAsOfEntry = detectSearchableZones(candlesAtEntry);
  const confidence = scoreTradeConfidence(tradePlan, zonesAsOfEntry, candlesAtEntry, null);
  const id = `${symbol}:${timeframe}:${tradePlan.zone.id}:${tradePlan.retestNumber}`;

  const frozen = await freezeTradePlans([
    {
      id,
      symbol,
      timeframe,
      retestNumber: tradePlan.retestNumber,
      loggedAt: candles[entryIndex].time,
      entry: tradePlan.entry,
      stopLoss: tradePlan.stopLoss,
      targets: tradePlan.targets,
      riskRewardRatios: tradePlan.riskRewardRatios,
      confidenceScore: confidence.score,
      zone: tradePlan.zone,
    },
  ]);

  const fields = frozen.get(id);
  if (!fields) return { tradePlan, confidenceScore: confidence.score };

  return {
    tradePlan: {
      ...tradePlan,
      entry: fields.entry,
      stopLoss: fields.stopLoss,
      targets: fields.targets,
      riskRewardRatios: fields.riskRewardRatios,
      zone: fields.zone,
    },
    confidenceScore: fields.confidenceScore,
  };
}
