import type { Timeframe } from "./constants";
import { findEntryIndices, planFromZone } from "./tradePlan";
import { evaluateTradeOutcome, type TradeRecord } from "./tradeHistory";
import { scoreTradeConfidence } from "./tradeConfidence";
import { freezeTradePlans, type TradePlanCandidate } from "./tradeLedger";
import { detectTrend } from "./trend";
import type { Candle } from "./types";
import { detectZoneHistory, detectSearchableZones } from "./zones";

/**
 * 2026-09-20T11:21:37Z — when the trade history switched from a per-browser
 * localStorage log to this server-computed backtest. Only excludes a trade
 * that's fully *resolved* (hit its stop or all targets) before this moment
 * — nobody was ever shown that outcome live, so counting it in the win/loss
 * stats would be fabricated history. A trade still open right now counts
 * regardless of how long ago it entered: it's exactly what a visitor would
 * find live today (the opportunities scan surfaces the same open position),
 * so hiding it here would just make this page contradict that one.
 */
const HISTORY_START_TIME = 1789903297;

/**
 * Replays this symbol+timeframe's own candle history to reconstruct every
 * trade the site would have proposed. For every demand zone that ever
 * validly formed (detectZoneHistory, broken or not), finds every distinct
 * candle after formation that genuinely returns to (or inside) the zone's
 * top — up to MAX_ZONE_ENTRIES of them, the same "3 retests while it stays
 * unbroken" rule buildTradePlan applies live (see findEntryIndices) — and
 * treats each one as its own entry, resolved forward exactly like
 * evaluateTradeOutcome does for a live-logged record: stop loss takes
 * priority over targets on whichever candle hits first. A zone that's
 * tested and held once can go on to produce a second and third record this
 * way, each with its own retestNumber and a lower confidence score
 * (scoreTradeConfidence's own retestPenalty) — still a real, tradable
 * setup, just less fresh than the original.
 *
 * Deliberately NOT filtered against detectZones' live cap (the top few
 * zones the chart actually draws right now): that cap exists purely to
 * keep the live chart uncluttered, not to decide which trades are real.
 * An earlier version of this function *did* require a still-pending trade
 * to also be in today's live cap, meant to keep this page agreeing with
 * the dashboard's "current pick" — but a zone naturally drops out of the
 * top-3/top-2 cap over time as newer zones form, even while the trade it
 * produced is still genuinely open (hasn't hit its stop or any target).
 * That filter made such a trade vanish from history entirely, with no
 * trace anywhere — confirmed directly against live data (19 currently-open
 * trades across the full symbol list would have disappeared this way) —
 * which breaks the one thing a trade history actually promises: once
 * logged, a trade stays visible until it resolves. The live dashboard
 * only ever surfacing its own top-ranked pick, while history keeps every
 * genuine signal until it resolves, is the correct shape for these two
 * views to differ in, not a bug to paper over.
 *
 * Every setup's own definition (entry/stopLoss/targets/riskRewardRatios/
 * confidenceScore/zone) is frozen via tradeLedger.ts the first time it's
 * ever encountered — see freezeTradePlans' own doc comment for why a
 * freshly recomputed value can't just be used directly even after the
 * no-look-ahead fix below: two independent requests (this one, the live
 * dashboard) each re-fetch candles at slightly different moments and can
 * derive a slightly different "zone map as of entry," so only a genuinely
 * *stored* value stays byte-identical to what a visitor actually saw.
 * Only the *outcome* (highestTargetHit/stoppedOut/resolved) is still
 * evaluated fresh against today's candles every time — that's supposed to
 * change as real price action unfolds, unlike the setup's own definition.
 */
export async function backtestTradeHistory(
  symbol: string,
  timeframe: Timeframe,
  candles: Candle[],
  dailyCandles: Candle[] | null = null
): Promise<TradeRecord[]> {
  if (candles.length === 0) return [];

  const zones = detectZoneHistory(candles, { higherTimeframeCandles: dailyCandles });

  interface PendingEntry {
    id: string;
    retestNumber: number;
    entryIndex: number;
  }

  const candidates: TradePlanCandidate[] = [];
  const pending: PendingEntry[] = [];

  for (const zone of zones) {
    if (zone.type !== "demand") continue;

    // Strip the pivotIndex detectZoneHistory adds internally — a record
    // only needs the plain Zone shape it'll later draw on its own chart.
    const { pivotIndex: _pivotIndex, ...zoneWithoutPivot } = zone;
    void _pivotIndex;

    const entryIndices = findEntryIndices(candles, zone.endTime, zone.top, zone.bottom);
    for (let i = 0; i < entryIndices.length; i++) {
      const entryIndex = entryIndices[i];
      const retestNumber = i + 1;

      // تداخل المناطق: same eligibility gate buildTradePlan applies live —
      // only a confirmed downtrend at entry time needed higher-timeframe
      // overlap to be a real buy (a sideways trend is fine on its own),
      // judged only from what was known as of that specific entry's own
      // candle — the trend can genuinely differ between a zone's 1st and
      // 2nd retest, so each is checked independently, not inherited from
      // the first.
      const candlesAtEntry = candles.slice(0, entryIndex + 1);
      const trendAtEntry = detectTrend(candlesAtEntry);
      if (trendAtEntry === "down" && !zone.htfOverlap) continue;

      // No-look-ahead target/confidence selection: see this function's own
      // doc comment and freezeTradePlans' — only candles up to and
      // including the entry candle are visible here, not the full
      // (future-including) series.
      const zonesAsOfEntry = detectSearchableZones(candlesAtEntry);
      const basePlan = planFromZone(zone, zonesAsOfEntry);
      if (!basePlan) continue;

      const confidence = scoreTradeConfidence({ ...basePlan, retestNumber }, zonesAsOfEntry, candlesAtEntry, null);

      const id = `${symbol}:${timeframe}:${zone.id}:${retestNumber}`;
      candidates.push({
        id,
        symbol,
        timeframe,
        retestNumber,
        loggedAt: candles[entryIndex].time,
        entry: basePlan.entry,
        stopLoss: basePlan.stopLoss,
        targets: basePlan.targets,
        riskRewardRatios: basePlan.riskRewardRatios,
        confidenceScore: confidence.score,
        zone: zoneWithoutPivot,
      });
      pending.push({ id, retestNumber, entryIndex });
    }
  }

  const frozen = await freezeTradePlans(candidates);

  const records: TradeRecord[] = [];
  for (const p of pending) {
    const fields = frozen.get(p.id);
    if (!fields) continue;

    const preliminary: TradeRecord = {
      id: p.id,
      symbol,
      timeframe,
      loggedAt: candles[p.entryIndex].time,
      entry: fields.entry,
      stopLoss: fields.stopLoss,
      targets: fields.targets,
      riskRewardRatios: fields.riskRewardRatios,
      zone: fields.zone,
      retestNumber: p.retestNumber,
      confidenceScore: fields.confidenceScore,
      highestTargetHit: 0,
      stoppedOut: false,
      resolved: false,
      resolvedAt: null,
    };

    const resolved = evaluateTradeOutcome(preliminary, candles);
    // See HISTORY_START_TIME above: only a fully-resolved-before-launch
    // trade is fabricated history — a still-open one is exactly what
    // today's opportunities scan would also be showing.
    if (resolved.resolved && resolved.resolvedAt !== null && resolved.resolvedAt < HISTORY_START_TIME) continue;

    records.push(resolved);
  }

  return records;
}
