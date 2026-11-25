import { Router } from "express";
import { addDays, postOp, todayIn } from "../../../shared/postop.ts";
import { dayStatus, percent, type DayStatus } from "../../../shared/status.ts";
import { RED_FLAGS, type RedFlagKey, type Swelling } from "../../../shared/types.ts";
import { modeOf } from "../auth.ts";
import { config } from "../config.ts";
import { sql } from "../db.ts";

export const overview = Router();

export interface OverviewDay {
  date: string;
  label: string; // "Week 15 · Day 102"
  status: DayStatus;
  pct: number | null;
  done: number;
  total: number;
  pain: number | null;
  swelling: Swelling | null;
  stiffness: number | null;
  flexion_deg: number | null;
  extension_deg: number | null;
  mood: string | null;
  flags: string[];
  journal: boolean;
  media: number;
  comments: number;
}

const WINDOW = 14; // days shown
const LOOKBACK = 90; // days searched for "previous" and "latest" values

/**
 * The one-screen status: today's numbers with what they were last time, the
 * last 14 days (missed days included) and recent red flags. Open to everyone;
 * photos marked private are only counted for me and the doctor.
 */
overview.get("/", async (_req, res) => {
  const isPublic = modeOf(res) === "public";
  const { surgeryDate, timeZone } = config();
  const today = todayIn(timeZone);
  const from = addDays(today, -(LOOKBACK - 1));

  const rows = await sql()`
    select l.date::text, l.mood, l.pain, l.swelling, l.stiffness, l.flexion_deg, l.extension_deg,
           l.flag_locking, l.flag_catching, l.flag_giving_way, l.flag_sharp_pain,
           l.journal <> '' as journal, l.updated_at,
           (select count(*)::int from day_items i where i.date = l.date and i.kind = 'exercise') as total,
           (select count(*)::int from day_items i where i.date = l.date and i.kind = 'exercise' and i.done) as done,
           (select count(*)::int from media m where m.date = l.date and (${!isPublic} or not m.is_private)) as media,
           (select count(*)::int from comments c where c.target_type = 'day' and c.target_key = l.date::text) as comments
    from day_logs l
    where l.date between ${from}::date and ${today}::date
    order by l.date`;

  const flagCols = Object.keys(RED_FLAGS) as RedFlagKey[];
  const byDate = new Map<string, OverviewDay>();
  let lastUpdatedAt: string | null = null;
  for (const r of rows) {
    const logged =
      r.done > 0 || r.media > 0 || r.journal ||
      [r.pain, r.swelling, r.stiffness, r.flexion_deg, r.extension_deg].some((v) => v !== null) ||
      flagCols.some((k) => r[k]);
    if (logged && (!lastUpdatedAt || r.updated_at > lastUpdatedAt)) lastUpdatedAt = r.updated_at;
    byDate.set(r.date, {
      date: r.date,
      label: postOp(surgeryDate, r.date).label,
      status: dayStatus({ done: r.done, total: r.total, logged }),
      pct: percent(r.done, r.total),
      done: r.done,
      total: r.total,
      pain: r.pain,
      swelling: r.swelling,
      stiffness: r.stiffness,
      flexion_deg: r.flexion_deg,
      extension_deg: r.extension_deg,
      mood: r.mood,
      flags: flagCols.filter((k) => r[k]).map((k) => RED_FLAGS[k]),
      journal: r.journal,
      media: r.media,
      comments: r.comments,
    });
  }

  const loggedDates = [...byDate.values()].filter((d) => d.status !== "not_logged").map((d) => d.date);
  const firstLogged = loggedDates[0] ?? null;

  // The window starts at the first logged day at the latest, so days before
  // the journal was in use don't show up as "missed".
  const days: OverviewDay[] = [];
  const windowStart = addDays(today, -(WINDOW - 1));
  const start = firstLogged && firstLogged > windowStart ? firstLogged : windowStart;
  if (firstLogged) {
    for (let d = start; d <= today; d = addDays(d, 1)) {
      days.push(
        byDate.get(d) ?? {
          date: d, label: postOp(surgeryDate, d).label, status: "not_logged", pct: null, done: 0, total: 0,
          pain: null, swelling: null, stiffness: null, flexion_deg: null, extension_deg: null, mood: null,
          flags: [], journal: false, media: 0, comments: 0,
        },
      );
    }
  }

  // The most recent logged value of each reading before today, and overall.
  type Key = "pain" | "swelling" | "stiffness" | "flexion_deg" | "extension_deg";
  const logged = [...byDate.values()].filter((d) => d.status !== "not_logged");
  const lastValue = (key: Key, before: string) => {
    const d = [...logged].reverse().find((x) => x.date < before && x[key] !== null);
    return d ? { value: d[key], date: d.date } : null;
  };
  const keys: Key[] = ["pain", "swelling", "stiffness", "flexion_deg", "extension_deg"];

  res.json({
    today,
    todayLabel: postOp(surgeryDate, today).label,
    todayDay: byDate.get(today) ?? null,
    loggedToday: byDate.get(today)?.status !== undefined && byDate.get(today)!.status !== "not_logged",
    lastLogged: loggedDates[loggedDates.length - 1] ?? null,
    lastUpdatedAt,
    previous: Object.fromEntries(keys.map((k) => [k, lastValue(k, today)])),
    latest: Object.fromEntries(keys.map((k) => [k, lastValue(k, addDays(today, 1))])),
    redFlags: days.filter((d) => d.flags.length && d.date > addDays(today, -7)).map((d) => ({ date: d.date, flags: d.flags })),
    days,
  });
});
