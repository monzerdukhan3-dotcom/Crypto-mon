import { TIMEFRAME_SECONDS, type Timeframe } from "./constants";
import { scoreTradeConfidence, type TradeConfidence } from "./tradeConfidence";
import { findEntryIndices, planFromZone } from "./tradePlan";
import { detectTrend } from "./trend";
import type { Candle, Zone } from "./types";
import { detectSearchableZones } from "./zones";

/**
 * Bumped whenever a change to the rules below would make the engine decide
 * differently for the same candles. Every stored signal carries the
 * version that produced it, and the ledger only ever reads/writes the
 * current version — so tuning the engine later starts a new, clearly
 * separate record instead of silently rewriting trades already shown.
 */
export const ENGINE_VERSION = 3;

/**
 * Minimum impulse strength (the move that formed the zone, in ATR units —
 * see Zone.impulseMoveAtr) a zone must have to qualify for a signal, and
 * the maximum number of times it may have already been tested (see
 * Zone.testCount). Measured on live data across every supported pair
 * (2026-10-02, 2818 resolved trades): the unfiltered win rate was 54.5%;
 * restricted to impulseMoveAtr >= 5.5 and testCount <= 1 it was 71.1%
 * (n=45, spread across 34 different coins — not one or two outliers) with
 * average realized R more than doubling (0.41R -> 0.87R). A weaker impulse
 * or an already-well-tested zone is a real, measurable edge against the
 * trade, not just noise — this is the owner's explicit choice to trade
 * far less often for a much higher win rate rather than the reverse.
 */
const MIN_IMPULSE_MOVE_ATR = 5.5;
const MAX_ZONE_TEST_COUNT = 1;

/**
 * Exactly how many closed candles every decision is made from: the live
 * chart's own window size. A signal at entry candle E is decided from the
 * 250 closed candles just before E (plus the fact that E touched the zone)
 * and nothing else — no later candle, and
 * no earlier one either — so the same entry candle always produces exactly
 * the same trade no matter when (or how many times) it's computed. Zone
 * detection itself is window-relative (ATR/volume/body averages, the "new
 * extreme" check, merge seeding all depend on where the window starts), so
 * a fixed-size window anchored at the entry candle is what makes it
 * reproducible; the old "detect over whatever 250 candles Binance returns
 * today, then look back for entries" approach re-decided every past trade
 * on every request and measurably changed or dropped them as time moved on.
 */
export const ENGINE_WINDOW = 250;

/**
 * 2026-09-20T11:21:37Z — when the public trade history started. A signal
 * fully resolved before this moment was never shown to anyone live, so it's
 * excluded from the history and the track record (see isPublicSignal).
 */
export const HISTORY_START_TIME = 1789903297;

/** How far back before HISTORY_START_TIME entries are scanned, in candles — enough to include trades still open at launch. */
const PRE_LAUNCH_SCAN_CANDLES = 250;

/** Earliest entry candle time the engine ever scans for this timeframe. */
export function scanStartTime(timeframe: Timeframe): number {
  return HISTORY_START_TIME - PRE_LAUNCH_SCAN_CANDLES * TIMEFRAME_SECONDS[timeframe];
}

/** Seconds after a candle's close before it's trusted as final (exchange settlement slack). */
export const CLOSE_SETTLE_SECONDS = 15;

/** Only fully closed candles — the still-forming one can't decide anything final. */
export function closedCandles(candles: Candle[], timeframe: Timeframe, nowSeconds: number): Candle[] {
  const span = TIMEFRAME_SECONDS[timeframe];
  return candles.filter((c) => c.time + span + CLOSE_SETTLE_SECONDS <= nowSeconds);
}

export interface Signal {
  /** `${symbol}:${timeframe}:${loggedAt}:${zone.id}` — one entry candle, one zone. */
  id: string;
  symbol: string;
  timeframe: Timeframe;
  /** Open time of the entry candle (the candle whose low touched the zone's top). */
  loggedAt: number;
  retestNumber: number;
  entry: number;
  stopLoss: number;
  targets: number[];
  riskRewardRatios: number[];
  confidence: TradeConfidence;
  zone: Zone;
}

/**
 * The higher-timeframe (daily) candles a lower-timeframe decision at
 * `decisionTime` could actually have seen: only daily candles fully closed
 * by then, capped to the same fixed window size.
 */
function dailyWindowAt(dailyCandles: Candle[], decisionTime: number): Candle[] {
  const daySpan = TIMEFRAME_SECONDS["1d"];
  let end = dailyCandles.length;
  while (end > 0 && dailyCandles[end - 1].time + daySpan > decisionTime) end--;
  return dailyCandles.slice(Math.max(0, end - ENGINE_WINDOW), end);
}

/**
 * Every signal whose entry candle is `candles[index]`. The entry is a touch
 * of the zone's top during that candle — exactly a buy limit order resting
 * there — so everything about the trade is decided *before* that candle,
 * from the ENGINE_WINDOW closed candles ending just before it (see
 * ENGINE_WINDOW): the zone, its confirmation, the trend gate, the targets,
 * the confidence. The entry candle itself contributes only the fact that
 * its low reached the zone, which is final the moment it happens — so a
 * trade shown live the instant price touches the zone is the very same
 * trade recorded once that candle closes. Rules:
 * - the zone must be a validated demand zone that zone detection already
 *   finds in the pre-entry window — confirmed by then, not in hindsight;
 * - this candle must be one of the zone's first MAX_ZONE_ENTRIES touches
 *   after a confirmed breakout above it, each after price fully left the
 *   zone, with the zone never closed below in between (findEntryIndices);
 * - a confirmed downtrend on this timeframe rejects it unless the zone
 *   overlaps a same-type daily zone (تداخل المناطق);
 * - the zone's own impulse and test count must clear the quality bar (see
 *   MIN_IMPULSE_MOVE_ATR/MAX_ZONE_TEST_COUNT) — a weak or already-tested
 *   zone is measurably a worse bet, not just a less-preferred one;
 * - planFromZone must produce a plan whose first target clears 1R.
 * Needs a full window before the entry candle — otherwise it isn't
 * decidable reproducibly and yields nothing.
 */
export function signalsAt(
  symbol: string,
  timeframe: Timeframe,
  candles: Candle[],
  index: number,
  dailyCandles: Candle[] | null
): Signal[] {
  if (index < ENGINE_WINDOW || index >= candles.length) return [];
  const window = candles.slice(index - ENGINE_WINDOW, index);
  const entryCandle = candles[index];
  const withEntry = [...window, entryCandle];

  const htfCandles = dailyCandles ? dailyWindowAt(dailyCandles, entryCandle.time) : null;
  const zones = detectSearchableZones(window, {
    higherTimeframeCandles: htfCandles && htfCandles.length > 0 ? htfCandles : null,
  });

  const trend = detectTrend(window);
  const signals: Signal[] = [];

  for (const zone of zones) {
    if (zone.type !== "demand") continue;
    if (entryCandle.low > zone.top) continue;
    const entryIndices = findEntryIndices(withEntry, zone.endTime, zone.top, zone.bottom);
    const position = entryIndices.indexOf(withEntry.length - 1);
    if (position === -1) continue;
    if (trend === "down" && !zone.htfOverlap) continue;
    if (zone.impulseMoveAtr < MIN_IMPULSE_MOVE_ATR || zone.testCount > MAX_ZONE_TEST_COUNT) continue;

    const basePlan = planFromZone(zone, zones);
    if (!basePlan) continue;
    const retestNumber = position + 1;
    const plan = { ...basePlan, retestNumber };
    const confidence = scoreTradeConfidence(plan, zones, window, null);

    signals.push({
      id: `${symbol}:${timeframe}:${entryCandle.time}:${zone.id}`,
      symbol,
      timeframe,
      loggedAt: entryCandle.time,
      retestNumber,
      entry: plan.entry,
      stopLoss: plan.stopLoss,
      targets: plan.targets,
      riskRewardRatios: plan.riskRewardRatios,
      confidence,
      zone,
    });
  }

  // Two overlapping demand zones touched by the same candle are one trade,
  // not two: keep the stronger zone (then the higher one, deterministically).
  signals.sort((a, b) => b.zone.strengthScore - a.zone.strengthScore || b.zone.top - a.zone.top);
  const kept: Signal[] = [];
  for (const s of signals) {
    const overlapsKept = kept.some((k) => k.zone.bottom <= s.zone.top && k.zone.top >= s.zone.bottom);
    if (!overlapsKept) kept.push(s);
  }
  return kept;
}

/**
 * Every signal with an entry candle at or after `fromTime`, over closed
 * candles only. Deterministic: the same candles always produce the same
 * signals, and a signal at a given candle never depends on anything after it.
 */
export function scanSignals(
  symbol: string,
  timeframe: Timeframe,
  closed: Candle[],
  fromTime: number,
  dailyClosed: Candle[] | null
): Signal[] {
  const result: Signal[] = [];
  for (let i = ENGINE_WINDOW; i < closed.length; i++) {
    if (closed[i].time < fromTime) continue;
    result.push(...signalsAt(symbol, timeframe, closed, i, dailyClosed));
  }
  return result;
}
