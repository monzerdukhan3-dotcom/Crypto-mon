#!/usr/bin/env node
// Operator tool for the studies platform — the MVP has no admin UI (spec §3.6),
// so managers and researchers are added here and access links read from here.
//
// Uses DATABASE_URL when set (production Postgres), otherwise the local
// JSON file under STUDIES_DATA_DIR (default .data/studies).
//
//   npm run studies -- links https://your-app.vercel.app
//   npm run studies -- add-manager "الاسم" email@example.com
//   npm run studies -- add-researcher "الاسم" "خبرة 1,خبرة 2" 05xxxxxxxx email@example.com
//   npm run studies -- export > backup.json
//   npm run studies -- import backup.json
import { randomBytes, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import pg from "pg";

const token = () => randomBytes(18).toString("base64url");

async function openStore() {
  if (process.env.DATABASE_URL) {
    const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    return {
      async update(fn) {
        await client.query("BEGIN");
        const { rows } = await client.query("SELECT data FROM studies_state WHERE id = 1 FOR UPDATE");
        if (!rows[0]) throw new Error("No data yet — open the site once so it initialises the database.");
        const result = await fn(rows[0].data);
        await client.query("UPDATE studies_state SET data = $1 WHERE id = 1", [JSON.stringify(rows[0].data)]);
        await client.query("COMMIT");
        return result;
      },
      close: () => client.end(),
    };
  }
  const file = path.join(process.env.STUDIES_DATA_DIR ?? path.join(process.cwd(), ".data", "studies"), "db.json");
  return {
    async update(fn) {
      const db = JSON.parse(await fs.readFile(file, "utf8").catch(() => {
        throw new Error(`No ${file} yet — open the site once so it initialises the data.`);
      }));
      const result = await fn(db);
      await fs.writeFile(file, JSON.stringify(db, null, 2));
      return result;
    },
    close: async () => {},
  };
}

const [command, ...args] = process.argv.slice(2);
const store = await openStore();
try {
  switch (command) {
    case "links": {
      const base = (args[0] ?? "http://localhost:3000").replace(/\/$/, "");
      await store.update((db) => {
        console.log("# مديرو الدراسات");
        for (const m of db.managers) console.log(`${m.name}: ${base}/studies/m/${m.token}`);
        console.log("\n# الباحثون والخبراء");
        for (const r of db.researchers) console.log(`${r.name}: ${base}/studies/r/${r.token}`);
        console.log("\n# العملاء (رابط لكل دراسة)");
        for (const s of db.studies) {
          const company = db.clients.find((c) => c.id === s.clientId)?.companyName ?? "";
          console.log(`${company} — ${s.title} [${s.status}]: ${base}/studies/c/${s.clientToken}`);
        }
      });
      break;
    }
    case "add-manager": {
      const [name, email = ""] = args;
      if (!name) throw new Error("Usage: add-manager <name> [email]");
      const manager = { id: randomUUID(), name, email, token: token() };
      await store.update((db) => void db.managers.push(manager));
      console.log(`Added manager ${name}: /studies/m/${manager.token}`);
      break;
    }
    case "add-researcher": {
      const [name, expertise = "", phone = "", email = ""] = args;
      if (!name) throw new Error("Usage: add-researcher <name> <expertise,comma,separated> [phone] [email]");
      const researcher = {
        id: randomUUID(),
        name,
        phone,
        email,
        expertise: expertise.split(",").map((e) => e.trim()).filter(Boolean),
        token: token(),
        performanceNotes: [],
      };
      await store.update((db) => void db.researchers.push(researcher));
      console.log(`Added researcher ${name}: /studies/r/${researcher.token}`);
      break;
    }
    case "export":
      await store.update((db) => console.log(JSON.stringify(db, null, 2)));
      break;
    case "import": {
      const next = JSON.parse(await fs.readFile(args[0], "utf8"));
      for (const key of ["clients", "managers", "researchers", "studies", "tasks", "files", "reports", "messages"]) {
        if (!Array.isArray(next[key])) throw new Error(`Invalid file: "${key}" must be an array`);
      }
      await store.update((db) => {
        for (const key of Object.keys(db)) delete db[key];
        Object.assign(db, next);
      });
      console.log("Imported.");
      break;
    }
    default:
      console.log("Commands: links [baseUrl] | add-manager | add-researcher | export | import <file>");
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await store.close();
}
