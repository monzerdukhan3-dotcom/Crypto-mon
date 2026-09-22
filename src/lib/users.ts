import bcrypt from "bcryptjs";
import { sql } from "./db";

export interface AppUser {
  id: number;
  email: string;
  passwordHash: string;
  isAdmin: boolean;
}

export interface AppUserSummary {
  id: number;
  email: string;
  isAdmin: boolean;
  createdAt: string;
}

export async function findUserByEmail(email: string): Promise<AppUser | null> {
  const db = sql();
  const rows = await db`
    select id, email, password_hash as "passwordHash", is_admin as "isAdmin"
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

export async function createUser(email: string, password: string, isAdmin: boolean): Promise<AppUserSummary> {
  const db = sql();
  const passwordHash = await bcrypt.hash(password, 12);
  const rows = await db`
    insert into users (email, password_hash, is_admin)
    values (${email.toLowerCase()}, ${passwordHash}, ${isAdmin})
    returning id, email, is_admin as "isAdmin", created_at as "createdAt"
  `;
  return rows[0] as AppUserSummary;
}

export async function listUsers(): Promise<AppUserSummary[]> {
  const db = sql();
  const rows = await db`
    select id, email, is_admin as "isAdmin", created_at as "createdAt" from users order by created_at asc
  `;
  return rows as AppUserSummary[];
}

export async function countUsers(): Promise<number> {
  const db = sql();
  const rows = await db`select count(*)::int as count from users`;
  return (rows[0] as { count: number }).count;
}

export async function deleteUser(id: number): Promise<void> {
  const db = sql();
  await db`delete from users where id = ${id}`;
}
