import { SUPPORTED_SYMBOLS, TRADE_SUGGESTION_TIMEFRAMES, type Timeframe } from "./constants";
import { ensureSchema, sql } from "./db";
import { formatPrice } from "./format";
import {
  editTelegramSignalMessage,
  isTelegramSignalsConfigured,
  sendTelegramSignalMessage,
} from "./telegram";
import { syncSignals } from "./tradeLedger";
import type { TradeRecord } from "./tradeHistory";

/**
 * 2026-09-27T20:22:03Z — when channel posting was wired up. Only signals
 * logged from this moment on are ever posted: without this floor, turning
 * the feature on would immediately dump the channel with every open
 * position and every trade already sitting in the permanent ledger, which
 * is history, not a live alert.
 */
const TELEGRAM_LAUNCH_TIME = 1790546523;

/** How many pairs are synced against Binance/the ledger concurrently. */
const SYNC_CONCURRENCY = 8;

/**
 * Telegram enforces roughly one message per second into the same chat;
 * this run's own sends/edits are spaced out to stay well under that rather
 * than racing to fire them all at once.
 */
const SEND_INTERVAL_MS = 1200;

/** Caps how many channel posts/edits happen in one cron run — the rest simply catch up on the next tick. */
const MAX_ACTIONS_PER_RUN = 30;

const TIMEFRAME_LABEL_AR: Record<Timeframe, string> = {
  "15m": "15 دقيقة",
  "1h": "ساعة",
  "4h": "4 ساعات",
  "1d": "يومي",
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** The message text for a signal's current state — identical wording whether this is the first post or an edit of it. */
function renderSignalMessage(record: TradeRecord): string {
  const tfLabel = TIMEFRAME_LABEL_AR[record.timeframe];
  const pairLabel = `${record.symbol} — فريم ${tfLabel}`;

  const header = record.resolved
    ? record.stoppedOut
      ? `🔴 <b>وقف خسارة</b> — ${pairLabel}`
      : `🏆 <b>تحقّقت جميع الأهداف</b> — ${pairLabel}`
    : record.highestTargetHit > 0
      ? `🎯 <b>تحقق الهدف ${record.highestTargetHit}</b> — ${pairLabel} — الصفقة لا تزال مفتوحة`
      : `🟢 <b>دخول جديد</b> — ${pairLabel}`;

  const lines = [
    header,
    "",
    `الدخول: <code>${formatPrice(record.entry)}</code>`,
    `وقف الخسارة: <code>${formatPrice(record.stopLoss)}</code>`,
    ...record.targets.map(
      (t, i) =>
        `${i < record.highestTargetHit ? "✅" : "⬜"} الهدف ${i + 1}: <code>${formatPrice(t)}</code> (R ${record.riskRewardRatios[i]})`
    ),
    "",
    `الثقة: ${record.confidenceScore}/100`,
    record.retestNumber > 1 ? `إعادة اختبار رقم ${record.retestNumber} لهذه المنطقة — ثقة أقل من دخول جديد.` : null,
    `🕐 ${new Date(record.loggedAt * 1000).toLocaleString("ar", { dateStyle: "medium", timeStyle: "short" })}`,
    "",
    "تحليل فني آلي وليس نصيحة استثمارية. الأداء السابق لا يضمن نتائج مستقبلية.",
  ].filter((line): line is string => line !== null);

  return lines.join("\n");
}

interface TelegramState {
  messageId: number | null;
  notifiedHit: number;
  notifiedStopped: boolean;
  notifiedResolved: boolean;
}

interface TelegramStateRow {
  id: string;
  tg_message_id: string | number | null;
  tg_notified_hit: number;
  tg_notified_stopped: boolean;
  tg_notified_resolved: boolean;
}

async function getTelegramStates(ids: string[]): Promise<Map<string, TelegramState>> {
  const map = new Map<string, TelegramState>();
  if (ids.length === 0) return map;
  await ensureSchema();
  const db = sql();
  const rows = (await db`
    select id, tg_message_id, tg_notified_hit, tg_notified_stopped, tg_notified_resolved
    from trade_signals
    where id = any(${ids})
  `) as TelegramStateRow[];
  for (const row of rows) {
    map.set(row.id, {
      messageId: row.tg_message_id === null ? null : Number(row.tg_message_id),
      notifiedHit: row.tg_notified_hit,
      notifiedStopped: row.tg_notified_stopped,
      notifiedResolved: row.tg_notified_resolved,
    });
  }
  return map;
}

async function setTelegramState(
  id: string,
  state: { messageId: number; hit: number; stopped: boolean; resolved: boolean }
): Promise<void> {
  await ensureSchema();
  const db = sql();
  await db`
    update trade_signals
    set tg_message_id = ${state.messageId},
        tg_notified_hit = ${state.hit},
        tg_notified_stopped = ${state.stopped},
        tg_notified_resolved = ${state.resolved}
    where id = ${id}
  `;
}

interface PendingAction {
  record: TradeRecord;
  /** null = never posted (send a new message); set = already posted (edit it in place). */
  messageId: number | null;
}

export interface TelegramNotifyResult {
  configured: boolean;
  scannedPairs: number;
  sent: number;
  edited: number;
  queued: number;
  errors: number;
}

/**
 * Brings the channel's posted messages in line with every pair's ledger
 * (see tradeLedger.ts): a brand-new signal since TELEGRAM_LAUNCH_TIME gets
 * a fresh message the moment it's logged (touch entry, so this fires the
 * instant price reaches the zone — see signalEngine.ts), and any signal
 * whose outcome has since moved (a target reached, the stop hit, or fully
 * resolved) gets that same message rewritten in place rather than a new
 * post, so the channel always shows one message per trade with its live
 * status. Meant to be called on a schedule (see the cron route) — cheap to
 * call repeatedly since nothing happens for a pair with no state change.
 */
export async function runTelegramNotifications(): Promise<TelegramNotifyResult> {
  if (!isTelegramSignalsConfigured()) {
    return { configured: false, scannedPairs: 0, sent: 0, edited: 0, queued: 0, errors: 0 };
  }

  const pairs = SUPPORTED_SYMBOLS.flatMap((s) =>
    TRADE_SUGGESTION_TIMEFRAMES.map((tf) => ({ symbol: s.symbol, timeframe: tf }))
  );

  const pending: PendingAction[] = [];
  let index = 0;
  async function scanWorker() {
    while (index < pairs.length) {
      const { symbol, timeframe } = pairs[index++];
      try {
        const { records } = await syncSignals(symbol, timeframe);
        const recent = records.filter((r) => r.loggedAt >= TELEGRAM_LAUNCH_TIME);
        if (recent.length === 0) continue;

        const states = await getTelegramStates(recent.map((r) => r.id));
        for (const record of recent) {
          const state = states.get(record.id) ?? null;
          const needsInitialPost = !state || state.messageId === null;
          const outcomeChanged =
            state !== null &&
            (state.notifiedHit !== record.highestTargetHit ||
              state.notifiedStopped !== record.stoppedOut ||
              state.notifiedResolved !== record.resolved);
          if (needsInitialPost || outcomeChanged) {
            pending.push({ record, messageId: state?.messageId ?? null });
          }
        }
      } catch {
        // One pair failing to sync shouldn't block the rest of the scan.
      }
    }
  }
  await Promise.all(Array.from({ length: SYNC_CONCURRENCY }, scanWorker));

  // Oldest first, so a backlog catches up in the order trades actually
  // happened rather than an arbitrary scan order.
  pending.sort((a, b) => a.record.loggedAt - b.record.loggedAt);
  const batch = pending.slice(0, MAX_ACTIONS_PER_RUN);

  let sent = 0;
  let edited = 0;
  let errors = 0;
  for (const { record, messageId } of batch) {
    try {
      const text = renderSignalMessage(record);
      const newState = {
        hit: record.highestTargetHit,
        stopped: record.stoppedOut,
        resolved: record.resolved,
      };
      if (messageId === null) {
        const id = await sendTelegramSignalMessage(text);
        await setTelegramState(record.id, { messageId: id, ...newState });
        sent++;
      } else {
        await editTelegramSignalMessage(messageId, text);
        await setTelegramState(record.id, { messageId, ...newState });
        edited++;
      }
    } catch {
      errors++;
    }
    await sleep(SEND_INTERVAL_MS);
  }

  return {
    configured: true,
    scannedPairs: pairs.length,
    sent,
    edited,
    queued: pending.length - batch.length,
    errors,
  };
}
