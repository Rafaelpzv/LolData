// Applies supabase/migrations/*.sql in order, recording each one in supabase_migrations_log so a
// re-run skips what is already applied. Run with: node scripts/apply-migrations.mjs
//
// The SQL files are idempotent on purpose; this script only tracks the order and gives feedback.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import dotenv from "dotenv";
import postgres from "postgres";

dotenv.config({ path: ".env.local", quiet: true });

const url = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL;
if (!url) {
  console.error("Missing POSTGRES_URL / POSTGRES_URL_NON_POOLING in .env.local");
  process.exit(1);
}

const dir = join(process.cwd(), "supabase", "migrations");
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const sql = postgres(url, { ssl: "require", max: 1, onnotice: () => {} });

try {
  await sql`create table if not exists supabase_migrations_log (
    name text primary key,
    applied_at timestamptz not null default now()
  )`;

  const done = new Set((await sql`select name from supabase_migrations_log`).map((row) => row.name));
  for (const file of files) {
    if (done.has(file)) {
      console.log(`skip   ${file}`);
      continue;
    }
    const body = readFileSync(join(dir, file), "utf8");
    await sql.unsafe(body);
    await sql`insert into supabase_migrations_log (name) values (${file}) on conflict do nothing`;
    console.log(`applied ${file}`);
  }
} catch (error) {
  console.error("migration failed:", error.message);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
