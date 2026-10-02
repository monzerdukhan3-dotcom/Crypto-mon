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
 * layer: it catches and pages for a failure within a day of it happening,
 * independent of whether anyone is actively watching or running a deeper
 * audit right now. Runs once daily rather than more often — confirmed
 * live (2026-10-02): Vercel's Hobby plan silently refuses every deploy
 * of a vercel.json whose cron fires more than once a day, which is what
 * had been blocking every deploy since this project first added a cron
 * job (2026-09-27). A faster cadence needs the Pro plan. `offset` rotates
 * which pairs the (more expensive) per-pair checks cover, using the day
 * number rather than finer-grained time so a new set is actually picked
 * each day instead of nearly the same one every run.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const offset = Math.floor(Date.now() / 1000 / 86400); // a new rotation slot every day
  const report = await runDiagnostics(offset);

  if (!report.ok) {
    const failed = report.checks.filter((c) => !c.ok);
    await sendTelegramAdminAlert(renderAlert(failed));
  }

  return NextResponse.json(report, { status: report.ok ? 200 : 500 });
}
