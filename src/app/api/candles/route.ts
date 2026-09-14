import { NextRequest, NextResponse } from "next/server";
import { SYMBOLS, TIMEFRAMES, type Symbol, type Timeframe } from "@/lib/constants";
import { getCandles } from "@/lib/marketData";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol");
  const timeframe = searchParams.get("timeframe");

  if (!SYMBOLS.some((s) => s.symbol === symbol)) {
    return NextResponse.json(
      { error: `Invalid symbol. Expected one of: ${SYMBOLS.map((s) => s.symbol).join(", ")}` },
      { status: 400 }
    );
  }
  if (!TIMEFRAMES.some((t) => t.value === timeframe)) {
    return NextResponse.json(
      { error: `Invalid timeframe. Expected one of: ${TIMEFRAMES.map((t) => t.value).join(", ")}` },
      { status: 400 }
    );
  }

  try {
    const candles = await getCandles(symbol as Symbol, timeframe as Timeframe);
    return NextResponse.json({ candles });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch candles" },
      { status: 502 }
    );
  }
}
