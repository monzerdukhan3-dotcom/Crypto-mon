import type { Timeframe } from "./constants";
import type { Candle, TradePlan } from "./types";

export interface TradeRecord {
  id: string;
  symbol: string;
  timeframe: Timeframe;
  loggedAt: number; // unix seconds
  entry: number;
  stopLoss: number;
  targets: number[];
  riskRewardRatios: number[];
  confidenceScore: number;
  /** Highest target index reached so far (0 = none). */
  highestTargetHit: number;
  stoppedOut: boolean;
  /** True once no further change is expected: all targets hit, or stopped out. */
  resolved: boolean;
  resolvedAt: number | null;
}

const STORAGE_KEY = "crypto-mon:trade-history";
const MAX_RECORDS = 200;

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

/** Reads the locally-stored trade log. Browser-only — call from client components. */
export function loadTradeHistory(): TradeRecord[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveTradeHistory(records: TradeRecord[]): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records.slice(-MAX_RECORDS)));
  } catch {
    // Storage full or unavailable (private browsing) — history just won't persist this time.
  }
}

/**
 * Records a trade plan the first time it's seen for this exact
 * symbol+timeframe+zone combination — re-renders of the same underlying
 * setup are deduplicated by id, so this is safe to call on every render.
 */
export function logTradePlanIfNew(
  symbol: string,
  timeframe: Timeframe,
  tradePlan: TradePlan,
  confidenceScore: number
): void {
  if (!isBrowser()) return;

  const id = `${symbol}:${timeframe}:${tradePlan.zone.id}`;
  const history = loadTradeHistory();
  if (history.some((r) => r.id === id)) return;

  const record: TradeRecord = {
    id,
    symbol,
    timeframe,
    loggedAt: Math.floor(Date.now() / 1000),
    entry: tradePlan.entry,
    stopLoss: tradePlan.stopLoss,
    targets: tradePlan.targets,
    riskRewardRatios: tradePlan.riskRewardRatios,
    confidenceScore,
    highestTargetHit: 0,
    stoppedOut: false,
    resolved: false,
    resolvedAt: null,
  };

  saveTradeHistory([...history, record]);
}

/**
 * Re-evaluates a pending record against freshly fetched candles for its own
 * symbol+timeframe: walking forward from when it was logged, a candle whose
 * low reaches the stop loss resolves it as stopped out (checked before that
 * candle's targets — the conservative "worst case first" convention so a
 * single wide candle can't overstate the win rate); otherwise each target
 * reached in turn raises the highest-target-hit count. Only candles within
 * the currently fetched window are visible, so a record older than that
 * window simply keeps its last known state until re-checked with a wider
 * window.
 */
export function evaluateTradeOutcome(record: TradeRecord, candles: Candle[]): TradeRecord {
  if (record.resolved) return record;

  let highestTargetHit = record.highestTargetHit;
  let stoppedOut = false;
  let resolvedAt: number | null = null;

  for (const c of candles) {
    if (c.time <= record.loggedAt) continue;

    if (c.low <= record.stopLoss) {
      stoppedOut = true;
      resolvedAt = c.time;
      break;
    }

    while (highestTargetHit < record.targets.length && c.high >= record.targets[highestTargetHit]) {
      highestTargetHit++;
    }
    if (highestTargetHit === record.targets.length) {
      resolvedAt = c.time;
      break;
    }
  }

  const resolved = stoppedOut || highestTargetHit === record.targets.length;
  return { ...record, highestTargetHit, stoppedOut, resolved, resolvedAt };
}
