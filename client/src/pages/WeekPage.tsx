import { useEffect, useState, type ReactNode } from "react";
import { formatDate } from "../../../shared/postop.ts";
import type { Media, Milestone } from "../../../shared/types.ts";
import { api } from "../api.ts";
import { Comments } from "../components/Comments.tsx";
import { Link } from "../router.tsx";
import { useSession } from "../session.tsx";

interface Summary {
  week: number;
  start: string;
  end: string;
  complete: boolean;
  completion: { done: number; total: number; pct: number | null };
  daysLogged: number;
  daysInWeek: number;
  avgPain: number | null;
  avgStiffness: number | null;
  worstSwelling: string | null;
  flexion: { value: number; date: string; previous: number | null } | null;
  extension: { value: number; date: string; previous: number | null } | null;
  redFlags: { date: string; flags: string[] }[];
  notes: { date: string; journal: string }[];
  media: Media[];
  milestones: Milestone[];
}

const short = (d: string) =>
  new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

function delta(now: number, before: number | null): string {
  if (before === null || now === before) return before === null ? "" : "no change";
  return `${now > before ? "+" : ""}${now - before}° vs before`;
}

/** The one-screen weekly recap for the doctor. */
export function WeekPage({ week }: { week: number }) {
  const { session } = useSession();
  const { mode, today, postOp: now } = session!;
  const [s, setS] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<Summary>(`/stats/weeks/${week}`).then(setS).catch((e) => setError(e.message));
  }, [week]);

  if (error) return <p className="rounded-2xl bg-clay-soft p-3 text-sm text-clay">{error}</p>;
  if (!s) return <p className="py-10 text-center text-muted">Loading…</p>;

  const dayHref = (d: string) => (d === today && mode === "me" ? "/" : `/day/${d}`);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        {week > 1 ? (
          <Link href={`/week/${week - 1}`} className="px-3 py-2 text-lg" aria-label="Previous week">‹</Link>
        ) : <span className="px-3" />}
        <div className="text-center">
          <h1 className="font-semibold">Week {week} summary</h1>
          <div className="text-xs text-muted">
            {short(s.start)} – {short(s.end)}
            {!s.complete && " · in progress"}
          </div>
        </div>
        {week < now.week ? (
          <Link href={`/week/${week + 1}`} className="px-3 py-2 text-lg" aria-label="Next week">›</Link>
        ) : <span className="px-3" />}
      </div>

      {s.redFlags.length > 0 && (
        <div className="rounded-2xl border border-clay/40 bg-clay-soft p-3 text-sm text-clay">
          <div className="font-semibold">Red flags this week</div>
          <ul className="mt-1 space-y-0.5">
            {s.redFlags.map((r) => (
              <li key={r.date}>
                <Link href={dayHref(r.date)} className="underline">{short(r.date)}</Link>: {r.flags.join(", ")}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Stat label="Exercises done" value={s.completion.pct === null ? "—" : `${s.completion.pct}%`} note={`${s.completion.done} of ${s.completion.total} · ${s.daysLogged}/${s.daysInWeek} days logged`} />
        <Stat label="Average pain" value={s.avgPain === null ? "—" : `${s.avgPain}/10`} note={s.avgStiffness === null ? "stiffness not logged" : `stiffness ${s.avgStiffness}/10`} />
        <Stat label="Latest bend" value={s.flexion ? `${s.flexion.value}°` : "—"} note={s.flexion ? `${short(s.flexion.date)} ${delta(s.flexion.value, s.flexion.previous) ? "· " + delta(s.flexion.value, s.flexion.previous) : ""}` : "not measured this week"} />
        <Stat label="Latest extension" value={s.extension ? `${s.extension.value}°` : "—"} note={s.extension ? `${short(s.extension.date)} ${delta(s.extension.value, s.extension.previous) ? "· " + delta(s.extension.value, s.extension.previous) : ""}` : "not measured this week"} />
      </div>
      <p className="-mt-2 text-xs text-muted">
        Worst swelling: <span className="capitalize">{s.worstSwelling ?? "not logged"}</span>
        {s.redFlags.length === 0 && " · No red flags"}
      </p>

      {s.milestones.length > 0 && (
        <Section title="Milestones">
          {s.milestones.map((m) => (
            <p key={m.id} className="text-sm">{m.emoji} <strong>{m.title}</strong> · {short(m.date)}</p>
          ))}
        </Section>
      )}

      {s.media.length > 0 && (
        <Section title={`New photos & videos (${s.media.length})`}>
          <div className="grid grid-cols-4 gap-2">
            {s.media.map((m) => (
              <Link key={m.id} href={dayHref(m.date)} className="relative block aspect-square overflow-hidden rounded-lg bg-paper">
                {m.kind === "photo" ? (
                  <img src={m.url!} alt={m.caption || "Photo"} loading="lazy" className="size-full object-cover" />
                ) : (
                  <span className="grid size-full place-items-center text-2xl" title={m.caption}>🎬</span>
                )}
                {m.is_private && <span className="absolute right-1 bottom-1 text-xs">🔒</span>}
              </Link>
            ))}
          </div>
        </Section>
      )}

      <Section title="Journal notes">
        {s.notes.length === 0 ? (
          <p className="text-sm text-muted">No journal entries this week.</p>
        ) : (
          <ul className="space-y-3">
            {s.notes.map((n) => (
              <li key={n.date}>
                <Link href={dayHref(n.date)} className="text-xs font-semibold text-muted">{short(n.date)}</Link>
                <p className="line-clamp-4 text-sm whitespace-pre-wrap">{n.journal}</p>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Comments
        type="week"
        targetKey={String(week)}
        title={`Comments on week ${week}`}
        aboutOptions={["Exercises", "Pain", "Swelling", "Knee angles", "Red flags", "Photos & videos"]}
        intro={mode === "doctor" ? "Feedback on the week as a whole. Anyone with the link can read these." : undefined}
      />
      <p className="text-center text-xs text-muted">Summary for {formatDate(s.start)} to {formatDate(s.end)}.</p>
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-2xl border border-line bg-card p-3">
      <div className="text-xs text-muted">{label}</div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-[11px] text-muted">{note}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-card p-4">
      <h2 className="mb-2 font-semibold">{title}</h2>
      {children}
    </section>
  );
}
