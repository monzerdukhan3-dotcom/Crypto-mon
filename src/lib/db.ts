import { neon } from "@neondatabase/serverless";

/**
 * The Neon marketplace integration on Vercel sets DATABASE_URL (and a few
 * prefixed variants); POSTGRES_URL is the older Vercel Postgres name, kept
 * as a fallback in case the project ever migrates back to it.
 */
function connectionString(): string {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return url;
}

export function sql() {
  return neon(connectionString());
}

/**
 * Idempotent — safe to call on every cold start, not just once at setup.
 * is_admin distinguishes the owner/admin tier (full access, including
 * /admin) from regular visitor accounts (the main pages only). access_until
 * gates a regular account's access to the app itself: null means unlimited
 * (an admin-created or manually-comped account), a timestamp in the past
 * means access has lapsed (trial or subscription) — see proxy.ts. Billing
 * is manual (Telegram) rather than automated, so this column is the one
 * source of truth an admin edits directly from /admin after confirming a
 * payment, rather than something a payment webhook writes.
 */
export async function ensureUsersTable(): Promise<void> {
  const db = sql();
  await db`
    create table if not exists users (
      id serial primary key,
      email text unique not null,
      password_hash text not null,
      is_admin boolean not null default false,
      access_until timestamptz,
      created_at timestamptz not null default now()
    )
  `;
  await db`alter table users add column if not exists access_until timestamptz`;
}
