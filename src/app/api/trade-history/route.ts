import { NextRequest, NextResponse } from "next/server";
import { SUPPORTED_SYMBOLS, TIMEFRAMES, TRADE_SUGGESTION_TIMEFRAMES } from "@/lib/constants";
import { syncSignals } from "@/lib/tradeLedger";
import type { Timeframe } from "@/lib/constants";

const SYMBOL_PATTERN = /^[A-Za-z0-9]{1,15}$/;

// Every visitor shares one cached response per symbol+timeframe; the
// records themselves come from the permanent ledger (tradeLedger.ts).
export const revalidate = 120;
export const maxDuration = 60;

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
    // No trades are ever suggested on 15m, so it has no record to show.
    if (!TRADE_SUGGESTION_TIMEFRAMES.includes(tf)) {
      return NextResponse.json({ records: [] });
    }
    const { records } = await syncSignals(symbol, tf);
    return NextResponse.json({ records });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to compute trade history" },
      { status: 502 }
    );
  }
}
