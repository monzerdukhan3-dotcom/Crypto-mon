import { NextRequest, NextResponse } from "next/server";
import { SUPPORTED_SYMBOLS, TIMEFRAMES, TRADE_SUGGESTION_TIMEFRAMES } from "@/lib/constants";
import { getCandles } from "@/lib/marketData";
import { findApproachingDemandZone, findRecentlyBrokenZone } from "@/lib/tradePlan";
import { pickLiveSignal, syncSignals } from "@/lib/tradeLedger";
import { detectTrend } from "@/lib/trend";
import { detectSearchableZones } from "@/lib/zones";
import type { Timeframe } from "@/lib/constants";

const SYMBOL_PATTERN = /^[A-Za-z0-9]{1,15}$/;

// Short cache so a coin actually reaching its zone shows up quickly, while
// still sharing one computed result across every visitor watching this page
// at the same time instead of each of them re-fetching from the exchange.
export const revalidate = 60;
export const maxDuration = 60;

export interface OpportunityResult {
  symbol: string;
  timeframe: Timeframe;
  currentPrice: number;
  status: "entry" | "approaching" | "none";
  zoneTop: number | null;
  zoneBottom: number | null;
  entry: number | null;
  stopLoss: number | null;
  /** For "approaching" only: how far price still has to fall to reach entry, as a %. */
  distancePct: number | null;
  /**
   * For "approaching" only: whether, as of right now, the signal engine's
   * trend gate would accept a return to this zone — a confirmed downtrend
   * (with no higher-timeframe overlap) rejects it. Only a same-moment
   * snapshot: the trend can still flip before price actually arrives, so
   * this isn't a promise either way — it's here so "تقترب من منطقة دخول"
   * doesn't read as a guarantee a trade opens once price gets there when,
   * on the market's current footing, it wouldn't. Null for "entry"/"none".
   */
  approachingTrendReady: boolean | null;
  /**
   * A demand zone near the current price that broke since it formed — see
   * findRecentlyBrokenZone's own doc comment. Surfaced regardless of
   * status (not just "approaching") so a subscriber who placed a pending
   * buy order at a zone this page once pointed to isn't left unaware once
   * that specific zone breaks and this row quietly moves on to suggesting
   * a different one instead.
   */
  recentlyBrokenZone: { top: number; bottom: number } | null;
  /** For "entry" only: which distinct return to this zone this is — see TradePlan.retestNumber. */
  retestNumber: number | null;
  /** For "entry" only: open time of the entry candle — the same trade /history lists. */
  loggedAt: number | null;
  /** For "approaching" only: price is already inside the zone, yet no trade opened (entry conditions weren't met). */
  insideZone: boolean | null;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol")?.toUpperCase();
  const timeframe = searchParams.get("timeframe");

  if (!symbol || !SYMBOL_PATTERN.test(symbol) || !SUPPORTED_SYMBOLS.some((s) => s.symbol === symbol)) {
    return NextResponse.json({ error: "Invalid symbol" }, { status: 400 });
  }
  if (!TIMEFRAMES.some((t) => t.value === timeframe)) {
    return NextResponse.json(
      { error: `Invalid timeframe. Expected one of: ${TIMEFRAMES.map((t) => t.value).join(", ")}` },
      { status: 400 }
    );
  }

  try {
    const tf = timeframe as Timeframe;
    const suggestionsEnabled = TRADE_SUGGESTION_TIMEFRAMES.includes(tf);
    const [candles, dailyCandles, ledger] = await Promise.all([
      getCandles(symbol, tf),
      tf === "1d" ? Promise.resolve(null) : getCandles(symbol, "1d").catch(() => null),
      suggestionsEnabled ? syncSignals(symbol, tf) : Promise.resolve(null),
    ]);
    if (candles.length === 0) {
      return NextResponse.json({ error: "No candle data" }, { status: 502 });
    }

    const currentPrice = candles[candles.length - 1].close;
    // The open trade comes from the ledger — the exact record /history and
    // the coin dashboard show. Listed here only while it hasn't reached any
    // target yet: once one is hit it's a running winner, not a setup still
    // at its entry.
    const liveSignal = ledger ? pickLiveSignal(ledger.records, currentPrice) : null;
    const openSignal = liveSignal && liveSignal.highestTargetHit === 0 ? liveSignal : null;

    // Everything below is a read of the market right now (not a trade), so
    // it's computed from the current chart window like the dashboard does.
    const zones = detectSearchableZones(candles, { higherTimeframeCandles: dailyCandles });
    const approachingZone =
      !openSignal && suggestionsEnabled
        ? findApproachingDemandZone(zones, currentPrice, candles, liveSignal?.zone.id ?? null)
        : null;
    const rawBrokenZone = findRecentlyBrokenZone(zones, currentPrice, candles);
    const brokenZone = rawBrokenZone && rawBrokenZone.id === liveSignal?.zone.id ? null : rawBrokenZone;
    const recentlyBrokenDemandZone = brokenZone?.type === "demand" ? brokenZone : null;

    const result: OpportunityResult = {
      symbol,
      timeframe: tf,
      currentPrice,
      status: openSignal ? "entry" : approachingZone ? "approaching" : "none",
      zoneTop: openSignal?.zone.top ?? approachingZone?.top ?? null,
      zoneBottom: openSignal?.zone.bottom ?? approachingZone?.bottom ?? null,
      entry: openSignal?.entry ?? approachingZone?.top ?? null,
      stopLoss: openSignal?.stopLoss ?? null,
      distancePct: approachingZone ? Math.max(0, ((currentPrice - approachingZone.top) / currentPrice) * 100) : null,
      approachingTrendReady: approachingZone ? detectTrend(candles) !== "down" || approachingZone.htfOverlap : null,
      recentlyBrokenZone: recentlyBrokenDemandZone
        ? { top: recentlyBrokenDemandZone.top, bottom: recentlyBrokenDemandZone.bottom }
        : null,
      retestNumber: openSignal?.retestNumber ?? null,
      loggedAt: openSignal?.loggedAt ?? null,
      insideZone: approachingZone ? currentPrice <= approachingZone.top : null,
    };

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to compute opportunity" },
      { status: 502 }
    );
  }
}
