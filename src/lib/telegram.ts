// Billing is manual (no Stripe): a visitor messages this Telegram account,
// the owner confirms payment, then extends their access from /admin. Set
// TELEGRAM_CONTACT_URL to a full link (e.g. https://t.me/your_username) —
// but normalized here regardless, since a bare "@username" or "username"
// is an easy, otherwise-silent mistake to make (renders as a broken
// relative link instead of a real Telegram URL, with nothing about it
// looking wrong until someone actually clicks it). Shared by /pricing and
// /login, the two places that link out to it.
function normalizeTelegramUrl(raw: string): string {
  const trimmed = raw.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://t.me/${trimmed.replace(/^@/, "")}`;
}

export function getTelegramContactUrl(): string {
  return normalizeTelegramUrl(process.env.TELEGRAM_CONTACT_URL || "https://t.me/REPLACE_WITH_YOUR_TELEGRAM_USERNAME");
}

// The signals channel is a separate bot/chat from the manual-billing
// contact link above: a bot account (created via @BotFather) posted as an
// admin of the channel it announces trades in, not the owner's own account.
function signalsBotToken(): string | null {
  return process.env.TELEGRAM_BOT_TOKEN?.trim() || null;
}

// The channel/chat id the bot posts to — e.g. "@my_channel" for a public
// channel with a username, or a numeric id (often "-100...") for a private
// one, exactly as Telegram's sendMessage `chat_id` expects it.
function signalsChatId(): string | null {
  return process.env.TELEGRAM_SIGNALS_CHAT_ID?.trim() || null;
}

export function isTelegramSignalsConfigured(): boolean {
  return signalsBotToken() !== null && signalsChatId() !== null;
}

interface TelegramApiResult {
  message_id: number;
  [key: string]: unknown;
}

async function callTelegramApi(method: string, body: Record<string, unknown>): Promise<TelegramApiResult> {
  const token = signalsBotToken();
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set");

  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const json = (await res.json()) as { ok: boolean; result?: TelegramApiResult; description?: string };
  if (!json.ok || !json.result) {
    throw new Error(`Telegram ${method} failed: ${json.description ?? res.status}`);
  }
  return json.result;
}

/** Posts a new message to the signals channel and returns its message id, for later edits. */
export async function sendTelegramSignalMessage(text: string): Promise<number> {
  const chatId = signalsChatId();
  if (!chatId) throw new Error("TELEGRAM_SIGNALS_CHAT_ID is not set");
  const result = await callTelegramApi("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  });
  return result.message_id;
}

/**
 * Rewrites an already-posted signal message in place (a target or the stop
 * being hit updates the same message rather than posting a new one) — so a
 * channel subscriber always finds one message per trade with its current
 * status, not a growing thread of separate posts for the same setup.
 */
export async function editTelegramSignalMessage(messageId: number, text: string): Promise<void> {
  const chatId = signalsChatId();
  if (!chatId) throw new Error("TELEGRAM_SIGNALS_CHAT_ID is not set");
  try {
    await callTelegramApi("editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    });
  } catch (error) {
    // Telegram's own way of saying the new text is byte-identical to what's
    // already posted — not a real failure, nothing left to do.
    if (error instanceof Error && error.message.includes("message is not modified")) return;
    throw error;
  }
}

// A separate chat from the public signals channel — for the owner alone, so
// an internal "the database is down" or "a check failed" alert never lands
// where subscribers can see it (which would itself be a credibility hit).
// Same bot account (TELEGRAM_BOT_TOKEN) can be a member of both chats.
function adminChatId(): string | null {
  return process.env.TELEGRAM_ADMIN_CHAT_ID?.trim() || null;
}

export function isTelegramAdminAlertConfigured(): boolean {
  return signalsBotToken() !== null && adminChatId() !== null;
}

/** Sends a one-off alert to the owner's own chat — never throws, since a failed alert shouldn't crash the health check that triggered it. */
export async function sendTelegramAdminAlert(text: string): Promise<void> {
  const chatId = adminChatId();
  if (!chatId) return;
  try {
    await callTelegramApi("sendMessage", { chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true });
  } catch {
    // Best-effort — the health-check report itself is still returned/logged either way.
  }
}
