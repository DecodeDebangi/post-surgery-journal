import { Router } from "express";
import { addDays, postOp, todayIn, weekRange, weekdayOf } from "../../../shared/postop.ts";
import { RED_FLAGS, type RedFlagKey } from "../../../shared/types.ts";
import { modeOf } from "../auth.ts";
import { config } from "../config.ts";
import { sql } from "../db.ts";
import { BadRequest } from "../validate.ts";
import { mediaFor } from "./media.ts";
import { milestonesFor } from "./milestones.ts";

export const stats = Router();

/** A day counts towards the streak when at least half its exercises are ticked. */
export const STREAK_SHARE = 0.5;

export interface DayStat {
  date: string;
  day: number;
  week: number;
  pain: number | null;
  stiffness: number | null;
  swelling: string | null;
  flexion_deg: number | null;
  extension_deg: number | null;
  done: number;
  /** Exercises scheduled. For days never opened, taken from the current plan. */
  total: number;
  opened: boolean;
}

/**
 * One row per day from the first logged day to today. Days that were never
 * opened still count as scheduled (from today's prescription), so skipped days
 * lower the completion % instead of disappearing.
 */
async function dailyStats(): Promise<DayStat[]> {
  const { surgeryDate, timeZone } = config();
  const today = todayIn(timeZone);
  const [logs, planned] = await Promise.all([
    sql()`
      select l.date::text, l.pain, l.stiffness, l.swelling, l.flexion_deg, l.extension_deg,
             count(i.id) filter (where i.kind = 'exercise')::int as total,
             count(i.id) filter (where i.kind = 'exercise' and i.done)::int as done
      from day_logs l left join day_items i on i.date = l.date
      where l.date between ${surgeryDate}::date and ${today}::date
      group by l.date order by l.date`,
    sql()`
      select d, count(e.id)::int as n
      from generate_series(0, 6) d left join exercises e on e.active and d::smallint = any(e.days)
      group by d`,
  ]);
  if (logs.length === 0) return [];
  const perWeekday = new Map(planned.map((p) => [p.d as number, p.n as number]));
  const byDate = new Map(logs.map((l) => [l.date as string, l]));

  const out: DayStat[] = [];
  for (let date = logs[0].date as string; date <= today; date = addDays(date, 1)) {
    const l = byDate.get(date);
    const op = postOp(surgeryDate, date);
    const opened = Boolean(l && l.total > 0);
    out.push({
      date,
      day: op.day,
      week: op.week,
      pain: l?.pain ?? null,
      stiffness: l?.stiffness ?? null,
      swelling: l?.swelling ?? null,
      flexion_deg: l?.flexion_deg ?? null,
      extension_deg: l?.extension_deg ?? null,
      done: l?.done ?? 0,
      total: opened ? l!.total : (perWeekday.get(weekdayOf(date)) ?? 0),
      opened,
    });
  }
  return out;
}

const counts = (d: DayStat) => d.total > 0 && d.done / d.total >= STREAK_SHARE;

export function streaks(days: DayStat[], today: string): { current: number; best: number } {
  let best = 0;
  let run = 0;
  for (const d of days) {
    if (d.total === 0) continue; // nothing scheduled: neither breaks nor extends
    run = counts(d) ? run + 1 : 0;
    best = Math.max(best, run);
  }
  // Current: back from today; an unfinished today doesn't break it yet.
  let current = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    const d = days[i];
    if (d.total === 0) continue;
    if (counts(d)) current++;
    else if (d.date === today) continue;
    else break;
  }
  return { current, best };
}

function weekly(days: DayStat[]) {
  const weeks = new Map<number, { week: number; done: number; total: number }>();
  for (const d of days) {
    const w = weeks.get(d.week) ?? { week: d.week, done: 0, total: 0 };
    w.done += d.done;
    w.total += d.total;
    weeks.set(d.week, w);
  }
  return [...weeks.values()].map((w) => ({ ...w, pct: w.total ? Math.round((w.done / w.total) * 100) : 0 }));
}

// Everything here is built from fields the public can already see.
stats.get("/", async (_req, res) => {
  const days = await dailyStats();
  res.json({
    days,
    weeks: weekly(days),
    streak: streaks(days, todayIn(config().timeZone)),
    streakRule: `A day counts when at least ${STREAK_SHARE * 100}% of its exercises are ticked.`,
  });
});

const avg = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x !== null);
  return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null;
};
const latest = (days: DayStat[], key: "flexion_deg" | "extension_deg") =>
  [...days].reverse().find((d) => d[key] !== null) ?? null;

/** The 30-second weekly summary for the doctor. */
stats.get("/weeks/:n", async (req, res) => {
  const n = Number(req.params.n);
  const { surgeryDate, timeZone } = config();
  const today = todayIn(timeZone);
  const current = postOp(surgeryDate, today).week;
  if (!Number.isInteger(n) || n < 1 || n > current) throw new BadRequest(`Week must be 1–${current}`);
  const { start, end } = weekRange(surgeryDate, n);
  const dates: string[] = [];
  for (let d = start; d <= end && d <= today; d = addDays(d, 1)) dates.push(d);

  const all = await dailyStats();
  const inWeek = all.filter((d) => d.week === n);
  const before = all.filter((d) => d.week < n);
  const done = inWeek.reduce((a, d) => a + d.done, 0);
  const total = inWeek.reduce((a, d) => a + d.total, 0);

  const flagCols = Object.keys(RED_FLAGS) as RedFlagKey[];
  const [flagRows, notes, media, milestones] = await Promise.all([
    sql()`
      select date::text, flag_locking, flag_catching, flag_giving_way, flag_sharp_pain
      from day_logs
      where date between ${start}::date and ${end}::date
        and (flag_locking or flag_catching or flag_giving_way or flag_sharp_pain)
      order by date`,
    sql()`
      select date::text, journal from day_logs
      where date between ${start}::date and ${end}::date and journal <> '' order by date`,
    mediaFor(dates, modeOf(res)),
    milestonesFor(dates),
  ]);

  const flex = latest(inWeek, "flexion_deg");
  const ext = latest(inWeek, "extension_deg");
  const prevFlex = latest(before, "flexion_deg");
  const prevExt = latest(before, "extension_deg");

  res.json({
    week: n,
    start,
    end,
    complete: end < today,
    completion: { done, total, pct: total ? Math.round((done / total) * 100) : null },
    daysLogged: inWeek.filter((d) => d.opened).length,
    daysInWeek: dates.length,
    avgPain: avg(inWeek.map((d) => d.pain)),
    avgStiffness: avg(inWeek.map((d) => d.stiffness)),
    worstSwelling:
      ["severe", "moderate", "mild", "none"].find((s) => inWeek.some((d) => d.swelling === s)) ?? null,
    flexion: flex && { value: flex.flexion_deg, date: flex.date, previous: prevFlex?.flexion_deg ?? null },
    extension: ext && { value: ext.extension_deg, date: ext.date, previous: prevExt?.extension_deg ?? null },
    redFlags: flagRows.map((r) => ({
      date: r.date,
      flags: flagCols.filter((k) => r[k]).map((k) => RED_FLAGS[k]),
    })),
    notes,
    media,
    milestones,
    days: inWeek,
  });
});

