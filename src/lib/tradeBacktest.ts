import type { Timeframe } from "./constants";
import { findEntryIndex, planFromZone } from "./tradePlan";
import { evaluateTradeOutcome, type TradeRecord } from "./tradeHistory";
import { scoreTradeConfidence } from "./tradeConfidence";
import { detectTrend } from "./trend";
import type { Candle } from "./types";
import { detectZoneHistory, detectZones } from "./zones";

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
 * trade the site would have proposed, deterministically — no stored state
 * needed, since it's rebuilt fresh from the same public candles everyone
 * sees. For every demand zone that ever validly formed (detectZoneHistory,
 * broken or not), finds the first candle after formation that genuinely
 * returns to (or inside) the zone's top — a real pullback after a
 * confirmed break away, the same rule buildTradePlan applies live (see
 * findEntryIndex) — and treats that as the entry, then resolves it forward
 * exactly like evaluateTradeOutcome does for a live-logged record: stop
 * loss takes priority over targets on whichever candle hits first. A
 * still-pending result is only counted if the zone is also in today's live
 * cap (see the comment below) — a resolved one always counts once past
 * HISTORY_START_TIME.
 *
 * Because this always re-derives from the full 200-candle window, the
 * result is identical for every visitor and every browser — there's
 * nothing local or per-user about it.
 */
export function backtestTradeHistory(
  symbol: string,
  timeframe: Timeframe,
  candles: Candle[],
  dailyCandles: Candle[] | null = null
): TradeRecord[] {
  if (candles.length === 0) return [];

  const zones = detectZoneHistory(candles, { higherTimeframeCandles: dailyCandles });
  const records: TradeRecord[] = [];

  for (const zone of zones) {
    if (zone.type !== "demand") continue;

    const entryIndex = findEntryIndex(candles, zone.endTime, zone.top);
    if (entryIndex === -1) continue; // price never actually left, then came back, to this zone

    // تداخل المناطق: same eligibility gate buildTradePlan applies live —
    // a broken/non-up trend at entry time needed higher-timeframe overlap
    // to be a real buy, judged only from what was known as of that candle.
    const trendAtEntry = detectTrend(candles.slice(0, entryIndex + 1));
    if (trendAtEntry !== "up" && !zone.htfOverlap) continue;

    const plan = planFromZone(zone, zones);
    if (!plan) continue;

    const preliminary: TradeRecord = {
      id: `${symbol}:${timeframe}:${zone.id}`,
      symbol,
      timeframe,
      loggedAt: candles[entryIndex].time,
      entry: plan.entry,
      stopLoss: plan.stopLoss,
      targets: plan.targets,
      riskRewardRatios: plan.riskRewardRatios,
      confidenceScore: 0,
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

    // detectZoneHistory is deliberately uncapped (a full backtest needs
    // every zone that ever formed), but the live chart only ever shows the
    // strongest few active zones per side (detectZones' cap). A trade
    // that's still pending has to be judged against that same live cap —
    // today's, the exact list buildTradePlan/opportunities use, not a
    // frozen point-in-time snapshot — so a "قيد الانتظار" record here is
    // never something the live dashboard disagrees is currently showing.
    // An already-resolved trade skips this: its outcome already happened,
    // and its zone can easily have broken or fallen out of today's ranking
    // since, which shouldn't erase a real result from the ledger.
    if (!resolved.resolved) {
      const liveZones = detectZones(candles, { higherTimeframeCandles: dailyCandles });
      if (!liveZones.some((z) => z.id === zone.id)) continue;
    }

    // Scored from only what was known as of the entry candle, not the full
    // (future-including) series, so the reversal-pattern check can't peek ahead.
    const confidence = scoreTradeConfidence(plan, zones, candles.slice(0, entryIndex + 1), null);

    records.push({ ...resolved, confidenceScore: confidence.score });
  }

  return records;
}
