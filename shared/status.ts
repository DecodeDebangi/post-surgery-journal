// One rule for a day's status, used by the Overview, the Journey cards and
// the tests, so every view agrees.

export type DayStatus = "on_track" | "partial" | "not_logged";

/** At least this share of the day's exercises ticked counts as on track. */
export const ON_TRACK_SHARE = 0.8;

export const STATUS_LABELS: Record<DayStatus, string> = {
  on_track: "On track",
  partial: "Partial",
  not_logged: "Not logged",
};

/**
 * `logged` means anything was recorded that day: a tick, a reading, the
 * journal or a photo. `total` is the number of exercises scheduled.
 */
export function dayStatus(d: { done: number; total: number; logged: boolean }): DayStatus {
  if (!d.logged) return "not_logged";
  if (d.total === 0) return "on_track"; // nothing was scheduled
  return d.done / d.total >= ON_TRACK_SHARE ? "on_track" : "partial";
}

export function percent(done: number, total: number): number | null {
  return total > 0 ? Math.round((done / total) * 100) : null;
}
