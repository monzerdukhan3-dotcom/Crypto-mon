import { NextRequest, NextResponse } from "next/server";
import { TIMEFRAMES, TRADE_SUGGESTION_TIMEFRAMES } from "@/lib/constants";
import { getCandles } from "@/lib/marketData";
import { buildTradePlan } from "@/lib/tradePlan";
import { freezeLiveTradePlan } from "@/lib/tradeLedger";
import { detectSearchableZones } from "@/lib/zones";
import type { Timeframe } from "@/lib/constants";

const SYMBOL_PATTERN = /^[A-Za-z0-9]{1,15}$/;

// Matches /api/candles' own underlying cache window — this route re-fetches
// the same candles server-side (needed to freeze against the ledger; see
// freezeLiveTradePlan's own doc comment on why the single-coin dashboard
// can't just keep computing this client-side), so there's no reason to
// recompute more often than the candles themselves actually change.
export const revalidate = 30;

/**
 * The live dashboard's own trade-plan lookup — kept as a server route
 * (rather than the plain buildTradePlan() call AnalysisDashboard used to
 * make directly, client-side) specifically so it can freeze the setup's
 * own definition via tradeLedger.ts, the same way /api/opportunities and
 * /api/trade-history already do. Without this, the live dashboard's own
 * number for a brand-new setup could permanently disagree with what
 * /history later logs for the identical trade — confirmed directly
 * against live data (SAND/1h): two independent requests each re-derive
 * "the zone map as of entry" from whichever candle window Binance happens
 * to hand back at that exact moment, which isn't guaranteed to match.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol");
  const timeframe = searchParams.get("timeframe");

  if (!symbol || !SYMBOL_PATTERN.test(symbol)) {
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
    if (!TRADE_SUGGESTION_TIMEFRAMES.includes(tf)) {
      return NextResponse.json({ tradePlan: null, confidenceScore: null });
    }

    const [candles, dailyCandles] = await Promise.all([
      getCandles(symbol, tf),
      tf === "1d" ? Promise.resolve(null) : getCandles(symbol, "1d").catch(() => null),
    ]);
    if (candles.length === 0) {
      return NextResponse.json({ error: "No candle data" }, { status: 502 });
    }

    const currentPrice = candles[candles.length - 1].close;
    const zones = detectSearchableZones(candles, { higherTimeframeCandles: dailyCandles });
    const rawTradePlan = buildTradePlan(zones, currentPrice, candles);
    if (!rawTradePlan) {
      return NextResponse.json({ tradePlan: null, confidenceScore: null });
    }

    const { tradePlan, confidenceScore } = await freezeLiveTradePlan(rawTradePlan, candles, symbol, tf);
    return NextResponse.json({ tradePlan, confidenceScore });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to compute trade plan" },
      { status: 502 }
    );
  }
}
