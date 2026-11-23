import { Router } from "express";
import { EXERCISE_SESSIONS, MEDICINE_TIMES } from "../../../shared/types.ts";
import { modeOf, requireMode } from "../auth.ts";
import { sql } from "../db.ts";
import { bool, date, int, nullable, oneOf, pick, setOf, str } from "../validate.ts";

export const prescription = Router();

// Me and the doctor can both read and change the prescription. Nothing is ever
// deleted: an exercise or medicine is switched off with active=false, so the
// change log and old days stay meaningful.
prescription.use(requireMode("me", "doctor"));

const EXERCISE = {
  name: str(100, 1),
  session: oneOf(EXERCISE_SESSIONS),
  days: setOf(int(0, 6)),
  sets: str(20),
  target: str(60),
  notes: str(500),
  active: bool,
  sort_order: int(0, 10_000),
};

const MEDICINE = {
  name: str(100, 1),
  dose: str(60),
  times: setOf(oneOf(MEDICINE_TIMES)),
  start_date: nullable(date),
  end_date: nullable(date),
  notes: str(500),
  active: bool,
};

const TABLES = {
  exercise: "exercises",
  medicine: "medicines",
} as const;
type ItemType = keyof typeof TABLES;

// Column names come only from the EXERCISE/MEDICINE whitelists above, and
// values are always passed as parameters.
async function createItem(type: ItemType, fields: Record<string, unknown>, by: string) {
  const cols = Object.keys(fields);
  const params = [...Object.values(fields), by];
  const text = `
    with ins as (
      insert into ${TABLES[type]} (${cols.join(", ")})
      values (${cols.map((_, i) => `$${i + 1}`).join(", ")})
      returning *
    )
    insert into prescription_changes (item_type, item_id, action, changed_by, before, after)
    select '${type}', ins.id, 'create', $${params.length}, null, to_jsonb(ins) from ins
    returning after`;
  const rows = await sql().query(text, params);
  return rows[0].after;
}

async function updateItem(type: ItemType, id: number, fields: Record<string, unknown>, by: string) {
  const cols = Object.keys(fields);
  const params = [id, ...Object.values(fields), by];
  const text = `
    with old as (select * from ${TABLES[type]} where id = $1),
    upd as (
      update ${TABLES[type]}
      set ${cols.map((c, i) => `${c} = $${i + 2}`).join(", ")}, updated_at = now()
      where id = $1
      returning *
    )
    insert into prescription_changes (item_type, item_id, action, changed_by, before, after)
    select '${type}', upd.id, 'update', $${params.length}, to_jsonb(old), to_jsonb(upd)
    from upd, old
    returning after`;
  const rows = await sql().query(text, params);
  return rows[0]?.after ?? null;
}

function idParam(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

prescription.get("/", async (_req, res) => {
  const [exercises, medicines] = await Promise.all([
    sql()`
      select id, name, session, days, sets, target, notes, active, sort_order
      from exercises
      order by array_position(${[...EXERCISE_SESSIONS]}::text[], session), sort_order, id`,
    sql()`
      select id, name, dose, times, start_date::text, end_date::text, notes, active
      from medicines order by active desc, name`,
  ]);
  res.json({ exercises, medicines });
});

prescription.get("/history", async (_req, res) => {
  const changes = await sql()`
    select id, item_type, item_id, action, changed_by, before, after, created_at
    from prescription_changes order by created_at desc, id desc limit 300`;
  res.json({ changes });
});

prescription.post("/exercises", async (req, res) => {
  const fields = pick(req.body, EXERCISE, { required: ["name", "session", "days"] });
  res.status(201).json(await createItem("exercise", fields, modeOf(res)));
});

prescription.patch("/exercises/:id", async (req, res) => {
  const id = idParam(req.params.id);
  const fields = pick(req.body, EXERCISE, { partial: true });
  const after = id && (await updateItem("exercise", id, fields, modeOf(res)));
  if (!after) return res.status(404).json({ error: "No such exercise" });
  res.json(after);
});

prescription.post("/medicines", async (req, res) => {
  const fields = pick(req.body, MEDICINE, { required: ["name", "times"] });
  res.status(201).json(await createItem("medicine", fields, modeOf(res)));
});

prescription.patch("/medicines/:id", async (req, res) => {
  const id = idParam(req.params.id);
  const fields = pick(req.body, MEDICINE, { partial: true });
  const after = id && (await updateItem("medicine", id, fields, modeOf(res)));
  if (!after) return res.status(404).json({ error: "No such medicine" });
  res.json(after);
});
