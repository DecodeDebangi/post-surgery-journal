// Post-op date maths, shared by the server and the client.
// Dates are plain "YYYY-MM-DD" strings in the journal's time zone, so there is
// no hidden time-of-day or UTC shift anywhere.

const DAY_MS = 86_400_000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_RE.test(value)) return false;
  const d = new Date(value + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** Today's date as "YYYY-MM-DD" in the given IANA time zone. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function utcMs(date: string): number {
  return new Date(date + "T00:00:00Z").getTime();
}

export function addDays(date: string, days: number): string {
  return new Date(utcMs(date) + days * DAY_MS).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((utcMs(to) - utcMs(from)) / DAY_MS);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(date: string): number {
  return new Date(utcMs(date)).getUTCDay();
}

export interface PostOp {
  day: number; // days since surgery; surgery day = 0
  week: number; // Week 1 = days 0–6
  label: string; // "Week 14 · Day 91"
}

export function postOp(surgeryDate: string, date: string): PostOp {
  const day = daysBetween(surgeryDate, date);
  if (day < 0) return { day, week: 0, label: `${-day} days before surgery` };
  const week = Math.floor(day / 7) + 1;
  return { day, week, label: `Week ${week} · Day ${day}` };
}

/** First and last date of a post-op week. */
export function weekRange(surgeryDate: string, week: number): { start: string; end: string } {
  const start = addDays(surgeryDate, (week - 1) * 7);
  return { start, end: addDays(start, 6) };
}

export const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function formatDate(date: string): string {
  return new Date(utcMs(date)).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
