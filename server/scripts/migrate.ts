// Applies server/migrations/*.sql in order, once each.
// Usage: npm run db:migrate
import { fileURLToPath } from "node:url";
import { readdirSync, readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const DIR = new URL("../migrations/", import.meta.url);

export async function migrate(databaseUrl: string, log = console.log): Promise<void> {
  const db = neon(databaseUrl);
  await db`create table if not exists schema_migrations (
    name text primary key, applied_at timestamptz not null default now())`;
  const done = new Set((await db`select name from schema_migrations`).map((r) => r.name as string));

  for (const file of readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort()) {
    if (done.has(file)) continue;
    const statements = readFileSync(new URL(file, DIR), "utf8")
      .split(/;\s*$/m)
      .map((s) => s.replace(/^\s*--.*$/gm, "").trim())
      .filter(Boolean);
    // All statements plus the bookkeeping row in one transaction.
    await db.transaction([
      ...statements.map((s) => db.query(s)),
      db`insert into schema_migrations (name) values (${file})`,
    ]);
    log(`applied ${file}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Missing DATABASE_URL");
  await migrate(url);
  console.log("migrations up to date");
}
