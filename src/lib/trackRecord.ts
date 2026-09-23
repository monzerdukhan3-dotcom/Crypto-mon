import { SUPPORTED_SYMBOLS, TIMEFRAMES } from "./constants";
import { getCandles } from "./marketData";
import { backtestTradeHistory } from "./tradeBacktest";

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
 * Aggregates backtestTradeHistory() across every SUPPORTED_SYMBOLS x
 * TIMEFRAMES combo into a single real performance summary — the same
 * deterministic, server-computed backtest /history uses per symbol, just
 * totaled up. Expensive (up to ~300 backtest runs), so both callers (the
 * public /api/track-record route and the /track-record page itself, which
 * calls this directly rather than round-tripping through its own API) set
 * their own `revalidate` to cache it rather than recomputing per visitor.
 */
export async function computeTrackRecordStats(): Promise<TrackRecordStats> {
  const pairs = SUPPORTED_SYMBOLS.flatMap((s) => TIMEFRAMES.map((t) => ({ symbol: s.symbol, timeframe: t.value })));

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
        const [candles, dailyCandles] = await Promise.all([
          getCandles(symbol, timeframe),
          timeframe === "1d" ? Promise.resolve(null) : getCandles(symbol, "1d").catch(() => null),
        ]);
        const records = backtestTradeHistory(symbol, timeframe, candles, dailyCandles);
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
    timeframesCovered: TIMEFRAMES.length,
  };
}
