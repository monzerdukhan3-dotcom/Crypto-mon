import { SUPPORTED_SYMBOLS, TRADE_SUGGESTION_TIMEFRAMES, type Timeframe } from "./constants";
import { ensureSchema, sql } from "./db";
import { getCandles } from "./marketData";
import { ENGINE_VERSION, HISTORY_START_TIME } from "./signalEngine";
import { isTelegramAdminAlertConfigured } from "./telegram";
import { syncSignals } from "./tradeLedger";

export interface DiagnosticCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export interface DiagnosticsReport {
  ok: boolean;
  generatedAt: string;
  checks: DiagnosticCheck[];
}

/**
 * Every pair, in a fixed order — deterministic so `pairAt` below always
 * returns the same pair for the same offset, letting the health-check cron
 * rotate through the whole matrix (76 coins x 3 suggestion timeframes)
 * over many runs without paying for all of them in one run.
 */
function allPairs(): { symbol: string; timeframe: Timeframe }[] {
  return SUPPORTED_SYMBOLS.flatMap((s) => TRADE_SUGGESTION_TIMEFRAMES.map((tf) => ({ symbol: s.symbol, timeframe: tf })));
}

function pairAt(offset: number): { symbol: string; timeframe: Timeframe } {
  const pairs = allPairs();
  return pairs[((offset % pairs.length) + pairs.length) % pairs.length];
}

interface StoredSampleRow {
  id: string;
  entry: number;
  stop_loss: number;
  targets: number[];
  resolved: boolean;
  resolved_at: string | number | null;
}

/** A fully-resolved-before-launch signal was never shown to anyone live — see HISTORY_START_TIME in signalEngine.ts / tradeLedger.ts. */
function isPublicRow(row: StoredSampleRow): boolean {
  const resolvedAt = row.resolved_at === null ? null : Number(row.resolved_at);
  return !(row.resolved && resolvedAt !== null && resolvedAt < HISTORY_START_TIME);
}

/**
 * The most recent permanently-stored, still-public row for this pair, read
 * directly from `trade_signals` with plain SQL — deliberately bypassing
 * syncSignals' own read path (and its 20s in-memory reuse cache) so this is
 * an independent source of truth to compare that path's *output* against,
 * not just a second call that could return the exact same cached object.
 */
async function getStoredSample(
  symbol: string,
  timeframe: Timeframe
): Promise<{ id: string; entry: number; stopLoss: number; targets: number[] } | null> {
  await ensureSchema();
  const db = sql();
  const rows = (await db`
    select id, entry, stop_loss, targets, resolved, resolved_at
    from trade_signals
    where symbol = ${symbol} and timeframe = ${timeframe} and engine_version = ${ENGINE_VERSION}
    order by logged_at desc
    limit 5
  `) as StoredSampleRow[];
  const row = rows.find(isPublicRow);
  if (!row) return null;
  return { id: row.id, entry: Number(row.entry), stopLoss: Number(row.stop_loss), targets: row.targets };
}

/**
 * A fixed battery of invariant checks over the live system, meant to be run
 * on a schedule (see /api/cron/health-check) and by the standing audit loop
 * a Claude session keeps: catches an operational failure (database or
 * Binance unreachable) as well as the specific class of correctness bug the
 * project has hit before (2026-09-27: a trade's own numbers silently
 * drifting, or a record vanishing, because it was being re-decided from a
 * sliding candle window on every request instead of read from a permanent
 * ledger) — not a full re-audit, just a fast, cheap tripwire for the same
 * failure mode. `rotationOffset` picks which handful of pairs get the
 * per-pair checks this run, so a full sweep of every pair happens over many
 * scheduled runs rather than one expensive one.
 */
export async function runDiagnostics(rotationOffset: number = 0): Promise<DiagnosticsReport> {
  const checks: DiagnosticCheck[] = [];

  try {
    await ensureSchema();
    const db = sql();
    await db`select 1`;
    checks.push({ name: "database", ok: true, detail: "reachable" });
  } catch (error) {
    checks.push({ name: "database", ok: false, detail: error instanceof Error ? error.message : String(error) });
  }

  try {
    const candles = await getCandles("BTC", "1h", 5);
    checks.push({
      name: "binance",
      ok: candles.length > 0,
      detail: candles.length > 0 ? `${candles.length} candles fetched` : "empty response",
    });
  } catch (error) {
    checks.push({ name: "binance", ok: false, detail: error instanceof Error ? error.message : String(error) });
  }

  checks.push({
    name: "telegram_admin_alert_configured",
    ok: true, // informational only — not configuring it isn't a failure
    detail: isTelegramAdminAlertConfigured() ? "configured" : "not configured",
  });

  // Ledger fidelity: a real historical row, read directly from the
  // database, must come back byte-identical (entry/stop/targets) from
  // syncSignals' own served output — the exact invariant that broke before
  // the permanent ledger existed (see this function's own doc comment).
  for (let i = 0; i < 3; i++) {
    const { symbol, timeframe } = pairAt(rotationOffset + i);
    const label = `ledger_fidelity:${symbol}:${timeframe}`;
    try {
      const stored = await getStoredSample(symbol, timeframe);
      if (!stored) {
        checks.push({ name: label, ok: true, detail: "no stored signal yet for this pair" });
        continue;
      }
      const { records } = await syncSignals(symbol, timeframe);
      const served = records.find((r) => r.id === stored.id);
      const matches =
        served !== undefined &&
        served.entry === stored.entry &&
        served.stopLoss === stored.stopLoss &&
        JSON.stringify(served.targets) === JSON.stringify(stored.targets);
      checks.push({
        name: label,
        ok: matches,
        detail: matches
          ? "served record matches its permanent ledger row"
          : served
            ? `served record ${stored.id} disagrees with its own stored entry/stop/targets`
            : `stored signal ${stored.id} no longer appears among what's served for this pair`,
      });
    } catch (error) {
      checks.push({ name: label, ok: false, detail: error instanceof Error ? error.message : String(error) });
    }
  }

  // Cross-page consistency: the exact record /api/trade-plan would pick as
  // the live open trade must also be present, unchanged, among what
  // /api/trade-history / /track-record read for the same pair — they all
  // read syncSignals' own return value, so this mainly guards against a
  // future edit accidentally forking that shared read path again.
  {
    const { symbol, timeframe } = pairAt(rotationOffset + 3);
    const label = `consistency:${symbol}:${timeframe}`;
    try {
      const { records, candles } = await syncSignals(symbol, timeframe);
      const currentPrice = candles.length > 0 ? candles[candles.length - 1].close : null;
      const open = records.filter((r) => !r.resolved);
      const duplicateIds = new Set(records.map((r) => r.id)).size !== records.length;
      if (duplicateIds) {
        checks.push({ name: label, ok: false, detail: "duplicate record ids in the same pair's synced records" });
      } else if (currentPrice !== null && open.length > 0) {
        const nearest = open.reduce((best, r) =>
          Math.abs(r.zone.top - currentPrice) < Math.abs(best.zone.top - currentPrice) ? r : best
        );
        const stillThere = records.find((r) => r.id === nearest.id);
        checks.push({
          name: label,
          ok: stillThere !== undefined && stillThere.entry === nearest.entry,
          detail: stillThere ? "live pick matches the record list" : "live pick missing from its own record list",
        });
      } else {
        checks.push({ name: label, ok: true, detail: "no open trade to cross-check right now" });
      }
    } catch (error) {
      checks.push({ name: label, ok: false, detail: error instanceof Error ? error.message : String(error) });
    }
  }

  return {
    ok: checks.every((c) => c.ok),
    generatedAt: new Date().toISOString(),
    checks,
  };
}
