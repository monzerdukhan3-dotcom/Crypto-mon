import { NextRequest, NextResponse } from "next/server";
import { TIMEFRAMES, TRADE_SUGGESTION_TIMEFRAMES } from "@/lib/constants";
import { getCandles } from "@/lib/marketData";
import { backtestTradeHistory } from "@/lib/tradeBacktest";
import type { Timeframe } from "@/lib/constants";

const SYMBOL_PATTERN = /^[A-Za-z0-9]{1,15}$/;

// Backtest results only change as new candles close, so every visitor
// shares the same cached response for a given symbol+timeframe instead of
// recomputing (or re-fetching from the exchange) on every request — this is
// also what makes the trade history identical across browsers/devices,
// unlike the old localStorage-based log.
export const revalidate = 120;

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
    // 15m's old signals were removed from the public record (see
    // TRADE_SUGGESTION_TIMEFRAMES' own doc comment and computeTrackRecordStats')
    // — enforced here too, not just by TradeHistoryView never requesting
    // it, so a direct request for this timeframe can't bypass that.
    if (!TRADE_SUGGESTION_TIMEFRAMES.includes(tf)) {
      return NextResponse.json({ records: [] });
    }
    const [candles, dailyCandles] = await Promise.all([
      getCandles(symbol, tf),
      // Same higher-timeframe confluence check the live dashboard applies —
      // skipped when already on the daily chart, and not fatal if it fails.
      tf === "1d" ? Promise.resolve(null) : getCandles(symbol, "1d").catch(() => null),
    ]);
    const records = backtestTradeHistory(symbol, tf, candles, dailyCandles);
    return NextResponse.json({ records });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to compute trade history" },
      { status: 502 }
    );
  }
}
