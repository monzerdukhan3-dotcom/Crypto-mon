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
    schemaReady = ensureUsersTable()
      .then(ensureBootstrapAdmin)
      .catch((error) => {
        schemaReady = null;
        throw error;
      });
  }
  return schemaReady;
}
