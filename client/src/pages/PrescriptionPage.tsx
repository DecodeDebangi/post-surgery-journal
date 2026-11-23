import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { WEEKDAY_SHORT } from "../../../shared/postop.ts";
import {
  EXERCISE_SESSIONS,
  MEDICINE_TIMES,
  SESSION_LABELS,
  type Exercise,
  type ExerciseSession,
  type Medicine,
  type MedicineTime,
} from "../../../shared/types.ts";
import { api } from "../api.ts";
import { Comments } from "../components/Comments.tsx";
import { privateNote } from "../text.ts";
import { Link } from "../router.tsx";
import { useSession } from "../session.tsx";

const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Mon first

function daysLabel(days: number[]): string {
  const set = new Set(days);
  if (set.size === 7) return "Every day";
  if (set.size === 6 && !set.has(0)) return "Mon–Sat";
  if (set.size === 5 && !set.has(0) && !set.has(6)) return "Mon–Fri";
  return WEEK_ORDER.filter((d) => set.has(d)).map((d) => WEEKDAY_SHORT[d]).join(", ");
}

function planLabel(e: Pick<Exercise, "sets" | "target">): string {
  if (e.sets && e.target) return `${e.sets} × ${e.target}`;
  return e.sets ? `${e.sets} sets` : e.target;
}

interface Data {
  exercises: Exercise[];
  medicines: Medicine[];
}

type Editing =
  | { type: "exercise"; item: Partial<Exercise> }
  | { type: "medicine"; item: Partial<Medicine> }
  | null;

export function PrescriptionPage() {
  const { session } = useSession();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing>(null);

  const load = useCallback(async () => {
    try {
      setData(await api.get<Data>("/prescription"));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    if (session?.mode !== "public") load();
  }, [load, session?.mode]);

  if (session?.mode === "public") {
    return (
      <div className="rounded-2xl border border-line bg-card p-6 text-center">
        <p className="text-muted">The prescription is private.</p>
        <Link href="/unlock" className="mt-3 inline-block rounded-full bg-ink px-4 py-2 text-sm text-white">
          Log in
        </Link>
      </div>
    );
  }

  async function saved() {
    setEditing(null);
    await load();
  }

  const who = session?.mode === "doctor" ? "the doctor" : "you";

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-baseline justify-between gap-2">
          <h1 className="text-lg font-semibold">Prescription</h1>
          <Link href="/prescription/history" className="text-sm text-sky">
            History →
          </Link>
        </div>
        <p className="text-sm text-muted">
          The daily checklist is built from this plan. Every change is recorded as made by {who}. Switch an item off
          instead of deleting it, so past days keep their history.
        </p>
      </div>

      {error && <p className="rounded-2xl bg-clay-soft p-3 text-sm text-clay">{error}</p>}
      {!data && !error && <p className="py-10 text-center text-muted">Loading…</p>}

      {data && (
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setEditing({ type: "exercise", item: { session: "morning", days: [1, 2, 3, 4, 5, 6] } })}
            className="rounded-xl bg-ink px-3 py-2.5 text-sm font-medium text-white"
          >
            + Add exercise
          </button>
          <button
            onClick={() => setEditing({ type: "medicine", item: { times: ["morning"] } })}
            className="rounded-xl bg-ink px-3 py-2.5 text-sm font-medium text-white"
          >
            + Add medicine
          </button>
        </div>
      )}

      {data && (
        <Section
          title="Medicines"
          subtitle={`Private. ${privateNote(session?.mode ?? "me")}`}
          onAdd={() => setEditing({ type: "medicine", item: { times: ["morning"] } })}
        >
          {data.medicines.map((m) =>
            editing?.type === "medicine" && editing.item.id === m.id ? (
              <MedicineForm key={m.id} initial={editing.item} onCancel={() => setEditing(null)} onSaved={saved} />
            ) : (
              <Row
                key={m.id}
                inactive={!m.active}
                title={m.name}
                detail={[m.dose, m.times.join(" + "), m.notes].filter(Boolean).join(" · ")}
                extra={m.end_date ? `until ${m.end_date}` : m.start_date ? `from ${m.start_date}` : undefined}
                onEdit={() => setEditing({ type: "medicine", item: m })}
              />
            ),
          )}
          {editing?.type === "medicine" && !editing.item.id && (
            <MedicineForm initial={editing.item} onCancel={() => setEditing(null)} onSaved={saved} />
          )}
          {data.medicines.length === 0 && !(editing?.type === "medicine") && (
            <p className="py-2 text-sm text-muted">No medicines prescribed yet.</p>
          )}
        </Section>
      )}

      {data &&
        EXERCISE_SESSIONS.map((s) => {
          const items = data.exercises.filter((e) => e.session === s);
          const sectionDays = items.length ? daysLabel([...new Set(items.filter((e) => e.active).flatMap((e) => e.days))]) : undefined;
          const adding = editing?.type === "exercise" && !editing.item.id && editing.item.session === s;
          return (
            <Section
              key={s}
              title={SESSION_LABELS[s]}
              subtitle={sectionDays}
              onAdd={() => setEditing({ type: "exercise", item: { session: s, days: items[0]?.days ?? [1, 2, 3, 4, 5, 6] } })}
            >
              {items.map((e) =>
                editing?.type === "exercise" && editing.item.id === e.id ? (
                  <ExerciseForm key={e.id} initial={editing.item} onCancel={() => setEditing(null)} onSaved={saved} />
                ) : (
                  <Row
                    key={e.id}
                    inactive={!e.active}
                    title={e.name}
                    detail={[planLabel(e), e.notes].filter(Boolean).join(" · ")}
                    extra={daysLabel(e.days) === sectionDays ? undefined : daysLabel(e.days)}
                    onEdit={() => setEditing({ type: "exercise", item: e })}
                  />
                ),
              )}
              {adding && <ExerciseForm initial={editing.item} onCancel={() => setEditing(null)} onSaved={saved} />}
              {items.length === 0 && !adding && <p className="py-2 text-sm text-muted">Nothing here yet.</p>}
            </Section>
          );
        })}

      {data && (
        <Comments
          type="plan"
          targetKey="current"
          title="Notes on the plan"
          intro={
            session?.mode === "doctor"
              ? "Explain a change, or ask the patient something about the plan. Only you and the patient see these."
              : "Questions or notes about the plan for your doctor. Only you and your doctor see these."
          }
          aboutOptions={[
            ...new Set([
              ...data.exercises.filter((e) => e.active).map((e) => e.name),
              ...data.medicines.map((m) => `Medicine: ${m.name}`),
            ]),
          ]}
        />
      )}
    </div>
  );
}

function Section({
  title,
  subtitle,
  onAdd,
  children,
}: {
  title: string;
  subtitle?: string;
  onAdd: () => void;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-line bg-card p-4">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold">{title}</h2>
          {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
        </div>
        <button onClick={onAdd} className="shrink-0 rounded-full bg-paper px-3 py-1 text-sm">
          + Add
        </button>
      </div>
      <div className="divide-y divide-line">{children}</div>
    </section>
  );
}

function Row({
  title,
  detail,
  extra,
  inactive,
  onEdit,
}: {
  title: string;
  detail: string;
  extra?: string;
  inactive: boolean;
  onEdit: () => void;
}) {
  return (
    <button onClick={onEdit} className={`flex w-full items-start gap-3 py-2.5 text-left ${inactive ? "opacity-50" : ""}`}>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px]">
          {title}
          {inactive && <span className="ml-2 rounded bg-line px-1.5 py-0.5 text-[10px] uppercase">Off</span>}
        </span>
        {detail && <span className="block text-xs text-muted">{detail}</span>}
      </span>
      {extra && <span className="shrink-0 text-xs text-muted">{extra}</span>}
      <span className="shrink-0 text-xs text-sky">Edit</span>
    </button>
  );
}

// ---- Forms -----------------------------------------------------------------

const input =
  "w-full rounded-lg border border-line bg-white px-3 py-2 text-[15px] outline-none focus:border-sage";

function Label({ text, children }: { text: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted">{text}</span>
      {children}
    </label>
  );
}

function Toggle<T extends string | number>({
  options,
  value,
  label,
  onChange,
}: {
  options: readonly T[];
  value: T[];
  label: (o: T) => string;
  onChange: (v: T[]) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = value.includes(o);
        return (
          <button
            type="button"
            key={o}
            onClick={() => onChange(on ? value.filter((v) => v !== o) : [...value, o])}
            className={`rounded-full px-3 py-1.5 text-sm ${on ? "bg-ink text-white" : "bg-paper"}`}
          >
            {label(o)}
          </button>
        );
      })}
    </div>
  );
}

function FormShell({
  onSubmit,
  onCancel,
  error,
  busy,
  children,
}: {
  onSubmit: (e: FormEvent) => void;
  onCancel: () => void;
  error: string | null;
  busy: boolean;
  children: ReactNode;
}) {
  return (
    <form onSubmit={onSubmit} className="my-2 space-y-3 rounded-xl bg-paper p-3">
      {children}
      {error && <p className="text-sm text-clay">{error}</p>}
      <div className="flex gap-2">
        <button disabled={busy} className="flex-1 rounded-lg bg-ink py-2 text-sm text-white disabled:opacity-50">
          {busy ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg border border-line px-4 py-2 text-sm">
          Cancel
        </button>
      </div>
    </form>
  );
}

function ActiveSwitch({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} className="size-4 accent-sage" />
      Active (unticked = switched off, kept in history)
    </label>
  );
}

function useSubmit(save: () => Promise<unknown>, onSaved: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await save();
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, onSubmit };
}

function ExerciseForm({
  initial,
  onCancel,
  onSaved,
}: {
  initial: Partial<Exercise>;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [f, setF] = useState({
    name: initial.name ?? "",
    session: initial.session ?? ("morning" as ExerciseSession),
    days: initial.days ?? [],
    sets: initial.sets ?? "",
    target: initial.target ?? "",
    notes: initial.notes ?? "",
    active: initial.active ?? true,
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  const { busy, error, onSubmit } = useSubmit(async () => {
    if (!f.name.trim()) throw new Error("Give the exercise a name.");
    if (f.days.length === 0) throw new Error("Pick at least one day.");
    if (initial.id) {
      // Send only what changed, so the history shows exactly what was edited.
      const changed = Object.fromEntries(
        Object.entries(f).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(initial[k as keyof Exercise])),
      );
      if (Object.keys(changed).length === 0) return;
      await api.patch(`/prescription/exercises/${initial.id}`, changed);
    } else {
      await api.post("/prescription/exercises", f);
    }
  }, onSaved);

  return (
    <FormShell onSubmit={onSubmit} onCancel={onCancel} error={error} busy={busy}>
      <Label text="Name">
        <input className={input} value={f.name} onChange={(e) => set("name", e.target.value)} maxLength={100} autoFocus />
      </Label>
      <Label text="Session">
        <select className={input} value={f.session} onChange={(e) => set("session", e.target.value as ExerciseSession)}>
          {EXERCISE_SESSIONS.map((s) => (
            <option key={s} value={s}>
              {SESSION_LABELS[s]}
            </option>
          ))}
        </select>
      </Label>
      <div>
        <span className="mb-1 block text-xs font-medium text-muted">Days</span>
        <Toggle options={WEEK_ORDER} value={f.days} label={(d) => WEEKDAY_SHORT[d]} onChange={(v) => set("days", v)} />
      </div>
      <div className="grid grid-cols-[5rem_1fr] gap-2">
        <Label text="Sets">
          <input className={input} value={f.sets} onChange={(e) => set("sets", e.target.value)} placeholder="3" maxLength={20} />
        </Label>
        <Label text="Reps / time">
          <input
            className={input}
            value={f.target}
            onChange={(e) => set("target", e.target.value)}
            placeholder="8–12, 30s, 10/side"
            maxLength={60}
          />
        </Label>
      </div>
      <Label text="Notes">
        <input className={input} value={f.notes} onChange={(e) => set("notes", e.target.value)} maxLength={500} />
      </Label>
      {initial.id && <ActiveSwitch value={f.active} onChange={(v) => set("active", v)} />}
    </FormShell>
  );
}

function MedicineForm({
  initial,
  onCancel,
  onSaved,
}: {
  initial: Partial<Medicine>;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [f, setF] = useState({
    name: initial.name ?? "",
    dose: initial.dose ?? "",
    times: initial.times ?? (["morning"] as MedicineTime[]),
    start_date: initial.start_date ?? null,
    end_date: initial.end_date ?? null,
    notes: initial.notes ?? "",
    active: initial.active ?? true,
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  const { busy, error, onSubmit } = useSubmit(async () => {
    if (!f.name.trim()) throw new Error("Give the medicine a name.");
    if (f.times.length === 0) throw new Error("Pick at least one time of day.");
    if (f.start_date && f.end_date && f.end_date < f.start_date) throw new Error("The end date is before the start date.");
    if (initial.id) {
      const changed = Object.fromEntries(
        Object.entries(f).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(initial[k as keyof Medicine])),
      );
      if (Object.keys(changed).length === 0) return;
      await api.patch(`/prescription/medicines/${initial.id}`, changed);
    } else {
      await api.post("/prescription/medicines", f);
    }
  }, onSaved);

  return (
    <FormShell onSubmit={onSubmit} onCancel={onCancel} error={error} busy={busy}>
      <Label text="Medicine">
        <input className={input} value={f.name} onChange={(e) => set("name", e.target.value)} maxLength={100} autoFocus />
      </Label>
      <Label text="Dose">
        <input className={input} value={f.dose} onChange={(e) => set("dose", e.target.value)} placeholder="1 tablet, 500 mg" maxLength={60} />
      </Label>
      <div>
        <span className="mb-1 block text-xs font-medium text-muted">When</span>
        <Toggle
          options={MEDICINE_TIMES}
          value={f.times}
          label={(t) => t[0].toUpperCase() + t.slice(1)}
          onChange={(v) => set("times", v)}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Label text="From (optional)">
          <input type="date" className={input} value={f.start_date ?? ""} onChange={(e) => set("start_date", e.target.value || null)} />
        </Label>
        <Label text="Until (optional)">
          <input type="date" className={input} value={f.end_date ?? ""} onChange={(e) => set("end_date", e.target.value || null)} />
        </Label>
      </div>
      <Label text="Notes">
        <input className={input} value={f.notes} onChange={(e) => set("notes", e.target.value)} placeholder="After food" maxLength={500} />
      </Label>
      {initial.id && <ActiveSwitch value={f.active} onChange={(v) => set("active", v)} />}
    </FormShell>
  );
}
