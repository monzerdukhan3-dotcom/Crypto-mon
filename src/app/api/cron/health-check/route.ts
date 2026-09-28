import { NextRequest, NextResponse } from "next/server";
import { runDiagnostics } from "@/lib/diagnostics";
import { sendTelegramAdminAlert } from "@/lib/telegram";

export const maxDuration = 60;

/** A failed check's own detail message, no longer than this many characters, so one huge stack trace can't blow up the alert message. */
const MAX_DETAIL_LENGTH = 300;

function renderAlert(failed: { name: string; detail: string }[]): string {
  const lines = [
    "🚨 <b>فحص صحة الموقع فشل</b>",
    "",
    ...failed.map((c) => `❌ <code>${c.name}</code>: ${c.detail.slice(0, MAX_DETAIL_LENGTH)}`),
  ];
  return lines.join("\n");
}

/**
 * Invoked on a schedule (see vercel.json) to run runDiagnostics and alert
 * the owner's own Telegram chat (never the public signals channel) the
 * moment something is actually broken — database down, Binance
 * unreachable, or a served trade's own numbers disagreeing with what's
 * permanently stored for it (see diagnostics.ts). This is the always-on
 * layer: it catches and pages for a failure the instant it happens,
 * independent of whether anyone is actively watching or running a deeper
 * audit right now. `offset` rotates which pairs the (more expensive)
 * per-pair checks cover, based on the clock, so every pair gets swept over
 * many runs rather than none of them getting checked every single run.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const offset = Math.floor(Date.now() / 1000 / 900); // a new rotation slot every 15 minutes
  const report = await runDiagnostics(offset);

  if (!report.ok) {
    const failed = report.checks.filter((c) => !c.ok);
    await sendTelegramAdminAlert(renderAlert(failed));
  }

  return NextResponse.json(report, { status: report.ok ? 200 : 500 });
}
