import { Router, type Response } from "express";
import { isIsoDate, todayIn, weekdayOf } from "../../../shared/postop.ts";
import {
  EXERCISE_SESSIONS,
  MEDICINE_TIMES,
  MOODS,
  SWELLING,
  type DayItem,
  type DayLog,
} from "../../../shared/types.ts";
import { modeOf, requireMode } from "../auth.ts";
import { config } from "../config.ts";
import { writableDate } from "../dates.ts";
import { sql } from "../db.ts";
import { storage } from "../storage.ts";
import { mediaFor } from "./media.ts";
import { milestonesFor } from "./milestones.ts";
import { bool, int, nullable, oneOf, pick, str } from "../validate.ts";

export const days = Router();

const DAY_FIELDS = {
  pain: nullable(int(0, 10)),
  swelling: nullable(oneOf(SWELLING)),
  stiffness: nullable(int(0, 10)),
  flexion_deg: nullable(int(0, 170)),
  extension_deg: nullable(int(-30, 30)),
  mood: nullable(oneOf(MOODS)),
  journal: str(20_000),
  flag_locking: bool,
  flag_catching: bool,
  flag_giving_way: bool,
  flag_sharp_pain: bool,
};

const ITEM_FIELDS = { done: bool, actual: str(40) };

async function loadDay(date: string, res: Response): Promise<DayLog> {
  const mode = modeOf(res);
  const [logs, items, media, milestones] = await Promise.all([
    sql()`
      select date::text, pain, swelling, stiffness, flexion_deg, extension_deg, mood, journal,
             flag_locking, flag_catching, flag_giving_way, flag_sharp_pain
      from day_logs where date = ${date}`,
    sql()`
      select id, kind, slot, name, sets, target, notes, done, actual
      from day_items where date = ${date}
      order by kind = 'medicine',
               coalesce(array_position(${[...EXERCISE_SESSIONS]}::text[], slot),
                        array_position(${[...MEDICINE_TIMES]}::text[], slot)),
               sort_order, id`,
    mediaFor([date], mode),
    milestonesFor([date]),
  ]);
  const log = logs[0];
  const day = {
    date,
    exists: Boolean(log),
    pain: log?.pain ?? null,
    swelling: log?.swelling ?? null,
    stiffness: log?.stiffness ?? null,
    flexion_deg: log?.flexion_deg ?? null,
    extension_deg: log?.extension_deg ?? null,
    mood: log?.mood ?? null,
    journal: log?.journal ?? "",
    flag_locking: log?.flag_locking ?? false,
    flag_catching: log?.flag_catching ?? false,
    flag_giving_way: log?.flag_giving_way ?? false,
    flag_sharp_pain: log?.flag_sharp_pain ?? false,
    items: items as DayItem[],
    media,
    milestones,
  } satisfies DayLog;

  if (mode !== "public") return day;

  // Public view: no red flags, no medicines, no prescribed sets/targets/notes.
  const { flag_locking, flag_catching, flag_giving_way, flag_sharp_pain, ...publicDay } = day;
  return {
    ...publicDay,
    items: day.items
      .filter((i) => i.kind === "exercise")
      .map(({ id, kind, slot, name, done, actual }) => ({ id, kind, slot, name, done, actual })),
  };
}

days.get("/:date", async (req, res) => {
  if (!isIsoDate(req.params.date)) return res.status(400).json({ error: "Date must be YYYY-MM-DD" });
  res.json(await loadDay(req.params.date, res));
});

/**
 * Creates the day and its checklist from the prescription.
 * Today: adds anything newly prescribed and drops unticked items that are no
 * longer prescribed, so a same-day change by the doctor shows up.
 * Past days: only filled in if the day has no checklist yet.
 */
days.post("/:date/ensure", requireMode("me"), async (req, res) => {
  const date = writableDate(req.params.date);
  const isToday = date === todayIn(config().timeZone);
  const dow = weekdayOf(date);
  const db = sql();

  const [{ count }] = await db`select count(*)::int as count from day_items where date = ${date}`;
  const fill = isToday || count === 0;

  await db.transaction([
    db`insert into day_logs (date) values (${date}) on conflict do nothing`,
    ...(fill
      ? [
          db`
            insert into day_items (date, kind, source_id, slot, name, sets, target, notes, sort_order)
            select ${date}::date, 'exercise', id, session, name, sets, target, notes, sort_order
            from exercises where active and ${dow}::smallint = any(days)
            on conflict do nothing`,
          db`
            insert into day_items (date, kind, source_id, slot, name, sets, target, notes, sort_order)
            select ${date}::date, 'medicine', m.id, t, m.name, '', m.dose, m.notes, 0
            from medicines m, unnest(m.times) as t
            where m.active
              and (m.start_date is null or m.start_date <= ${date}::date)
              and (m.end_date is null or m.end_date >= ${date}::date)
            on conflict do nothing`,
        ]
      : []),
    ...(isToday
      ? [
          db`
            delete from day_items d
            where d.date = ${date} and not d.done and d.actual = '' and (
              (d.kind = 'exercise' and not exists (
                select 1 from exercises e
                where e.id = d.source_id and e.active and e.session = d.slot
                  and ${dow}::smallint = any(e.days)))
              or
              (d.kind = 'medicine' and not exists (
                select 1 from medicines m
                where m.id = d.source_id and m.active and d.slot = any(m.times)
                  and (m.start_date is null or m.start_date <= ${date}::date)
                  and (m.end_date is null or m.end_date >= ${date}::date))))`,
        ]
      : []),
  ]);
  res.json(await loadDay(date, res));
});

days.patch("/:date", requireMode("me"), async (req, res) => {
  const date = writableDate(req.params.date);
  const fields = pick(req.body, DAY_FIELDS, { partial: true });
  const cols = Object.keys(fields);
  // Column names come from the DAY_FIELDS whitelist; values are parameters.
  await sql().query(
    `insert into day_logs (date, ${cols.join(", ")})
     values ($1, ${cols.map((_, i) => `$${i + 2}`).join(", ")})
     on conflict (date) do update set
       ${cols.map((c) => `${c} = excluded.${c}`).join(", ")}, updated_at = now()`,
    [date, ...Object.values(fields)],
  );
  res.json(await loadDay(date, res));
});

days.patch("/:date/items/:id", requireMode("me"), async (req, res) => {
  const date = writableDate(req.params.date);
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(404).json({ error: "No such item" });
  const fields = pick(req.body, ITEM_FIELDS, { partial: true });
  const cols = Object.keys(fields);
  const rows = await sql().query(
    `update day_items set ${cols.map((c, i) => `${c} = $${i + 3}`).join(", ")}
     where id = $1 and date = $2
     returning id, kind, slot, name, sets, target, notes, done, actual`,
    [id, date, ...Object.values(fields)],
  );
  if (!rows.length) return res.status(404).json({ error: "No such item" });
  await sql()`update day_logs set updated_at = now() where date = ${date}`;
  res.json(rows[0]);
});

days.delete("/:date", requireMode("me"), async (req, res) => {
  if (!isIsoDate(req.params.date)) return res.status(400).json({ error: "Date must be YYYY-MM-DD" });
  // Clearing a day also removes its photos and videos (milestones stay).
  const removed = await sql()`delete from media where date = ${req.params.date} returning storage_key`;
  await sql()`delete from day_logs where date = ${req.params.date}`;
  await Promise.all(
    removed.filter((r) => r.storage_key).map((r) => storage()?.delete(r.storage_key).catch(() => {})),
  );
  res.json({ deleted: true });
});
