import { NextRequest, NextResponse } from "next/server";
import { SUPPORTED_SYMBOLS, TIMEFRAMES, TRADE_SUGGESTION_TIMEFRAMES } from "@/lib/constants";
import { getCandles } from "@/lib/marketData";
import { pickLiveSignal, syncSignals } from "@/lib/tradeLedger";
import type { Timeframe } from "@/lib/constants";

const SYMBOL_PATTERN = /^[A-Za-z0-9]{1,15}$/;

export const revalidate = 30;
export const maxDuration = 60;

/**
 * The coin dashboard's open trade: read from the same ledger /history,
 * /opportunities and the track record read (see tradeLedger.ts), so the
 * trade shown here is byte-for-byte the record those pages show.
 */
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
    if (!TRADE_SUGGESTION_TIMEFRAMES.includes(tf)) {
      return NextResponse.json({ signal: null });
    }
    // The chart's own (cached) candles only supply the current price used to
    // pick which open trade to feature — never any trade decision.
    const [{ records }, chartCandles] = await Promise.all([syncSignals(symbol, tf), getCandles(symbol, tf)]);
    if (chartCandles.length === 0) {
      return NextResponse.json({ error: "No candle data" }, { status: 502 });
    }
    const signal = pickLiveSignal(records, chartCandles[chartCandles.length - 1].close);
    return NextResponse.json({ signal });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to compute trade plan" },
      { status: 502 }
    );
  }
}
