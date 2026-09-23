import { NextResponse } from "next/server";
import { computeTrackRecordStats } from "@/lib/trackRecord";

// See computeTrackRecordStats — real numbers change slowly (only as candles
// close), and computing them means running the full backtest across every
// symbol+timeframe combo, so this is cached rather than recomputed per
// visitor.
export const revalidate = 1800;
export const maxDuration = 60;

export async function GET() {
  const stats = await computeTrackRecordStats();
  return NextResponse.json(stats);
}
