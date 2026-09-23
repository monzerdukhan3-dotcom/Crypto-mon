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
