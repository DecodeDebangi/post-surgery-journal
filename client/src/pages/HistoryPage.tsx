import { useEffect, useState } from "react";
import { WEEKDAY_SHORT } from "../../../shared/postop.ts";
import { SESSION_LABELS, type ExerciseSession, type PrescriptionChange } from "../../../shared/types.ts";
import { api } from "../api.ts";
import { authorLabel } from "../components/Comments.tsx";
import { Link } from "../router.tsx";
import { useSession } from "../session.tsx";

const LABELS: Record<string, string> = {
  name: "Name",
  session: "Session",
  days: "Days",
  sets: "Sets",
  target: "Reps / time",
  notes: "Notes",
  dose: "Dose",
  times: "When",
  start_date: "From",
  end_date: "Until",
  active: "Active",
};
const IGNORED = new Set(["id", "created_at", "updated_at", "sort_order"]);
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
const SEEN_KEY = "psj-history-seen";

function show(field: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (field === "days" && Array.isArray(value)) {
    const set = new Set(value as number[]);
    if (set.size === 7) return "Every day";
    return WEEK_ORDER.filter((d) => set.has(d)).map((d) => WEEKDAY_SHORT[d]).join(", ");
  }
  if (field === "session") return SESSION_LABELS[value as ExerciseSession] ?? String(value);
  if (Array.isArray(value)) return value.join(" + ");
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function diff(c: PrescriptionChange): { field: string; from: string; to: string }[] {
  if (!c.before) return [];
  return Object.keys(LABELS)
    .filter((k) => !IGNORED.has(k) && JSON.stringify(c.before![k]) !== JSON.stringify(c.after[k]))
    .filter((k) => k !== "active")
    .map((k) => ({ field: LABELS[k], from: show(k, c.before![k]), to: show(k, c.after[k]) }));
}

function verb(c: PrescriptionChange): string {
  if (c.action === "create") return "added";
  if (c.before?.active === true && c.after.active === false) return "switched off";
  if (c.before?.active === false && c.after.active === true) return "switched back on";
  return "changed";
}

function readSeen(): string | null {
  try {
    return localStorage.getItem(SEEN_KEY);
  } catch {
    return null;
  }
}

/** Every change to the plan: who, when, and exactly what. */
export function HistoryPage() {
  const { session } = useSession();
  const mode = session!.mode;
  const [changes, setChanges] = useState<PrescriptionChange[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [onlyDoctor, setOnlyDoctor] = useState(mode === "me");
  // Doctor changes since this browser last opened the page get a "New" tag.
  const [seen] = useState(readSeen);

  useEffect(() => {
    api
      .get<{ changes: PrescriptionChange[] }>("/prescription/history")
      .then((r) => {
        setChanges(r.changes);
        try {
          localStorage.setItem(SEEN_KEY, new Date().toISOString());
        } catch {
          // not important
        }
      })
      .catch((e) => setError(e.message));
  }, []);

  if (mode === "public") return null;

  const list = (changes ?? []).filter((c) => !onlyDoctor || c.changed_by === "doctor");
  const groups: [string, PrescriptionChange[]][] = [];
  for (const c of list) {
    const day = new Date(c.created_at).toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
    const g = groups.find((x) => x[0] === day);
    if (g) g[1].push(c);
    else groups.push([day, [c]]);
  }

  return (
    <div className="space-y-4">
      <div>
        <Link href="/prescription" className="text-sm text-sky">
          ‹ Back to the plan
        </Link>
        <h1 className="mt-1 text-lg font-semibold">Plan history</h1>
        <p className="text-sm text-muted">
          Every exercise and medicine change, newest first, with who made it. The starting plan isn't listed.
        </p>
      </div>

      <div className="flex gap-1 rounded-full bg-line/60 p-1 text-sm">
        {[
          [true, "Doctor's changes"],
          [false, "All changes"],
        ].map(([value, label]) => (
          <button
            key={String(value)}
            onClick={() => setOnlyDoctor(value as boolean)}
            className={`flex-1 rounded-full py-1.5 ${onlyDoctor === value ? "bg-white font-medium shadow-sm" : "text-muted"}`}
          >
            {label as string}
          </button>
        ))}
      </div>

      {error && <p className="rounded-2xl bg-clay-soft p-3 text-sm text-clay">{error}</p>}
      {changes === null && !error && <p className="py-10 text-center text-muted">Loading…</p>}
      {changes && list.length === 0 && (
        <p className="rounded-2xl border border-dashed border-line p-6 text-center text-muted">
          {onlyDoctor ? "The doctor hasn't changed the plan yet." : "No changes since the starting plan."}
        </p>
      )}

      {groups.map(([day, items]) => (
        <section key={day}>
          <h2 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">{day}</h2>
          <ul className="space-y-2">
            {items.map((c) => {
              const fromDoctor = c.changed_by === "doctor";
              const isNew = fromDoctor && mode === "me" && seen !== null && c.created_at > seen;
              const fields = diff(c);
              return (
                <li
                  key={c.id}
                  className={`rounded-2xl border p-3 ${fromDoctor ? "border-sky/30 bg-sky-soft/60" : "border-line bg-card"}`}
                >
                  <div className="flex flex-wrap items-center gap-x-2 text-xs">
                    <span className={`font-semibold ${fromDoctor ? "text-sky" : "text-ink"}`}>
                      {authorLabel(c.changed_by, mode)}
                    </span>
                    <span className="text-muted">
                      {verb(c)} {c.item_type === "medicine" ? "a medicine" : "an exercise"} ·{" "}
                      {new Date(c.created_at).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit" })}
                    </span>
                    {isNew && <span className="rounded-full bg-clay px-2 py-0.5 text-[10px] font-semibold text-white">New</span>}
                  </div>
                  <div className="mt-1 text-[15px] font-medium">{String(c.after.name)}</div>
                  {c.action === "create" && (
                    <p className="text-sm text-muted">
                      {c.item_type === "exercise"
                        ? [show("session", c.after.session), show("days", c.after.days), [c.after.sets, c.after.target].filter(Boolean).join(" × ")]
                            .filter((x) => x && x !== "—")
                            .join(" · ")
                        : [c.after.dose, show("times", c.after.times)].filter((x) => x && x !== "—").join(" · ")}
                    </p>
                  )}
                  {fields.length > 0 && (
                    <ul className="mt-1 space-y-0.5 text-sm">
                      {fields.map((f) => (
                        <li key={f.field}>
                          <span className="text-muted">{f.field}:</span> <span className="line-through decoration-muted/60">{f.from}</span>{" "}
                          → <span className="font-medium">{f.to}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
