// Loads the starting prescription. Does nothing if exercises already exist.
// Usage: npm run db:seed
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";
import { SEED_EXERCISES } from "./seed-data.ts";

export async function seed(databaseUrl: string, log = console.log): Promise<void> {
  const db = neon(databaseUrl);
  const [{ count }] = await db`select count(*)::int as count from exercises`;
  if (count > 0) {
    log(`exercises already present (${count}); seed skipped`);
    return;
  }
  await db.transaction(
    SEED_EXERCISES.map((e, i) => db`
      insert into exercises (name, session, days, sets, target, notes, sort_order)
      values (${e.name}, ${e.session}, ${e.days}, ${e.sets ?? ""}, ${e.target ?? ""},
              ${e.notes ?? ""}, ${i * 10})`),
  );
  log(`seeded ${SEED_EXERCISES.length} exercises`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Missing DATABASE_URL");
  await seed(url);
}
