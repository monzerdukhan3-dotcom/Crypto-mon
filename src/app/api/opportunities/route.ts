import { NextRequest, NextResponse } from "next/server";
import { TIMEFRAMES } from "@/lib/constants";
import { getCandles } from "@/lib/marketData";
import { buildTradePlan, findApproachingDemandZone } from "@/lib/tradePlan";
import { detectZones } from "@/lib/zones";
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
    const zones = detectZones(candles, { higherTimeframeCandles: dailyCandles });
    const tradePlan = buildTradePlan(zones, currentPrice, candles);
    // Tighter than the single-coin dashboard's own 6x-ATR watch band — that
    // one only ever shows a single coin's single nearest zone, but scanning
    // all 60 coins at once with the same generous band buries the handful
    // of setups that are genuinely close under everything that's merely
    // somewhere in the neighborhood.
    const approachingZone = !tradePlan
      ? findApproachingDemandZone(zones, currentPrice, candles, { watchDistanceAtrRatio: 3 })
      : null;

    const result: OpportunityResult = {
      symbol,
      timeframe: tf,
      currentPrice,
      status: tradePlan ? "entry" : approachingZone ? "approaching" : "none",
      zoneTop: tradePlan?.zone.top ?? approachingZone?.top ?? null,
      zoneBottom: tradePlan?.zone.bottom ?? approachingZone?.bottom ?? null,
      entry: tradePlan?.entry ?? approachingZone?.top ?? null,
      stopLoss: tradePlan?.stopLoss ?? null,
      distancePct: approachingZone ? ((currentPrice - approachingZone.top) / currentPrice) * 100 : null,
    };

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to compute opportunity" },
      { status: 502 }
    );
  }
}
