import { TIMEFRAME_SECONDS, type Timeframe } from "./constants";
import { ensureSchema, sql } from "./db";
import { getCandlesSince } from "./marketData";
import {
  CLOSE_SETTLE_SECONDS,
  closedCandles,
  ENGINE_VERSION,
  ENGINE_WINDOW,
  HISTORY_START_TIME,
  scanSignals,
  scanStartTime,
  type Signal,
} from "./signalEngine";
import type { TradeConfidence } from "./tradeConfidence";
import { evaluateTradeOutcome, type TradeRecord } from "./tradeHistory";
import type { Candle, Zone } from "./types";

interface SignalRow {
  id: string;
  logged_at: string | number;
  retest_number: number;
  entry: number;
  stop_loss: number;
  targets: number[];
  risk_reward_ratios: number[];
  confidence: TradeConfidence;
  zone: Zone;
  highest_target_hit: number;
  stopped_out: boolean;
  resolved: boolean;
  resolved_at: string | number | null;
}

function rowToRecord(row: SignalRow, symbol: string, timeframe: Timeframe): TradeRecord {
  return {
    id: row.id,
    symbol,
    timeframe,
    loggedAt: Number(row.logged_at),
    entry: Number(row.entry),
    stopLoss: Number(row.stop_loss),
    targets: row.targets,
    riskRewardRatios: row.risk_reward_ratios,
    zone: row.zone,
    retestNumber: row.retest_number,
    confidenceScore: row.confidence.score,
    confidence: row.confidence,
    highestTargetHit: row.highest_target_hit,
    stoppedOut: row.stopped_out,
    resolved: row.resolved,
    resolvedAt: row.resolved_at === null ? null : Number(row.resolved_at),
  };
}

function signalToRecord(signal: Signal): TradeRecord {
  return {
    id: signal.id,
    symbol: signal.symbol,
    timeframe: signal.timeframe,
    loggedAt: signal.loggedAt,
    entry: signal.entry,
    stopLoss: signal.stopLoss,
    targets: signal.targets,
    riskRewardRatios: signal.riskRewardRatios,
    zone: signal.zone,
    retestNumber: signal.retestNumber,
    confidenceScore: signal.confidence.score,
    confidence: signal.confidence,
    highestTargetHit: 0,
    stoppedOut: false,
    resolved: false,
    resolvedAt: null,
  };
}

/** A fully-resolved-before-launch signal was never shown to anyone live — see HISTORY_START_TIME. */
function isPublic(record: TradeRecord): boolean {
  return !(record.resolved && record.resolvedAt !== null && record.resolvedAt < HISTORY_START_TIME);
}

export interface PairSignals {
  /** Every public signal for the pair, oldest first, with its outcome as of right now. */
  records: TradeRecord[];
  /** The candles the outcomes were evaluated against (last one may still be forming); empty when no fetch was needed. */
  candles: Candle[];
}

async function loadLedger(symbol: string, timeframe: Timeframe) {
  await ensureSchema();
  const db = sql();
  const [rows, scans] = (await Promise.all([
    db`
      select id, logged_at, retest_number, entry, stop_loss, targets, risk_reward_ratios, confidence, zone,
             highest_target_hit, stopped_out, resolved, resolved_at
      from trade_signals
      where symbol = ${symbol} and timeframe = ${timeframe} and engine_version = ${ENGINE_VERSION}
    `,
    db`
      select scanned_through from signal_scans
      where symbol = ${symbol} and timeframe = ${timeframe} and engine_version = ${ENGINE_VERSION}
    `,
  ])) as [SignalRow[], { scanned_through: string | number }[]];
  return {
    db,
    stored: rows.map((r) => rowToRecord(r, symbol, timeframe)),
    scannedThrough: scans.length > 0 ? Number(scans[0].scanned_through) : null,
  };
}

async function syncSignalsUncached(symbol: string, timeframe: Timeframe): Promise<PairSignals> {
  const now = Math.floor(Date.now() / 1000);
  const span = TIMEFRAME_SECONDS[timeframe];

  // The ledger is what keeps a signal fixed forever once decided, but the
  // engine itself is deterministic, so if the database is unreachable the
  // same signals are simply recomputed (and not persisted) for this request.
  let ledger: Awaited<ReturnType<typeof loadLedger>> | null = null;
  try {
    ledger = await loadLedger(symbol, timeframe);
  } catch {
    ledger = null;
  }

  const stored = ledger?.stored ?? [];
  const scanFrom = ledger?.scannedThrough != null ? ledger.scannedThrough + span : scanStartTime(timeframe);
  const oldestOpen = stored.filter((r) => !r.resolved).reduce((min, r) => Math.min(min, r.loggedAt), Infinity);
  // Binance candles are aligned to the epoch, so this is the open time of
  // the most recent candle that has fully closed.
  const lastClosedOpenTime = Math.floor((now - CLOSE_SETTLE_SECONDS) / span) * span - span;
  const needsScan = scanFrom <= lastClosedOpenTime;

  // Nothing new has closed and nothing is open: the stored ledger is
  // already the complete, final answer — no exchange request needed.
  if (!needsScan && oldestOpen === Infinity) {
    return { records: stored.filter(isPublic).sort((a, b) => a.loggedAt - b.loggedAt), candles: [] };
  }

  // A few spare candles beyond the window so an exchange gap never leaves
  // an entry candle short of a full ENGINE_WINDOW.
  const dataStart = needsScan ? Math.min(scanFrom - (ENGINE_WINDOW + 10) * span, oldestOpen) : oldestOpen;

  const [candles, dailyCandles] = await Promise.all([
    getCandlesSince(symbol, timeframe, dataStart),
    timeframe === "1d" || !needsScan
      ? Promise.resolve(null)
      : getCandlesSince(symbol, "1d", scanFrom - (ENGINE_WINDOW + 10) * TIMEFRAME_SECONDS["1d"]),
  ]);
  const closed = closedCandles(candles, timeframe, now);
  const formingCandleTime = candles.length > closed.length ? candles[closed.length].time : Number.POSITIVE_INFINITY;
  const dailyClosed = dailyCandles ? closedCandles(dailyCandles, "1d", now) : null;

  const storedIds = new Set(stored.map((r) => r.id));
  const fresh = (needsScan ? scanSignals(symbol, timeframe, closed, scanFrom, dailyClosed) : [])
    .filter((s) => !storedIds.has(s.id))
    .map(signalToRecord);

  // Outcome as of the last *closed* candle is what gets persisted — final,
  // never revised. The live view layered on top may additionally count a
  // target the forming candle has already reached (see evaluateTradeOutcome).
  const settledStored = stored.map((r) => evaluateTradeOutcome(r, closed));
  const settledFresh = fresh.map((r) => evaluateTradeOutcome(r, closed));

  if (ledger) {
    const { db } = ledger;
    try {
      for (const r of settledFresh) {
        await db`
          insert into trade_signals
            (id, engine_version, symbol, timeframe, logged_at, retest_number, entry, stop_loss, targets,
             risk_reward_ratios, confidence, zone, highest_target_hit, stopped_out, resolved, resolved_at)
          values (
            ${r.id}, ${ENGINE_VERSION}, ${symbol}, ${timeframe}, ${r.loggedAt}, ${r.retestNumber}, ${r.entry},
            ${r.stopLoss}, ${JSON.stringify(r.targets)}::jsonb, ${JSON.stringify(r.riskRewardRatios)}::jsonb,
            ${JSON.stringify(r.confidence)}::jsonb, ${JSON.stringify(r.zone)}::jsonb, ${r.highestTargetHit},
            ${r.stoppedOut}, ${r.resolved}, ${r.resolvedAt}
          )
          on conflict (id) do nothing
        `;
      }
      for (let i = 0; i < stored.length; i++) {
        const before = stored[i];
        const after = settledStored[i];
        if (after.resolved === before.resolved && after.highestTargetHit === before.highestTargetHit) continue;
        await db`
          update trade_signals
          set highest_target_hit = greatest(highest_target_hit, ${after.highestTargetHit}),
              stopped_out = ${after.stoppedOut},
              resolved = ${after.resolved},
              resolved_at = ${after.resolvedAt}
          where id = ${after.id} and resolved = false
        `;
      }
      if (needsScan && closed.length > 0) {
        const through = closed[closed.length - 1].time;
        await db`
          insert into signal_scans (symbol, timeframe, engine_version, scanned_through)
          values (${symbol}, ${timeframe}, ${ENGINE_VERSION}, ${through})
          on conflict (symbol, timeframe, engine_version)
          do update set scanned_through = greatest(signal_scans.scanned_through, excluded.scanned_through),
                        updated_at = now()
        `;
      }
    } catch {
      // A failed write only means this request's new signals get written
      // by the next one instead — they're recomputed identically.
    }
  }

  const records = [...settledStored, ...settledFresh]
    .map((r) => evaluateTradeOutcome(r, candles, formingCandleTime))
    .filter(isPublic)
    .sort((a, b) => a.loggedAt - b.loggedAt);

  return { records, candles };
}

const inflight = new Map<string, Promise<PairSignals>>();

/**
 * Brings the pair's ledger up to date (scans every newly closed candle
 * exactly once, resolves open signals against closed candles) and returns
 * every public signal with its current outcome. Every page — the coin
 * dashboard, opportunities, history, and the track record — reads trades
 * from here and nowhere else, so they can't disagree with each other.
 */
export function syncSignals(symbol: string, timeframe: Timeframe): Promise<PairSignals> {
  const key = `${symbol}:${timeframe}`;
  const existing = inflight.get(key);
  if (existing) return existing;
  const promise = syncSignalsUncached(symbol, timeframe).finally(() => inflight.delete(key));
  inflight.set(key, promise);
  return promise;
}

/**
 * The open signal to feature on the pair's dashboard: among every signal
 * not yet resolved, the one whose zone sits closest to the current price.
 */
export function pickLiveSignal(records: TradeRecord[], currentPrice: number): TradeRecord | null {
  const open = records.filter((r) => !r.resolved);
  if (open.length === 0) return null;
  return open.reduce((best, r) =>
    Math.abs(r.zone.top - currentPrice) < Math.abs(best.zone.top - currentPrice) ||
    (Math.abs(r.zone.top - currentPrice) === Math.abs(best.zone.top - currentPrice) && r.loggedAt > best.loggedAt)
      ? r
      : best
  );
}
