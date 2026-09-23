import type { Timeframe } from "./constants";
import { findEntryIndex, planFromZone } from "./tradePlan";
import { evaluateTradeOutcome, type TradeRecord } from "./tradeHistory";
import { scoreTradeConfidence } from "./tradeConfidence";
import type { Candle } from "./types";
import { detectZoneHistory } from "./zones";

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
 * loss takes priority over targets on whichever candle hits first.
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

    // Scored from only what was known as of the entry candle, not the full
    // (future-including) series, so the reversal-pattern check can't peek ahead.
    const confidence = scoreTradeConfidence(plan, zones, candles.slice(0, entryIndex + 1), null);

    records.push({ ...resolved, confidenceScore: confidence.score });
  }

  return records;
}
