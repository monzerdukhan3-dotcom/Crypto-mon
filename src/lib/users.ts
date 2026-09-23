import bcrypt from "bcryptjs";
import { ensureSchema, sql } from "./db";

/** The users table, created (and the ADMIN_EMAIL account seeded) on first use. */
async function usersDb() {
  await ensureSchema();
  return sql();
}

export interface AppUser {
  id: number;
  email: string;
  passwordHash: string;
  isAdmin: boolean;
  /** ISO timestamp, or null for unlimited access. See db.ts. */
  accessUntil: string | null;
}

export interface AppUserSummary {
  id: number;
  email: string;
  isAdmin: boolean;
  accessUntil: string | null;
  createdAt: string;
}

/** Free trial length for a self-service /signup account. */
const TRIAL_DAYS = 2;

export async function findUserByEmail(email: string): Promise<AppUser | null> {
  const db = await usersDb();
  const rows = await db`
    select id, email, password_hash as "passwordHash", is_admin as "isAdmin", access_until as "accessUntil"
    from users where email = ${email.toLowerCase()} limit 1
  `;
  return (rows[0] as AppUser | undefined) ?? null;
}

export async function verifyPassword(email: string, password: string): Promise<AppUser | null> {
  const user = await findUserByEmail(email);
  if (!user) return null;
  const valid = await bcrypt.compare(password, user.passwordHash);
  return valid ? user : null;
}

/**
 * Admin-created account (from /admin) — unlimited access by default. The
 * admin already decided to grant this person access directly, so this
 * isn't the trial funnel; see createTrialUser for that.
 */
export async function createUser(email: string, password: string, isAdmin: boolean): Promise<AppUserSummary> {
  const db = await usersDb();
  const passwordHash = await bcrypt.hash(password, 12);
  const rows = await db`
    insert into users (email, password_hash, is_admin, access_until)
    values (${email.toLowerCase()}, ${passwordHash}, ${isAdmin}, null)
    returning id, email, is_admin as "isAdmin", access_until as "accessUntil", created_at as "createdAt"
  `;
  return rows[0] as AppUserSummary;
}

/**
 * Self-service account from the public /signup page — starts a short free
 * trial (TRIAL_DAYS) rather than unlimited access. proxy.ts redirects to
 * /pricing once access_until passes, where the visitor subscribes by
 * contacting the owner on Telegram; the owner then extends access from
 * /admin (see extendUserAccess) once payment is confirmed.
 */
export async function createTrialUser(email: string, password: string): Promise<AppUserSummary> {
  const db = await usersDb();
  const passwordHash = await bcrypt.hash(password, 12);
  const rows = await db`
    insert into users (email, password_hash, is_admin, access_until)
    values (${email.toLowerCase()}, ${passwordHash}, false, now() + (${TRIAL_DAYS} || ' days')::interval)
    returning id, email, is_admin as "isAdmin", access_until as "accessUntil", created_at as "createdAt"
  `;
  return rows[0] as AppUserSummary;
}

export async function listUsers(): Promise<AppUserSummary[]> {
  const db = await usersDb();
  const rows = await db`
    select id, email, is_admin as "isAdmin", access_until as "accessUntil", created_at as "createdAt"
    from users order by created_at asc
  `;
  return rows as AppUserSummary[];
}

export async function countUsers(): Promise<number> {
  const db = await usersDb();
  const rows = await db`select count(*)::int as count from users`;
  return (rows[0] as { count: number }).count;
}

export async function deleteUser(id: number): Promise<void> {
  const db = await usersDb();
  await db`delete from users where id = ${id}`;
}

/**
 * Sets a user's access_until directly — null for unlimited (e.g. a
 * lifetime/comped grant), or an explicit ISO timestamp. Used by /admin
 * after confirming a Telegram payment.
 */
export async function setUserAccessUntil(id: number, accessUntil: string | null): Promise<AppUserSummary> {
  const db = await usersDb();
  const rows = await db`
    update users set access_until = ${accessUntil} where id = ${id}
    returning id, email, is_admin as "isAdmin", access_until as "accessUntil", created_at as "createdAt"
  `;
  return rows[0] as AppUserSummary;
}

/**
 * Extends a user's access by `days` from whichever is later, now or their
 * current access_until — so extending an account that's still mid-trial (or
 * mid-subscription) adds on top of the remaining time instead of
 * discarding it, while extending an already-expired account starts fresh
 * from today.
 */
export async function extendUserAccess(id: number, days: number): Promise<AppUserSummary> {
  const db = await usersDb();
  const rows = await db`
    update users
    set access_until = greatest(coalesce(access_until, now()), now()) + (${days} || ' days')::interval
    where id = ${id}
    returning id, email, is_admin as "isAdmin", access_until as "accessUntil", created_at as "createdAt"
  `;
  return rows[0] as AppUserSummary;
}
