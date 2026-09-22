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

/** Idempotent — safe to call on every cold start, not just once at setup. */
export async function ensureUsersTable(): Promise<void> {
  const db = sql();
  await db`
    create table if not exists users (
      id serial primary key,
      email text unique not null,
      password_hash text not null,
      created_at timestamptz not null default now()
    )
  `;
}
