import type { Timeframe } from "./constants";
import { planFromZone } from "./tradePlan";
import { evaluateTradeOutcome, type TradeRecord } from "./tradeHistory";
import { scoreTradeConfidence } from "./tradeConfidence";
import { detectTrend } from "./trend";
import type { Candle } from "./types";
import { detectZoneHistory, detectZones } from "./zones";

/**
 * Only entries from this moment onward count — 2026-09-20T11:21:37Z, when
 * the trade history switched from a per-browser localStorage log to this
 * server-computed backtest. Zones detected from older candles still count
 * (a zone that formed a while ago and is only being returned to now is a
 * perfectly real, current entry); what's excluded is a *return* the replay
 * finds before this cutoff, which nobody was ever actually shown live.
 */
const HISTORY_START_TIME = 1789903297;

/**
 * Replays this symbol+timeframe's own candle history to reconstruct every
 * trade the site would have proposed, deterministically — no stored state
 * needed, since it's rebuilt fresh from the same public candles everyone
 * sees. For every demand zone that ever validly formed (detectZoneHistory,
 * broken or not), finds the first candle after formation whose close
 * returns to (or inside) the zone's top — the same "price has actually
 * come back" rule buildTradePlan applies live — and treats that as the
 * entry, then resolves it forward exactly like evaluateTradeOutcome does
 * for a live-logged record: stop loss takes priority over targets on
 * whichever candle hits first. Only counted if the zone also would have
 * made detectZones' live cap as of that entry candle — see the comment
 * at the visibility check below.
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

    let entryIndex = -1;
    for (let i = zone.pivotIndex + 1; i < candles.length; i++) {
      if (candles[i].close <= zone.top) {
        entryIndex = i;
        break;
      }
    }
    if (entryIndex === -1) continue; // price never actually came back to this zone
    if (candles[entryIndex].time < HISTORY_START_TIME) continue;

    // detectZoneHistory is deliberately uncapped (a full backtest needs every
    // zone that ever formed), but the live chart only ever shows the
    // strongest few active zones per side (detectZones' maxDemandZones cap).
    // A zone that validly formed but didn't rank into that cap was never
    // something a visitor could actually see or act on at entry time, so
    // reporting a trade on it here would make the history show a setup the
    // chart itself never displayed. Rebuild what the live chart would have
    // shown using only the candles available as of entryIndex (the same
    // point-in-time view a visitor would have had) and only count this as a
    // real trade if the zone made that cut.
    const dailyAtEntry = dailyCandles ? dailyCandles.filter((c) => c.time <= candles[entryIndex].time) : null;
    const visibleAtEntry = detectZones(candles.slice(0, entryIndex + 1), { higherTimeframeCandles: dailyAtEntry });
    if (!visibleAtEntry.some((z) => z.id === zone.id)) continue;

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
    // Scored from only what was known as of the entry candle, not the full
    // (future-including) series, so the reversal-pattern check can't peek ahead.
    const confidence = scoreTradeConfidence(plan, zones, candles.slice(0, entryIndex + 1), null);

    records.push({ ...resolved, confidenceScore: confidence.score });
  }

  return records;
}
