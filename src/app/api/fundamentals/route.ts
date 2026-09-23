import { NextRequest, NextResponse } from "next/server";
import { getFundamentalData } from "@/lib/fundamentalData";

const SYMBOL_PATTERN = /^[A-Za-z0-9]{1,15}$/;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol");

  if (!symbol || !SYMBOL_PATTERN.test(symbol)) {
    return NextResponse.json({ error: "Invalid symbol" }, { status: 400 });
  }

  try {
    const data = await getFundamentalData(symbol);
    if (!data) {
      return NextResponse.json({ error: "No fundamental data source for this symbol" }, { status: 404 });
    }
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch fundamental data" },
      { status: 502 }
    );
  }
}
