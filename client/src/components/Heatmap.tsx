import type { ReactNode } from "react";
import { addDays, formatDate, postOp } from "../../../shared/postop.ts";
import { Link } from "../router.tsx";

export interface HeatDay {
  date: string;
  done: number;
  total: number;
  opened: boolean;
}

// One hue (sage), light → dark, for "share of exercises done".
const STEPS = [
  { color: "#cfe0cd", label: "under half" },
  { color: "#9dbb9e", label: "half or more" },
  { color: "#628866", label: "80% or more" },
  { color: "#3c5d40", label: "all done" },
];
const ZERO = "#e9e1d6"; // scheduled, nothing ticked

function cellColor(d: HeatDay): string {
  if (d.total === 0) return "transparent";
  const share = d.done / d.total;
  if (share === 0) return ZERO;
  if (share >= 1) return STEPS[3].color;
  if (share >= 0.8) return STEPS[2].color;
  if (share >= 0.5) return STEPS[1].color;
  return STEPS[0].color;
}

const ROW_LABELS = ["Sat", "", "Mon", "", "Wed", "", "Fri"]; // post-op weeks start on Saturday

/**
 * Consistency calendar: one column per post-op week (Sat–Fri), one cell per day,
 * darker = more of that day's exercises done.
 */
export function Heatmap({
  days,
  surgeryDate,
  today,
  dayHref,
}: {
  days: HeatDay[];
  surgeryDate: string;
  today: string;
  dayHref: (date: string) => string;
}) {
  if (days.length === 0) return null;
  const byDate = new Map(days.map((d) => [d.date, d]));
  const firstWeek = postOp(surgeryDate, days[0].date).week;
  const lastWeek = postOp(surgeryDate, today).week;
  const weeks = Array.from({ length: lastWeek - firstWeek + 1 }, (_, i) => firstWeek + i);

  return (
    <div>
      <div className="overflow-x-auto pb-1">
        <div className="inline-grid gap-[3px]" style={{ gridTemplateColumns: `2rem repeat(${weeks.length}, 1.35rem)` }}>
          <span />
          {weeks.map((w) => (
            <span key={w} className="text-center text-[10px] text-muted">
              {w % 2 === 0 || weeks.length < 8 ? w : ""}
            </span>
          ))}
          {ROW_LABELS.map((label, row) => (
            <Row key={row} label={label}>
              {weeks.map((w) => {
                const date = addDays(surgeryDate, (w - 1) * 7 + row);
                const d = byDate.get(date);
                if (date > today || !d) {
                  return <span key={w} className="size-[1.35rem]" aria-hidden />;
                }
                const text =
                  d.total === 0
                    ? `${formatDate(date)}: rest day`
                    : `${formatDate(date)}: ${d.done} of ${d.total} exercises${d.opened ? "" : " (not opened)"}`;
                return (
                  <Link
                    key={w}
                    href={dayHref(date)}
                    title={text}
                    aria-label={text}
                    className={`size-[1.35rem] rounded-[4px] hover:ring-2 hover:ring-ink/40 ${
                      d.total === 0 ? "border border-dashed border-line" : ""
                    } ${date === today ? "ring-2 ring-ink/60" : ""}`}
                    style={{ background: cellColor(d) }}
                  />
                );
              })}
            </Row>
          ))}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
        <Key color={ZERO} label="none" />
        {STEPS.map((s) => (
          <Key key={s.label} color={s.color} label={s.label} />
        ))}
        <span className="flex items-center gap-1">
          <span className="size-3 rounded-[3px] border border-dashed border-line" /> rest
        </span>
      </div>
      <p className="mt-1 text-[11px] text-muted">Columns are post-op weeks (Sat–Fri). Tap a square to open that day.</p>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <span className="pr-1 text-right text-[10px] leading-[1.35rem] text-muted">{label}</span>
      {children}
    </>
  );
}

function Key({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className="size-3 rounded-[3px]" style={{ background: color }} /> {label}
    </span>
  );
}
