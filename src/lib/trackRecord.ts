import { SUPPORTED_SYMBOLS, TRADE_SUGGESTION_TIMEFRAMES } from "./constants";
import { syncSignals } from "./tradeLedger";

const CONCURRENCY = 10;

export interface TrackRecordStats {
  generatedAt: string;
  totalSignals: number;
  resolvedSignals: number;
  pendingSignals: number;
  wins: number;
  losses: number;
  winRatePct: number;
  /** Average risk-reward multiple actually realized across resolved trades — a win counts the R of the highest target it reached, a pure stop-out counts -1. */
  averageRR: number;
  symbolsCovered: number;
  timeframesCovered: number;
}

/**
 * Totals every public signal in the trade ledger (tradeLedger.ts) across
 * every SUPPORTED_SYMBOLS x TRADE_SUGGESTION_TIMEFRAMES pair — the very
 * same records /history lists one by one, so the two can never disagree.
 * Syncing brings each pair's ledger up to date first. Both callers cache
 * the result (`revalidate`) rather than recomputing it per visitor.
 */
const STATS_TTL_MS = 10 * 60 * 1000;
let cachedStats: { at: number; promise: Promise<TrackRecordStats> } | null = null;

export function computeTrackRecordStats(): Promise<TrackRecordStats> {
  if (cachedStats && Date.now() - cachedStats.at < STATS_TTL_MS) return cachedStats.promise;
  const promise = computeTrackRecordStatsUncached();
  cachedStats = { at: Date.now(), promise };
  promise.catch(() => {
    cachedStats = null;
  });
  return promise;
}

async function computeTrackRecordStatsUncached(): Promise<TrackRecordStats> {
  const pairs = SUPPORTED_SYMBOLS.flatMap((s) =>
    TRADE_SUGGESTION_TIMEFRAMES.map((tf) => ({ symbol: s.symbol, timeframe: tf }))
  );

  let totalSignals = 0;
  let resolvedSignals = 0;
  let wins = 0;
  let rrSum = 0;
  let rrCount = 0;

  let index = 0;
  async function worker() {
    while (index < pairs.length) {
      const { symbol, timeframe } = pairs[index++];
      try {
        const { records } = await syncSignals(symbol, timeframe);
        for (const record of records) {
          totalSignals++;
          if (!record.resolved) continue;
          resolvedSignals++;
          if (record.highestTargetHit > 0) {
            wins++;
            rrSum += record.riskRewardRatios[record.highestTargetHit - 1];
          } else {
            rrSum += -1;
          }
          rrCount++;
        }
      } catch {
        // One symbol/timeframe combo failing to fetch shouldn't block the
        // aggregate — it's just excluded from this run's totals.
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const losses = resolvedSignals - wins;
  const winRatePct = resolvedSignals > 0 ? (wins / resolvedSignals) * 100 : 0;
  const averageRR = rrCount > 0 ? rrSum / rrCount : 0;

  return {
    generatedAt: new Date().toISOString(),
    totalSignals,
    resolvedSignals,
    pendingSignals: totalSignals - resolvedSignals,
    wins,
    losses,
    winRatePct: Number(winRatePct.toFixed(1)),
    averageRR: Number(averageRR.toFixed(2)),
    symbolsCovered: SUPPORTED_SYMBOLS.length,
    timeframesCovered: TRADE_SUGGESTION_TIMEFRAMES.length,
  };
}
