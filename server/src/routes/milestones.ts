import { Router } from "express";
import type { Milestone } from "../../../shared/types.ts";
import { requireMode } from "../auth.ts";
import { writableDate } from "../dates.ts";
import { sql } from "../db.ts";
import { BadRequest, pick, str } from "../validate.ts";

export const milestones = Router();

const FIELDS = { date: str(10, 10), title: str(120, 1), note: str(1000), emoji: str(16, 1) };
const SELECT = "id, date::text, title, note, emoji";

export async function milestonesFor(dates: string[]): Promise<Milestone[]> {
  if (dates.length === 0) return [];
  return (await sql()`
    select id, date::text, title, note, emoji from milestones
    where date = any(${dates}::date[]) order by date, id`) as Milestone[];
}

function idOf(raw: unknown): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) throw new BadRequest("Bad milestone id");
  return id;
}

// Milestones are part of the public journey.
milestones.get("/", async (_req, res) => {
  const rows = await sql()`select id, date::text, title, note, emoji from milestones order by date desc, id desc`;
  res.json({ milestones: rows });
});

milestones.post("/", requireMode("me"), async (req, res) => {
  const f = pick(req.body, FIELDS, { required: ["date", "title"] });
  const date = writableDate(f.date);
  const [row] = await sql().query(
    `insert into milestones (date, title, note, emoji) values ($1, $2, $3, $4) returning ${SELECT}`,
    [date, f.title, f.note ?? "", f.emoji ?? "⭐"],
  );
  res.status(201).json(row);
});

milestones.patch("/:id", requireMode("me"), async (req, res) => {
  const f = pick(req.body, FIELDS, { partial: true });
  if (f.date !== undefined) f.date = writableDate(f.date);
  const cols = Object.keys(f);
  const rows = await sql().query(
    `update milestones set ${cols.map((c, i) => `${c} = $${i + 2}`).join(", ")} where id = $1 returning ${SELECT}`,
    [idOf(req.params.id), ...Object.values(f)],
  );
  if (!rows.length) return res.status(404).json({ error: "No such milestone" });
  res.json(rows[0]);
});

milestones.delete("/:id", requireMode("me"), async (req, res) => {
  const rows = await sql()`delete from milestones where id = ${idOf(req.params.id)} returning id`;
  if (!rows.length) return res.status(404).json({ error: "No such milestone" });
  res.json({ deleted: true });
});
