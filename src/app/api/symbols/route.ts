import { NextResponse } from "next/server";
import { DEFAULT_SYMBOLS, type SymbolInfo } from "@/lib/constants";
import { getTopSymbolsByVolume } from "@/lib/marketData";

const TOP_SYMBOLS_LIMIT = 40;

export async function GET() {
  try {
    const topByVolume = await getTopSymbolsByVolume(TOP_SYMBOLS_LIMIT);
    const pinnedSymbols = new Set(DEFAULT_SYMBOLS.map((s) => s.symbol));
    const dynamic = topByVolume.filter((s) => !pinnedSymbols.has(s.symbol));

    const symbols: SymbolInfo[] = [...DEFAULT_SYMBOLS, ...dynamic].slice(0, TOP_SYMBOLS_LIMIT);
    return NextResponse.json({ symbols });
  } catch {
    // The dropdown still needs to work if the tickers endpoint is briefly
    // unavailable — fall back to the pinned defaults rather than erroring.
    return NextResponse.json({ symbols: DEFAULT_SYMBOLS });
  }
}
