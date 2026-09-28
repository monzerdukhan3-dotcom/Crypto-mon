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

// A bot account (created via @BotFather), used only for the owner's own
// health-check alerts below — the public trade-signals channel bot project
// was cancelled by the owner, so this token has exactly one job now.
function botToken(): string | null {
  return process.env.TELEGRAM_BOT_TOKEN?.trim() || null;
}

// A separate chat from anything public — for the owner alone, so an
// internal "the database is down" or "a check failed" alert never lands
// anywhere a visitor could see it.
function adminChatId(): string | null {
  return process.env.TELEGRAM_ADMIN_CHAT_ID?.trim() || null;
}

export function isTelegramAdminAlertConfigured(): boolean {
  return botToken() !== null && adminChatId() !== null;
}

/** Sends a one-off alert to the owner's own chat — never throws, since a failed alert shouldn't crash the health check that triggered it. */
export async function sendTelegramAdminAlert(text: string): Promise<void> {
  const token = botToken();
  const chatId = adminChatId();
  if (!token || !chatId) return;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
      cache: "no-store",
    });
    const json = (await res.json()) as { ok: boolean; description?: string };
    if (!json.ok) throw new Error(json.description ?? String(res.status));
  } catch {
    // Best-effort — the health-check report itself is still returned/logged either way.
  }
}
