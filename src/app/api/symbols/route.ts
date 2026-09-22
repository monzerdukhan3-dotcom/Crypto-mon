import { NextResponse } from "next/server";
import { SUPPORTED_SYMBOLS } from "@/lib/constants";

export async function GET() {
  return NextResponse.json({ symbols: SUPPORTED_SYMBOLS });
}
