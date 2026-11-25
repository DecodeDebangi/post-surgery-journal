import { useCallback, useEffect, useState } from "react";
import { addDays, daysBetween, formatDate, postOp } from "../../../shared/postop.ts";
import { dayStatus, percent } from "../../../shared/status.ts";
import type { Milestone, TimelineDay } from "../../../shared/types.ts";
import { api } from "../api.ts";
import { MilestoneCard, MilestoneForm } from "../components/Milestones.tsx";
import { StatusChip } from "../components/StatusChip.tsx";
import { Link } from "../router.tsx";
import { useSession } from "../session.tsx";

const TAPE = ["bg-clay/25", "bg-sage/30", "bg-sky/25"];

/** The scrapbook: one card per day with something in it, newest first. */
export function TimelinePage() {
  const { session } = useSession();
  const { mode, today, surgeryDate, postOp: now } = session!;
  const [days, setDays] = useState<TimelineDay[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Milestone | null>(null);

  const load = useCallback(async (before?: string) => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.get<{ days: TimelineDay[]; next: string | null }>(
        `/timeline?limit=10${before ? `&before=${before}` : ""}`,
      );
      setDays((d) => (before ? [...d, ...r.days] : r.days));
      setNext(r.next);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function reload() {
    setAdding(false);
    setEditing(null);
    load();
  }

  // Missed days between logged days (newest first), and since the last entry.
  // Today only counts as missed once it's over.
  const gapBefore = new Map<string, Gap>();
  const logged = days.filter(hasDayContent);
  if (logged.length) {
    const yesterday = addDays(today, -1);
    if (logged[0].date < yesterday) {
      gapBefore.set(days[0].date, { from: addDays(logged[0].date, 1), to: yesterday, ongoing: true });
    }
    for (let i = 1; i < logged.length; i++) {
      const newer = logged[i - 1].date;
      const older = logged[i].date;
      if (daysBetween(older, newer) > 1) gapBefore.set(logged[i].date, { from: addDays(older, 1), to: addDays(newer, -1) });
    }
      }

  const dayHref = (date: string) => (date === today && mode === "me" ? "/" : `/day/${date}`);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold">The journey so far</h1>
        <p className="text-sm text-muted">
          {mode === "public" ? (
            <>
              A recovery scrapbook after a right-knee ACL reconstruction and meniscus repair on {formatDate(surgeryDate)}.
              Each card is a day: exercises done, how the knee felt, photos and a short journal. Today is{" "}
              {now.label}.
            </>
          ) : (
            <>Every day with something logged, newest first. Tap a day to open it.</>
          )}
        </p>
      </div>

      {mode === "me" &&
        (adding ? (
          <MilestoneForm today={today} surgeryDate={surgeryDate} onDone={reload} onCancel={() => setAdding(false)} />
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="w-full rounded-2xl border border-dashed border-sage/50 bg-sage-soft/50 py-3 text-sm font-medium text-sage"
          >
            ⭐ Add a milestone
          </button>
        ))}

      {error && (
        <p className="rounded-2xl bg-clay-soft p-3 text-sm text-clay">
          {error}{" "}
          <button className="underline" onClick={() => load()}>
            Retry
          </button>
        </p>
      )}

      {!loading && days.length === 0 && !error && (
        <p className="rounded-2xl border border-dashed border-line p-6 text-center text-muted">
          Nothing here yet. Days show up once something is logged.
        </p>
      )}

      {days.map((day, i) => (
        <div key={day.date} className="space-y-3">
          {gapBefore.get(day.date) && <GapCard {...gapBefore.get(day.date)!} />}
          {day.milestones.map((m) =>
            editing?.id === m.id ? (
              <MilestoneForm
                key={m.id}
                initial={m}
                today={today}
                surgeryDate={surgeryDate}
                onDone={reload}
                onCancel={() => setEditing(null)}
              />
            ) : (
              <MilestoneCard
                key={m.id}
                milestone={m}
                surgeryDate={surgeryDate}
                onEdit={mode === "me" ? () => setEditing(m) : undefined}
              />
            ),
          )}
          {hasDayContent(day) && <DayCard day={day} index={i} href={dayHref(day.date)} surgeryDate={surgeryDate} />}
        </div>
      ))}

      {loading && <p className="py-6 text-center text-muted">Loading…</p>}
      {next && !loading && (
        <button onClick={() => load(next)} className="w-full rounded-xl border border-line bg-card py-3 text-sm">
          Show older days
        </button>
      )}
      {!next && !loading && days.length > 0 && (
        <p className="pb-4 text-center text-xs text-muted">That's the beginning — surgery day was {formatDate(surgeryDate)}.</p>
      )}
    </div>
  );
}

interface Gap {
  from: string;
  to: string;
  ongoing?: boolean;
}

/** A stretch of days with nothing recorded, so gaps are visible instead of silently skipped. */
function GapCard({ from, to, ongoing }: Gap) {
  const n = daysBetween(from, to) + 1;
  const short = (d: string) =>
    new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  const range = n === 1 ? formatDate(from) : `${short(from)} – ${short(to)}`;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border-[1.5px] border-dashed border-[#d8cdbf] px-4 py-3 text-sm text-muted">
      <StatusChip status="not_logged" />
      <span>
        {range} · {n} {n === 1 ? "day" : "days"}
        {ongoing ? " so far" : ""}
      </span>
    </div>
  );
}

/** A milestone-only date doesn't need an empty day card under it. */
function hasDayContent(d: TimelineDay): boolean {
  return (
    d.done > 0 ||
    d.media.length > 0 ||
    d.journal !== "" ||
    d.pain !== null ||
    d.swelling !== null ||
    d.stiffness !== null ||
    d.mood !== null ||
    d.flexion_deg !== null ||
    d.extension_deg !== null
  );
}

function DayCard({ day, index, href, surgeryDate }: { day: TimelineDay; index: number; href: string; surgeryDate: string }) {
  const photos = day.media.filter((m) => m.kind === "photo");
  const videos = day.media.filter((m) => m.kind === "video");
  const chips = [
    day.total > 0 && `✓ ${day.done}/${day.total} exercises · ${percent(day.done, day.total)}%`,
    day.pain !== null && `Pain ${day.pain}/10`,
    day.swelling && day.swelling !== "none" && `Swelling: ${day.swelling}`,
    day.flexion_deg !== null && `Bend ${day.flexion_deg}°`,
    day.extension_deg !== null && `Extension ${day.extension_deg}°`,
    videos.length > 0 && `🎬 ${videos.length} video${videos.length > 1 ? "s" : ""}`,
  ].filter(Boolean) as string[];

  return (
    <Link
      href={href}
      className={`relative block rounded-xl border bg-card p-4 pt-5 shadow-[0_2px_10px_rgba(60,40,20,0.07)] transition-transform active:scale-[0.99] ${
        index % 2 ? "rotate-[0.5deg]" : "-rotate-[0.5deg]"
      } ${day.red_flag ? "border-clay/60 ring-2 ring-clay/20" : "border-line"}`}
    >
      {/* washi tape */}
      <span
        aria-hidden
        className={`absolute -top-2 left-1/2 h-5 w-20 -translate-x-1/2 ${index % 2 ? "rotate-2" : "-rotate-2"} ${TAPE[index % 3]}`}
      />
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-semibold">{formatDate(day.date)}</div>
          <div className="text-xs text-muted">{postOp(surgeryDate, day.date).label}</div>
        </div>
        <div className="flex items-center gap-2">
          <StatusChip status={dayStatus({ done: day.done, total: day.total, logged: true })} flag={day.red_flag} />
          {!!day.comments && <span className="text-xs text-sky">💬 {day.comments}</span>}
          {day.mood && <span className="text-3xl leading-none">{day.mood}</span>}
        </div>
      </div>

      {chips.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {chips.map((c) => (
            <span key={c} className="rounded-full bg-paper px-2.5 py-1 text-xs">
              {c}
            </span>
          ))}
        </div>
      )}

      {day.journal && <p className="mt-3 line-clamp-4 font-serif text-[15px] leading-relaxed italic">“{day.journal}”</p>}

      {photos.length > 0 && (
        <div className="mt-3 flex gap-2">
          {photos.slice(0, 3).map((m, i) => (
            <div
              key={m.id}
              className={`w-1/3 bg-white p-1 pb-1.5 shadow-[0_2px_6px_rgba(60,40,20,0.15)] ${i % 2 ? "rotate-2" : "-rotate-2"}`}
            >
              <img src={m.url!} alt={m.caption || "Recovery photo"} loading="lazy" className="aspect-square w-full object-cover" />
            </div>
          ))}
          {photos.length > 3 && <span className="self-center text-xs text-muted">+{photos.length - 3}</span>}
        </div>
      )}
    </Link>
  );
}
