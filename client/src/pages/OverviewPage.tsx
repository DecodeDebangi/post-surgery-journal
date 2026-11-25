import { useEffect, useRef, useState, type ReactNode } from "react";
import { addDays, daysBetween, WEEKDAY_SHORT, weekdayOf } from "../../../shared/postop.ts";
import type { DayStatus } from "../../../shared/status.ts";
import { api } from "../api.ts";
import { StatusChip } from "../components/StatusChip.tsx";
import { Link } from "../router.tsx";
import { useSession } from "../session.tsx";

interface Day {
  date: string;
  label: string;
  status: DayStatus;
  pct: number | null;
  done: number;
  total: number;
  pain: number | null;
  swelling: string | null;
  stiffness: number | null;
  flexion_deg: number | null;
  extension_deg: number | null;
  mood: string | null;
  flags: string[];
  journal: boolean;
  media: number;
  comments: number;
}
type Key = "pain" | "swelling" | "stiffness" | "flexion_deg" | "extension_deg";
type Ref = { value: number | string; date: string } | null;
interface Overview {
  today: string;
  todayLabel: string;
  todayDay: Day | null;
  loggedToday: boolean;
  lastLogged: string | null;
  lastUpdatedAt: string | null;
  previous: Record<Key, Ref>;
  latest: Record<Key, Ref>;
  redFlags: { date: string; flags: string[] }[];
  days: Day[];
}

const short = (d: string) =>
  new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const dayName = (d: string) =>
  new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

const SWELL_ORDER = ["none", "mild", "moderate", "severe"];

/** "down from 2" / "up from 3" / "same as last time"; lowerIsBetter decides the colour. */
function change(
  now: number | string | null,
  before: Ref,
  lowerIsBetter: boolean,
  unit = "",
): { text: string; tone: string } | null {
  if (now === null || !before) return null;
  const a = typeof now === "string" ? SWELL_ORDER.indexOf(now) : now;
  const b = typeof before.value === "string" ? SWELL_ORDER.indexOf(before.value) : before.value;
  if (a === b) return { text: "same as last time", tone: "text-muted" };
  const better = lowerIsBetter ? a < b : a > b;
  return {
    text: `${a < b ? "down" : "up"} from ${before.value}${unit}`,
    tone: better ? "text-[#3c5d40]" : "text-[#8f4429]",
  };
}

/** Groups runs of not-logged days into one row for the table. */
function tableRows(days: Day[], today: string) {
  const rows: ({ kind: "day"; day: Day } | { kind: "gap"; from: string; to: string; count: number })[] = [];
  for (const d of [...days].reverse()) {
    if (d.status === "not_logged" && d.date !== today) {
      const last = rows[rows.length - 1];
      if (last?.kind === "gap" && last.from === addDays(d.date, 1)) {
        last.from = d.date;
        last.count++;
      } else rows.push({ kind: "gap", from: d.date, to: d.date, count: 1 });
    } else rows.push({ kind: "day", day: d });
  }
  return rows;
}

const CELL: Record<DayStatus, string> = {
  on_track: "bg-[#3c5d40] text-white",
  partial: "bg-[#9dbb9e] text-[#1f3322]",
  not_logged: "border-[1.5px] border-dashed border-[#c9bcae] bg-white text-[#8a8078]",
};

export function OverviewPage() {
  const { session } = useSession();
  const mode = session!.mode;
  const [o, setO] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const strip = useRef<HTMLDivElement>(null);
  // On a phone the strip scrolls; start at today, the right-hand end.
  useEffect(() => {
    if (strip.current) strip.current.scrollLeft = strip.current.scrollWidth;
  });

  useEffect(() => {
    api.get<Overview>("/overview").then(setO).catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="rounded-2xl bg-clay-soft p-3 text-sm text-clay">{error}</p>;
  if (!o) return <p className="py-10 text-center text-muted">Loading…</p>;
  if (!o.lastLogged) {
    return (
      <p className="rounded-2xl border border-dashed border-line p-6 text-center text-muted">
        Nothing has been logged yet. The overview fills in from the first logged day.
      </p>
    );
  }

  const t = o.todayDay;
  const missed = tableRows(o.days, o.today).filter((r) => r.kind === "gap");
  const latestGap = missed[0]?.kind === "gap" ? missed[0] : null;
  const sinceLast = daysBetween(o.lastLogged, o.today);
  const dayHref = (d: string) => (d === o.today && mode === "me" ? "/" : `/day/${d}`);

  const pain = change(t?.pain ?? null, o.previous.pain, true);
  const stiff = change(t?.stiffness ?? null, o.previous.stiffness, true);
  const swell = change(t?.swelling ?? null, o.previous.swelling, true);
  const flex = change(t?.flexion_deg ?? null, o.previous.flexion_deg, false, "°");

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Overview</h1>
          {mode === "public" && (
            <p className="mt-1 max-w-2xl text-sm text-muted">
              Daily recovery status after a right-knee ACL reconstruction and meniscus repair: how much of each day's
              rehab got done, pain, swelling and knee angles. The Journey tab has the full scrapbook.
            </p>
          )}
          <p className="text-sm text-muted">
            {dayName(o.today)} · {o.todayLabel}
            {o.lastUpdatedAt &&
              ` · last update ${new Date(o.lastUpdatedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm font-semibold">
          {o.loggedToday ? (
            <span className="rounded-full bg-sage-soft px-3.5 py-1.5 text-[#3c5d40]">Logged today</span>
          ) : (
            <span className="rounded-full bg-[#f6ecd9] px-3.5 py-1.5 text-[#6e5112]">
              Not logged today{sinceLast > 1 ? ` · last entry ${short(o.lastLogged)}` : ""}
            </span>
          )}
          {latestGap?.kind === "gap" && latestGap.count > 1 && (
            <span className="rounded-full bg-clay-soft px-3.5 py-1.5 text-[#8f4429]">
              {latestGap.count} days not logged ({short(latestGap.from)}–{short(latestGap.to)})
            </span>
          )}
          {o.redFlags.length > 0 && (
            <span className="rounded-full bg-clay px-3.5 py-1.5 text-white">
              Red flag {o.redFlags.length === 1 ? `on ${short(o.redFlags[0].date)}` : `on ${o.redFlags.length} days this week`}
            </span>
          )}
        </div>
      </header>

      <section aria-label="Today" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Tile label="Exercises today" value={t && t.total ? `${t.done}/${t.total}` : "—"}>
          {t && t.total > 0 && (
            <>
              <div className="h-1.5 overflow-hidden rounded-full bg-line">
                <div className="h-full bg-[#628866]" style={{ width: `${t.pct ?? 0}%` }} />
              </div>
              <span className="text-xs text-muted">
                {t.pct}% · {t.status === "on_track" ? "on track" : t.status === "partial" ? "partly done" : "not started"}
              </span>
            </>
          )}
        </Tile>
        <Tile label="Pain" value={t?.pain ?? "—"} unit={t?.pain != null ? "/10" : ""} note={pain} fallback={fromLast(o.latest.pain)} />
        <Tile label="Swelling" value={t?.swelling ? cap(t.swelling) : "—"} note={swell} fallback={fromLast(o.latest.swelling)} />
        <Tile label="Stiffness" value={t?.stiffness ?? "—"} unit={t?.stiffness != null ? "/10" : ""} note={stiff} fallback={fromLast(o.latest.stiffness)} />
        <Tile label="Bend" value={t?.flexion_deg != null ? `${t.flexion_deg}°` : "—"} note={flex} fallback={fromLast(o.latest.flexion_deg, "°")} />
        <Tile
          label="Red flags"
          value={o.redFlags.length ? o.redFlags[0].flags.join(", ") : "None"}
          valueClass={o.redFlags.length ? "text-[#8f4429] text-lg" : "text-[#3c5d40]"}
          note={{ text: o.redFlags.length ? `${short(o.redFlags[0].date)} · last 7 days` : "in the last 7 days", tone: "text-muted" }}
        />
      </section>

      <section className="rounded-2xl border border-line bg-card p-4 lg:p-5">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-semibold">Last {o.days.length} days</h2>
          <span className="text-xs text-muted">Tap a day to open it</span>
        </div>
        <div ref={strip} className="overflow-x-auto pb-1">
          <div className="grid min-w-140 gap-1.5" style={{ gridTemplateColumns: `repeat(${o.days.length}, minmax(0, 1fr))` }}>
            {o.days.map((d) => {
              const flagged = d.flags.length > 0;
              const text = d.status === "not_logged" ? (d.date === o.today ? "today" : "—") : `${d.pct ?? "✓"}${d.pct !== null ? "%" : ""}`;
              return (
                <Link
                  key={d.date}
                  href={dayHref(d.date)}
                  title={`${dayName(d.date)}: ${d.status === "not_logged" ? "not logged" : `${d.done}/${d.total} exercises`}${flagged ? ` · red flag: ${d.flags.join(", ")}` : ""}`}
                  className="flex flex-col items-center gap-1"
                >
                  <span className="text-[11px] text-muted">{WEEKDAY_SHORT[weekdayOf(d.date)]}</span>
                  <span
                    className={`grid aspect-square w-full max-w-14 place-items-center rounded-lg text-[11px] font-semibold ${
                      flagged ? "bg-clay text-white" : CELL[d.status]
                    } ${d.date === o.today ? "ring-2 ring-ink/50 ring-offset-1" : ""}`}
                  >
                    {text}
                  </span>
                  <span className="text-[11px] text-muted">{Number(d.date.slice(8))}</span>
                </Link>
              );
            })}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          <Key cls="bg-[#3c5d40]" label="80%+ done (on track)" />
          <Key cls="bg-[#9dbb9e]" label="partly done" />
          <Key cls="border-[1.5px] border-dashed border-[#c9bcae]" label="not logged" />
          <Key cls="bg-clay" label="red flag" />
        </div>
      </section>

      {/* Phone: a compact list. Wider screens: the table. */}
      <ul className="divide-y divide-line/70 rounded-2xl border border-line bg-card sm:hidden">
        {tableRows(o.days, o.today).map((r) =>
          r.kind === "gap" ? (
            <li key={r.from} className="flex items-center justify-between gap-3 bg-[#fcfaf7] px-4 py-3">
              <span className="text-sm">
                <strong>{r.count > 1 ? `${short(r.from)} – ${short(r.to)}` : dayName(r.from)}</strong>
                <span className="block text-xs text-muted">{r.count} {r.count === 1 ? "day" : "days"}, nothing recorded</span>
              </span>
              <StatusChip status="not_logged" />
            </li>
          ) : (
            <li key={r.day.date} className={r.day.flags.length ? "shadow-[inset_3px_0_0_#c4704f]" : ""}>
              <Link href={dayHref(r.day.date)} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="min-w-0 text-sm">
                  <strong>{dayName(r.day.date)}</strong>
                  <span className="block text-xs text-muted">
                    {[
                      r.day.total ? `${r.day.done}/${r.day.total} exercises` : "",
                      r.day.pain !== null ? `pain ${r.day.pain}` : "",
                      r.day.swelling ? `swelling ${r.day.swelling}` : "",
                      r.day.flexion_deg !== null ? `bend ${r.day.flexion_deg}°` : "",
                      notes(r.day),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <StatusChip status={r.day.status} flag={r.day.flags.length > 0} className="shrink-0 justify-end" />
              </Link>
            </li>
          ),
        )}
      </ul>

      <section className="hidden overflow-x-auto rounded-2xl border border-line bg-card sm:block">
        <table className="w-full min-w-180 border-collapse text-sm tabular-nums">
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              {["Day", "Status", "Exercises", "Pain", "Swelling", "Bend", "Ext.", "Notes"].map((h) => (
                <th key={h} className="px-3 py-2.5 font-semibold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tableRows(o.days, o.today).map((r) =>
              r.kind === "gap" ? (
                <tr key={r.from} className="border-b border-line/60 bg-[#fcfaf7]">
                  <td className="px-3 py-2.5">
                    <strong>{r.count > 1 ? `${short(r.from)} – ${short(r.to)}` : dayName(r.from)}</strong>
                    <div className="text-xs text-muted">{r.count} {r.count === 1 ? "day" : "days"}</div>
                  </td>
                  <td className="px-3 py-2.5"><StatusChip status="not_logged" /></td>
                  <td colSpan={6} className="px-3 py-2.5 text-xs text-muted">Nothing recorded</td>
                </tr>
              ) : (
                <tr key={r.day.date} className={`border-b border-line/60 ${r.day.flags.length ? "shadow-[inset_3px_0_0_#c4704f]" : ""}`}>
                  <td className="px-3 py-2.5">
                    <Link href={dayHref(r.day.date)} className="font-semibold hover:underline">{dayName(r.day.date)}</Link>
                    <div className="text-xs text-muted">{r.day.label}</div>
                  </td>
                  <td className="px-3 py-2.5"><StatusChip status={r.day.status} flag={r.day.flags.length > 0} /></td>
                  <td className="px-3 py-2.5">{r.day.total ? `${r.day.done}/${r.day.total}` : "—"}</td>
                  <td className="px-3 py-2.5">{r.day.pain ?? "—"}</td>
                  <td className="px-3 py-2.5">{r.day.swelling ? cap(r.day.swelling) : "—"}</td>
                  <td className="px-3 py-2.5">{r.day.flexion_deg !== null ? `${r.day.flexion_deg}°` : "—"}</td>
                  <td className="px-3 py-2.5">{r.day.extension_deg !== null ? `${r.day.extension_deg}°` : "—"}</td>
                  <td className="px-3 py-2.5 text-xs text-muted">{notes(r.day) || "—"}</td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

function fromLast(ref: Ref, unit = ""): string | null {
  return ref ? `last ${typeof ref.value === "string" ? ref.value : ref.value + unit} on ${short(ref.date)}` : null;
}

function notes(d: Day): string {
  return [
    d.flags.length ? d.flags.join(", ") : "",
    d.journal ? "journal" : "",
    d.media ? `${d.media} ${d.media === 1 ? "photo/video" : "photos/videos"}` : "",
    d.comments ? `${d.comments} ${d.comments === 1 ? "comment" : "comments"}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

function Tile({
  label,
  value,
  unit,
  note,
  fallback,
  valueClass = "",
  children,
}: {
  label: string;
  value: string | number;
  unit?: string;
  note?: { text: string; tone: string } | null;
  fallback?: string | null;
  valueClass?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-2xl border border-line bg-card p-3.5">
      <span className="text-xs text-muted">{label}</span>
      <strong className={`text-2xl leading-tight font-semibold tabular-nums ${valueClass}`}>
        {value}
        {unit && <span className="text-sm font-normal text-muted">{unit}</span>}
      </strong>
      {children}
      {note ? (
        <span className={`text-xs ${note.tone}`}>{note.text}</span>
      ) : value === "—" && fallback ? (
        <span className="text-xs text-muted">{fallback}</span>
      ) : null}
    </div>
  );
}

function Key({ cls, label }: { cls: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`inline-block size-2.5 rounded-[3px] ${cls}`} />
      {label}
    </span>
  );
}
