import bcrypt from "bcryptjs";
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

/**
 * The permanent trade ledger (see tradeLedger.ts). One row per signal the
 * causal engine (signalEngine.ts) produced: its definition is written once
 * and never updated; only the outcome columns move, forward only, as closed
 * candles resolve it. `engine_version` keeps rows from a future rule change
 * separate instead of mixing them. `signal_scans` records how far each
 * pair has been scanned so every entry candle is decided exactly once.
 * (The older `trade_plans` table from the previous design is left
 * untouched and no longer read.)
 */
export async function ensureTradeSignalsTables(): Promise<void> {
  const db = sql();
  await db`
    create table if not exists trade_signals (
      id text primary key,
      engine_version integer not null,
      symbol text not null,
      timeframe text not null,
      logged_at bigint not null,
      retest_number integer not null,
      entry double precision not null,
      stop_loss double precision not null,
      targets jsonb not null,
      risk_reward_ratios jsonb not null,
      confidence jsonb not null,
      zone jsonb not null,
      highest_target_hit integer not null default 0,
      stopped_out boolean not null default false,
      resolved boolean not null default false,
      resolved_at bigint,
      created_at timestamptz not null default now()
    )
  `;
  await db`create index if not exists trade_signals_pair_idx on trade_signals (symbol, timeframe, engine_version)`;
  // The public trade-signals Telegram bot project was cancelled; the
  // columns it used to track posted/edited channel messages are dropped
  // here rather than left dangling on a live table.
  await db`alter table trade_signals drop column if exists tg_message_id`;
  await db`alter table trade_signals drop column if exists tg_notified_hit`;
  await db`alter table trade_signals drop column if exists tg_notified_stopped`;
  await db`alter table trade_signals drop column if exists tg_notified_resolved`;
  await db`
    create table if not exists signal_scans (
      symbol text not null,
      timeframe text not null,
      engine_version integer not null,
      scanned_through bigint not null,
      updated_at timestamptz not null default now(),
      primary key (symbol, timeframe, engine_version)
    )
  `;
}

/**
 * If ADMIN_EMAIL and ADMIN_PASSWORD are set, makes sure that account exists
 * as an admin — the way the very first owner account gets created on a
 * fresh database, since /signup only ever creates trial accounts and /admin
 * needs an admin to reach it. Never touches an existing account's password.
 */
async function ensureBootstrapAdmin(): Promise<void> {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) return;

  const db = sql();
  const passwordHash = await bcrypt.hash(password, 12);
  await db`
    insert into users (email, password_hash, is_admin, access_until)
    values (${email}, ${passwordHash}, true, null)
    on conflict (email) do update set is_admin = true, access_until = null
  `;
}

let schemaReady: Promise<void> | null = null;

/**
 * Runs the schema setup (and admin bootstrap) once per server instance, the
 * first time anything touches the users table — so a fresh Neon database
 * works with no manual migration step. A failed attempt is forgotten so the
 * next request retries instead of caching the error.
 */
export function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = Promise.all([ensureUsersTable(), ensureTradeSignalsTables()])
      .then(ensureBootstrapAdmin)
      .catch((error) => {
        schemaReady = null;
        throw error;
      });
  }
  return schemaReady;
}
