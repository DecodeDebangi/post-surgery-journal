import { Router } from "express";
import { addDays, isIsoDate, todayIn } from "../../../shared/postop.ts";
import type { TimelineDay } from "../../../shared/types.ts";
import { modeOf } from "../auth.ts";
import { config } from "../config.ts";
import { sql } from "../db.ts";
import { BadRequest } from "../validate.ts";
import { mediaFor } from "./media.ts";
import { milestonesFor } from "./milestones.ts";

export const timeline = Router();

/**
 * Days with something in them, newest first, `limit` at a time.
 * GET /api/timeline?before=YYYY-MM-DD&limit=10 (before is exclusive)
 */
timeline.get("/", async (req, res) => {
  const mode = modeOf(res);
  const before = req.query.before ?? addDays(todayIn(config().timeZone), 1);
  if (!isIsoDate(before)) throw new BadRequest("before must be YYYY-MM-DD");
  const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 31);

  // A day counts if anything was logged, ticked, uploaded or celebrated.
  const rows = await sql()`
    with dates as (
      select l.date from day_logs l
      where l.pain is not null or l.swelling is not null or l.stiffness is not null
         or l.flexion_deg is not null or l.extension_deg is not null or l.mood is not null
         or l.journal <> ''
         or exists (select 1 from day_items i where i.date = l.date and i.done)
      union
      select date from media where ${mode !== "public"} or not is_private
      union
      select date from milestones
    )
    select d.date::text, l.pain, l.swelling, l.stiffness, l.mood, coalesce(l.journal, '') as journal,
           l.flexion_deg, l.extension_deg,
           coalesce(l.flag_locking or l.flag_catching or l.flag_giving_way or l.flag_sharp_pain, false) as red_flag,
           (select count(*)::int from day_items i where i.date = d.date and i.kind = 'exercise') as total,
           (select count(*)::int from day_items i where i.date = d.date and i.kind = 'exercise' and i.done) as done
    from dates d left join day_logs l on l.date = d.date
    where d.date < ${before}::date
    order by d.date desc
    limit ${limit}`;

  const dates = rows.map((r) => r.date as string);
  const [media, milestones, comments] = await Promise.all([
    mediaFor(dates, mode),
    milestonesFor(dates),
    mode === "public" || dates.length === 0
      ? Promise.resolve([])
      : sql()`select target_key, count(*)::int as n from comments
              where target_type = 'day' and target_key = any(${dates}) group by target_key`,
  ]);

  const days: TimelineDay[] = rows.map((r) => {
    const day: TimelineDay = {
      date: r.date,
      pain: r.pain,
      swelling: r.swelling,
      stiffness: r.stiffness,
      mood: r.mood,
      journal: r.journal,
      flexion_deg: r.flexion_deg,
      extension_deg: r.extension_deg,
      done: r.done,
      total: r.total,
      media: media.filter((m) => m.date === r.date),
      milestones: milestones.filter((m) => m.date === r.date),
    };
    if (mode !== "public") {
      day.red_flag = r.red_flag;
      day.comments = comments.find((c) => c.target_key === r.date)?.n ?? 0;
    }
    return day;
  });

  res.json({ days, next: days.length === limit ? days[days.length - 1].date : null });
});
