import { NextRequest, NextResponse } from "next/server";
import { TIMEFRAMES } from "@/lib/constants";
import { getCandles } from "@/lib/marketData";
import type { Timeframe } from "@/lib/constants";

// Ticker symbols are fetched dynamically (see /api/symbols), so validate the
// shape here rather than against a fixed list.
const SYMBOL_PATTERN = /^[A-Za-z0-9]{1,15}$/;

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
    const candles = await getCandles(symbol, timeframe as Timeframe);
    return NextResponse.json({ candles });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch candles" },
      { status: 502 }
    );
  }
}
