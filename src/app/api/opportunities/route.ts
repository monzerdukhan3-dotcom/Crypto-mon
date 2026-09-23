import { NextRequest, NextResponse } from "next/server";
import { TIMEFRAMES } from "@/lib/constants";
import { getCandles } from "@/lib/marketData";
import { buildTradePlan, findApproachingDemandZone, getTradePlanProgress } from "@/lib/tradePlan";
import { detectTrend } from "@/lib/trend";
import { detectSearchableZones } from "@/lib/zones";
import type { Timeframe } from "@/lib/constants";

const SYMBOL_PATTERN = /^[A-Za-z0-9]{1,15}$/;

// Short cache so a coin actually reaching its zone shows up quickly, while
// still sharing one computed result across every visitor watching this page
// at the same time instead of each of them re-fetching from the exchange.
export const revalidate = 60;

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
   * For "approaching" only: whether, as of right now, buildTradePlan's own
   * trend gate would accept a return to this zone — a confirmed downtrend
   * (with no higher-timeframe overlap) rejects it. Only a same-moment
   * snapshot: the trend can still flip before price actually arrives, so
   * this isn't a promise either way — it's here so "تقترب من منطقة دخول"
   * doesn't read as a guarantee a trade opens once price gets there when,
   * on the market's current footing, it wouldn't. Null for "entry"/"none".
   */
  approachingTrendReady: boolean | null;
}

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
    const [candles, dailyCandles] = await Promise.all([
      getCandles(symbol, tf),
      tf === "1d" ? Promise.resolve(null) : getCandles(symbol, "1d").catch(() => null),
    ]);
    if (candles.length === 0) {
      return NextResponse.json({ error: "No candle data" }, { status: 502 });
    }

    const currentPrice = candles[candles.length - 1].close;
    // Uncapped and unfiltered: searching only the chart's own top-N
    // cosmetic cap, or excluding a zone once price sits at it or its box
    // has broken, would let a genuinely open position silently drop out of
    // this scan even though it hasn't hit its stop or any target — exactly
    // the class of bug already fixed for /history, applied here too so an
    // "entry" never disappears from this page while /history still shows
    // it as open (see detectSearchableZones' own doc comment).
    const zones = detectSearchableZones(candles, { higherTimeframeCandles: dailyCandles });
    const tradePlan = buildTradePlan(zones, currentPrice, candles);
    // A plan that already reached one of its targets is still a genuinely
    // open position (see /history and the coin's own chart), but it's no
    // longer a fresh entry — this page lists setups that are still purely
    // at risk, not ones already banking a win, so it drops out here once
    // any target has actually been hit.
    const freshTradePlan = tradePlan && getTradePlanProgress(tradePlan, candles).highestTargetHit === 0 ? tradePlan : null;
    // Tighter than the single-coin dashboard's own 6x-ATR watch band — that
    // one only ever shows a single coin's single nearest zone, but scanning
    // all 76 coins at once with the same generous band buries the handful
    // of setups that are genuinely close under everything that's merely
    // somewhere in the neighborhood.
    const approachingZone = !freshTradePlan
      ? findApproachingDemandZone(zones, currentPrice, candles, { watchDistanceAtrRatio: 3 })
      : null;

    const result: OpportunityResult = {
      symbol,
      timeframe: tf,
      currentPrice,
      status: freshTradePlan ? "entry" : approachingZone ? "approaching" : "none",
      zoneTop: freshTradePlan?.zone.top ?? approachingZone?.top ?? null,
      zoneBottom: freshTradePlan?.zone.bottom ?? approachingZone?.bottom ?? null,
      entry: freshTradePlan?.entry ?? approachingZone?.top ?? null,
      stopLoss: freshTradePlan?.stopLoss ?? null,
      distancePct: approachingZone ? ((currentPrice - approachingZone.top) / currentPrice) * 100 : null,
      approachingTrendReady: approachingZone
        ? detectTrend(candles) !== "down" || approachingZone.htfOverlap
        : null,
    };

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to compute opportunity" },
      { status: 502 }
    );
  }
}
