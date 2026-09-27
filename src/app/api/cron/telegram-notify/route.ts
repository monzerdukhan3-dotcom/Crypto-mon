import { NextRequest, NextResponse } from "next/server";
import { runTelegramNotifications } from "@/lib/telegramNotify";

// Scans every SUPPORTED_SYMBOLS x TRADE_SUGGESTION_TIMEFRAMES pair, same
// cost class as /api/track-record.
export const maxDuration = 300;

/**
 * Invoked on a schedule (see vercel.json's `crons`) to post/update the
 * Telegram signals channel — see runTelegramNotifications' own doc comment.
 * Requires CRON_SECRET to be set: Vercel's own Cron Jobs automatically send
 * `Authorization: Bearer $CRON_SECRET` on every scheduled invocation, so
 * this checks that exact header rather than trusting the request outright
 * — otherwise anyone who found this URL could trigger a full scan (and,
 * once Telegram is configured, real channel posts) on demand.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runTelegramNotifications();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to run Telegram notifications" },
      { status: 502 }
    );
  }
}
