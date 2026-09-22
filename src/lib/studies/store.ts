import { randomBytes, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { Pool } from "pg";
import type { Db } from "./types";

/**
 * Persistence for the MVP. The whole dataset is one JSON document; the
 * operator manages staff (managers, researchers) by hand — there is no admin
 * UI by design (spec §3.6). See scripts/studies-db.mjs.
 *
 * - With DATABASE_URL (production, e.g. Neon on Vercel): the document lives in
 *   one Postgres row, locked with SELECT … FOR UPDATE for every change, and
 *   uploaded files live in a table next to it.
 * - Without it (local dev): a JSON file and an uploads folder under
 *   STUDIES_DATA_DIR (default .data/studies).
 */

/** Per file. Vercel rejects request bodies over 4.5MB. */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

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

interface Backend {
  read(): Promise<Db>;
  mutate<T>(fn: (db: Db) => T | Promise<T>): Promise<T>;
  writeUpload(id: string, bytes: Buffer): Promise<void>;
  readUpload(id: string): Promise<Buffer>;
}

// ─── Postgres ────────────────────────────────────────────────────────────────

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS studies_state (id int PRIMARY KEY, data jsonb NOT NULL);
  CREATE TABLE IF NOT EXISTS studies_files (id text PRIMARY KEY, bytes bytea NOT NULL);
`;

function postgresBackend(connectionString: string): Backend {
  // Reused across hot reloads / invocations of a warm serverless instance.
  const cache = globalThis as typeof globalThis & { __studiesPool?: Pool; __studiesSchema?: Promise<unknown> };
  const pool = (cache.__studiesPool ??= new Pool({ connectionString, max: 5 }));
  const ready = () =>
    (cache.__studiesSchema ??= pool
      .query(SCHEMA)
      .then(() =>
        pool.query("INSERT INTO studies_state (id, data) VALUES (1, $1) ON CONFLICT (id) DO NOTHING", [
          JSON.stringify(seedDb()),
        ])
      )
      .catch((error) => {
        cache.__studiesSchema = undefined;
        throw error;
      }));

  return {
    async read() {
      await ready();
      const { rows } = await pool.query("SELECT data FROM studies_state WHERE id = 1");
      return rows[0].data as Db;
    },
    async mutate(fn) {
      await ready();
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const { rows } = await client.query("SELECT data FROM studies_state WHERE id = 1 FOR UPDATE");
        const db = rows[0].data as Db;
        const result = await fn(db);
        await client.query("UPDATE studies_state SET data = $1 WHERE id = 1", [JSON.stringify(db)]);
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    },
    async writeUpload(id, bytes) {
      await ready();
      await pool.query("INSERT INTO studies_files (id, bytes) VALUES ($1, $2)", [id, bytes]);
    },
    async readUpload(id) {
      await ready();
      const { rows } = await pool.query("SELECT bytes FROM studies_files WHERE id = $1", [id]);
      if (!rows[0]) throw new Error(`Missing upload ${id}`);
      return rows[0].bytes as Buffer;
    },
  };
}

// ─── Local JSON file ─────────────────────────────────────────────────────────

function fileBackend(dataDir: string): Backend {
  const dbPath = path.join(dataDir, "db.json");
  const uploadsDir = path.join(dataDir, "uploads");

  async function save(db: Db) {
    await fs.mkdir(dataDir, { recursive: true });
    const tmp = `${dbPath}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(db, null, 2));
    await fs.rename(tmp, dbPath);
  }

  async function load(): Promise<Db> {
    try {
      return JSON.parse(await fs.readFile(dbPath, "utf8")) as Db;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      const db = seedDb();
      await save(db);
      return db;
    }
  }

  // One in-process queue so concurrent requests can't interleave a
  // read-modify-write (fine for a single local server).
  let queue: Promise<unknown> = Promise.resolve();
  function enqueue<T>(job: () => Promise<T>): Promise<T> {
    const run = queue.then(job, job);
    queue = run.catch(() => undefined);
    return run;
  }

  return {
    read: () => enqueue(load),
    mutate: (fn) =>
      enqueue(async () => {
        const db = await load();
        const result = await fn(db);
        await save(db);
        return result;
      }),
    async writeUpload(id, bytes) {
      await fs.mkdir(uploadsDir, { recursive: true });
      await fs.writeFile(path.join(uploadsDir, id), bytes);
    },
    readUpload: (id) => fs.readFile(path.join(uploadsDir, id)),
  };
}

const backend: Backend = process.env.DATABASE_URL
  ? postgresBackend(process.env.DATABASE_URL)
  : fileBackend(process.env.STUDIES_DATA_DIR ?? path.join(process.cwd(), ".data", "studies"));

export function readDb(): Promise<Db> {
  return backend.read();
}

/** Runs `fn` against the latest data and persists the result unless it throws. */
export function mutate<T>(fn: (db: Db) => T | Promise<T>): Promise<T> {
  return backend.mutate(fn);
}

export function writeUpload(id: string, bytes: Buffer): Promise<void> {
  return backend.writeUpload(id, bytes);
}

export function readUpload(id: string): Promise<Buffer> {
  return backend.readUpload(id);
}
