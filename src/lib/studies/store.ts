import { randomBytes, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { Db } from "./types";

/**
 * JSON-file persistence for the MVP. The operator manages staff (managers,
 * researchers) by hand in db.json — there is no admin UI by design (spec §3.6).
 *
 * Note: on serverless hosts the filesystem is ephemeral, so point
 * STUDIES_DATA_DIR at a persistent volume (or swap this module for a real
 * database) before relying on it in production.
 */
const DATA_DIR = process.env.STUDIES_DATA_DIR ?? path.join(process.cwd(), ".data", "studies");
const DB_PATH = path.join(DATA_DIR, "db.json");
export const UPLOADS_DIR = path.join(DATA_DIR, "uploads");

export function newId(): string {
  return randomUUID();
}

/** Unguessable access-link token. */
export function newToken(): string {
  return randomBytes(18).toString("base64url");
}

function seedDb(): Db {
  return {
    clients: [],
    managers: [{ id: newId(), name: "مدير الدراسات", email: "manager@example.com", token: newToken() }],
    researchers: [
      { name: "سارة القحطاني", expertise: ["استطلاعات رأي", "أبحاث سوق"] },
      { name: "خالد العتيبي", expertise: ["مقابلات ميدانية", "تجزئة"] },
      { name: "نورة الشهري", expertise: ["مجموعات تركيز", "أبحاث نوعية"] },
      { name: "فهد الدوسري", expertise: ["تحليل إحصائي", "إعداد تقارير"] },
      { name: "ريم الزهراني", expertise: ["تحليل بيانات", "دراسات جدوى"] },
    ].map((r, i) => ({
      id: newId(),
      name: r.name,
      phone: `05000000${i + 1}`,
      email: `researcher${i + 1}@example.com`,
      expertise: r.expertise,
      token: newToken(),
      performanceNotes: [],
    })),
    studies: [],
    tasks: [],
    files: [],
    reports: [],
    messages: [],
  };
}

async function load(): Promise<Db> {
  try {
    return JSON.parse(await fs.readFile(DB_PATH, "utf8")) as Db;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const db = seedDb();
    await save(db);
    return db;
  }
}

async function save(db: Db): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = `${DB_PATH}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(db, null, 2));
  await fs.rename(tmp, DB_PATH);
}

// All reads and writes go through one in-process queue so concurrent
// requests can't interleave a read-modify-write.
let queue: Promise<unknown> = Promise.resolve();

function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const run = queue.then(job, job);
  queue = run.catch(() => undefined);
  return run;
}

export function readDb(): Promise<Db> {
  return enqueue(load);
}

/** Runs `fn` against the latest data and persists the result unless it throws. */
export function mutate<T>(fn: (db: Db) => T | Promise<T>): Promise<T> {
  return enqueue(async () => {
    const db = await load();
    const result = await fn(db);
    await save(db);
    return result;
  });
}

export async function writeUpload(id: string, bytes: Buffer): Promise<void> {
  await fs.mkdir(UPLOADS_DIR, { recursive: true });
  await fs.writeFile(path.join(UPLOADS_DIR, id), bytes);
}

export function readUpload(id: string): Promise<Buffer> {
  return fs.readFile(path.join(UPLOADS_DIR, id));
}
