import { NextRequest, NextResponse } from "next/server";
import { TIMEFRAME_SECONDS, TIMEFRAMES } from "@/lib/constants";
import { getCandles, getCandlesSince } from "@/lib/marketData";
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

  // Optional `from` (unix seconds): every candle since then instead of the
  // latest 250 — so a trade in /history can always be drawn from its own
  // zone onward, however long ago it happened. Capped to 1500 candles back.
  const fromParam = searchParams.get("from");
  const from = fromParam !== null ? Number(fromParam) : null;
  if (from !== null && !Number.isFinite(from)) {
    return NextResponse.json({ error: "Invalid from" }, { status: 400 });
  }

  try {
    const tf = timeframe as Timeframe;
    const earliest = Math.floor(Date.now() / 1000) - 1500 * TIMEFRAME_SECONDS[tf];
    const candles = from !== null ? await getCandlesSince(symbol, tf, Math.max(from, earliest)) : await getCandles(symbol, tf);
    return NextResponse.json({ candles });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch candles" },
      { status: 502 }
    );
  }
}
