import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { addDays, formatDate, postOp } from "../../../shared/postop.ts";
import {
  MOODS,
  RED_FLAGS,
  SESSION_LABELS,
  SWELLING,
  type DayItem,
  type DayLog,
  type ExerciseSession,
  type RedFlagKey,
} from "../../../shared/types.ts";
import { api } from "../api.ts";
import { Comments } from "../components/Comments.tsx";
import { MediaSection } from "../components/MediaSection.tsx";
import { MilestoneCard, MilestoneForm } from "../components/Milestones.tsx";
import { privateNote } from "../text.ts";
import { Link } from "../router.tsx";
import { useSession } from "../session.tsx";

type SaveState = "idle" | "saving" | "saved" | "error";
type DayPatch = Partial<Omit<DayLog, "date" | "exists" | "items">>;

const TIME_LABELS: Record<string, string> = { morning: "Morning", afternoon: "Afternoon", night: "Night" };

export function DayPage({ date }: { date: string }) {
  const { session } = useSession();
  const { mode, today, surgeryDate } = session!;
  const writable = mode === "me" && date >= surgeryDate && date <= today;

  const [day, setDay] = useState<DayLog | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [milestoneForm, setMilestoneForm] = useState<"new" | number | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      // For me, opening a day builds its checklist from the prescription.
      setDay(writable ? await api.post<DayLog>(`/days/${date}/ensure`) : await api.get<DayLog>(`/days/${date}`));
    } catch (e) {
      setLoadError((e as Error).message);
    }
  }, [date, writable]);

  useEffect(() => {
    load();
  }, [load]);

  // One save queue for the day's fields: edits are merged and sent in order.
  const pending = useRef<DayPatch>({});
  const timer = useRef<number | undefined>(undefined);

  const flush = useCallback(async () => {
    window.clearTimeout(timer.current);
    const patch = pending.current;
    if (Object.keys(patch).length === 0) return;
    pending.current = {};
    setSaveState("saving");
    try {
      await api.patch(`/days/${date}`, patch);
      setSaveState("saved");
      setSaveError(null);
    } catch (e) {
      setSaveState("error");
      setSaveError((e as Error).message);
    }
  }, [date]);

  const queue = useCallback(
    (patch: DayPatch, delay = 0) => {
      setDay((d) => (d ? { ...d, ...patch } : d));
      pending.current = { ...pending.current, ...patch };
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(flush, delay);
    },
    [flush],
  );

  // Save anything still waiting when leaving the page.
  useEffect(() => () => void flush(), [flush]);

  async function updateItem(item: DayItem, patch: Partial<Pick<DayItem, "done" | "actual">>) {
    setDay((d) => d && { ...d, items: d.items.map((i) => (i.id === item.id ? { ...i, ...patch } : i)) });
    setSaveState("saving");
    try {
      await api.patch(`/days/${date}/items/${item.id}`, patch);
      setSaveState("saved");
    } catch (e) {
      setSaveState("error");
      setSaveError((e as Error).message);
      load();
    }
  }

  async function resetDay() {
    if (!confirm("Clear this day's log, ticks, photos and videos? Milestones stay. This can't be undone.")) return;
    await api.del(`/days/${date}`);
    load();
  }

  const op = postOp(surgeryDate, date);
  const prev = addDays(date, -1);
  const next = addDays(date, 1);
  const hasFlags = day ? (Object.keys(RED_FLAGS) as RedFlagKey[]).some((k) => day[k]) : false;

  return (
    <div className="space-y-4">
      {/* Date navigation */}
      <div className="flex items-center justify-between">
        {prev >= surgeryDate ? (
          <Link href={`/day/${prev}`} className="rounded-full px-3 py-2 text-lg" aria-label="Previous day">
            ‹
          </Link>
        ) : (
          <span className="px-3" />
        )}
        <div className="text-center">
          <div className="font-semibold lg:text-2xl">{date === today ? "Today" : formatDate(date)}</div>
          <div className="text-xs text-muted">
            {date === today ? `${formatDate(date)} · ` : ""}
            {op.label}
          </div>
        </div>
        {date < today ? (
          <Link href={next === today && mode === "me" ? "/" : `/day/${next}`} className="rounded-full px-3 py-2 text-lg" aria-label="Next day">
            ›
          </Link>
        ) : (
          <span className="px-3" />
        )}
      </div>

      {mode === "doctor" && (
        <div className="rounded-2xl bg-sky-soft p-3 text-sm text-sky">
          <p>
            Doctor mode: you see everything, including medicines and red flags. The patient's entries are read-only;
            use comments for notes and corrections.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <a
              href="#comments"
              onClick={(e) => {
                e.preventDefault();
                document.getElementById("comments")?.scrollIntoView({ behavior: "smooth" });
              }}
              className="rounded-xl bg-sky px-3 py-2.5 text-center font-medium text-white"
            >
              💬 Comment on this day
            </a>
            <Link href="/prescription" className="rounded-xl border border-sky/40 bg-white px-3 py-2.5 text-center font-medium">
              📋 Change exercises or medicines
            </Link>
          </div>
        </div>
      )}

      {loadError && (
        <div className="rounded-2xl bg-clay-soft p-4 text-sm text-clay">
          {loadError}{" "}
          <button className="underline" onClick={load}>
            Retry
          </button>
        </div>
      )}
      {!day && !loadError && <p className="py-10 text-center text-muted">Loading…</p>}

      {day?.milestones.map((m) =>
        milestoneForm === m.id ? (
          <MilestoneForm
            key={m.id}
            initial={m}
            fixedDate={date}
            today={today}
            surgeryDate={surgeryDate}
            onDone={() => {
              setMilestoneForm(null);
              load();
            }}
            onCancel={() => setMilestoneForm(null)}
          />
        ) : (
          <MilestoneCard
            key={m.id}
            milestone={m}
            surgeryDate={surgeryDate}
            onEdit={writable ? () => setMilestoneForm(m.id) : undefined}
          />
        ),
      )}

      {day && !day.exists && !writable && (
        <p className="rounded-2xl border border-dashed border-line p-6 text-center text-muted">
          Nothing logged for this day.
        </p>
      )}

      {day && (day.exists || writable) && (
        <>
          {hasFlags && (
            <div className="rounded-2xl border border-clay/40 bg-clay-soft p-3 text-sm text-clay">
              <strong>Red flag:</strong>{" "}
              {(Object.keys(RED_FLAGS) as RedFlagKey[])
                .filter((k) => day[k])
                .map((k) => RED_FLAGS[k])
                .join(", ")}
              {mode === "me" && " — this day is highlighted for your doctor."}
            </div>
          )}

          {/* Phone: one column. Desktop: checklist on the left, everything else on the right. */}
          <div className="space-y-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6 lg:space-y-0">
          <div className="min-w-0 space-y-4">
            <Checklist day={day} mode={mode} writable={writable} onItem={updateItem} />
          </div>
          <div className="min-w-0 space-y-4">

          <Card title="How the knee feels">
            <Field label="Pain" hint="0 = none, 10 = worst">
              <NumberChips value={day.pain} disabled={!writable} onPick={(v) => queue({ pain: v })} />
            </Field>
            <Field label="Swelling">
              <Chips
                options={SWELLING}
                value={day.swelling}
                disabled={!writable}
                onPick={(v) => queue({ swelling: v as DayLog["swelling"] })}
              />
            </Field>
            <Field label="Stiffness" hint="0 = none, 10 = can't bend">
              <NumberChips value={day.stiffness} disabled={!writable} onPick={(v) => queue({ stiffness: v })} />
            </Field>
            <Field label="Knee angles" hint="optional, in degrees">
              <div className="grid grid-cols-2 gap-3">
                <AngleInput
                  label="Flexion (bend)"
                  value={day.flexion_deg}
                  min={0}
                  max={170}
                  disabled={!writable}
                  onCommit={(v) => queue({ flexion_deg: v })}
                />
                <AngleInput
                  label="Extension"
                  value={day.extension_deg}
                  min={-30}
                  max={30}
                  disabled={!writable}
                  onCommit={(v) => queue({ extension_deg: v })}
                />
              </div>
            </Field>
            <Field label="Mood">
              <Chips options={MOODS} value={day.mood} big disabled={!writable} onPick={(v) => queue({ mood: v })} />
            </Field>
          </Card>

          {(mode !== "public" || hasFlags) && (
            <Card title="Red flags" subtitle={mode === "me" ? "Your doctor and anyone with the link can see these." : undefined}>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(RED_FLAGS) as RedFlagKey[]).map((k) => (
                  <button
                    key={k}
                    disabled={!writable}
                    onClick={() => queue({ [k]: !day[k] } as DayPatch)}
                    className={`rounded-full border px-3 py-2 text-sm ${
                      day[k] ? "border-clay bg-clay text-white" : "border-line bg-white text-muted"
                    } disabled:cursor-default`}
                  >
                    {RED_FLAGS[k]}
                  </button>
                ))}
              </div>
            </Card>
          )}

          <Card title="Journal">
            {writable ? (
              <textarea
                value={day.journal}
                onChange={(e) => queue({ journal: e.target.value }, 900)}
                onBlur={() => flush()}
                rows={5}
                placeholder="How did today go? Anything new you managed?"
                className="w-full resize-y rounded-xl border border-line bg-paper/50 p-3 text-[15px] outline-none focus:border-sage"
              />
            ) : day.journal ? (
              <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{day.journal}</p>
            ) : (
              <p className="text-sm text-muted">No journal entry.</p>
            )}
          </Card>

          <MediaSection
            date={date}
            media={day.media}
            writable={writable}
            onChange={(media) => setDay((d) => d && { ...d, media })}
          />

          {writable &&
            (milestoneForm === "new" ? (
              <MilestoneForm
                fixedDate={date}
                today={today}
                surgeryDate={surgeryDate}
                onDone={() => {
                  setMilestoneForm(null);
                  load();
                }}
                onCancel={() => setMilestoneForm(null)}
              />
            ) : (
              <button
                onClick={() => setMilestoneForm("new")}
                className="w-full rounded-2xl border border-dashed border-sage/50 bg-sage-soft/50 py-3 text-sm font-medium text-sage"
              >
                ⭐ Mark a milestone for this day
              </button>
            ))}
          </div>
          </div>

          {writable && (
            <div className="flex items-center justify-between pt-2 text-xs text-muted">
              <button onClick={resetDay} className="underline underline-offset-4">
                Clear this day
              </button>
              <SaveBadge state={saveState} error={saveError} />
            </div>
          )}
        </>
      )}

      {/* Also shown on days with nothing logged, so the doctor can comment on a missed day. */}
      {day && (
        <Comments
          type="day"
          targetKey={date}
          title={
            mode === "doctor" ? "Doctor's notes for this day" : mode === "me" ? "Comments with your doctor" : "Notes from the doctor"
          }
          intro={
            mode === "doctor"
              ? "Notes, corrections or instructions for this day. Anyone with the link can read them. Pick what it's about so it's clear."
              : undefined
          }
          aboutOptions={aboutOptions(day)}
        />
      )}
    </div>
  );
}

/** What a comment on a day can be "about": its exercises, the readings, its medicines. */
function aboutOptions(day: DayLog): string[] {
  const names = (kind: DayItem["kind"]) => [...new Set(day.items.filter((i) => i.kind === kind).map((i) => i.name))];
  return [
    ...names("exercise"),
    "Pain",
    "Swelling",
    "Stiffness",
    "Knee angles",
    "Red flags",
    "Journal",
    "Photos & videos",
    ...names("medicine").map((m) => `Medicine: ${m}`),
  ];
}

function Checklist({
  day,
  mode,
  writable,
  onItem,
}: {
  day: DayLog;
  mode: string;
  writable: boolean;
  onItem: (item: DayItem, patch: Partial<Pick<DayItem, "done" | "actual">>) => void;
}) {
  const exercises = day.items.filter((i) => i.kind === "exercise");
  const medicines = day.items.filter((i) => i.kind === "medicine");
  const done = exercises.filter((i) => i.done).length;

  const groups: [string, DayItem[]][] = [];
  for (const item of exercises) {
    const label = SESSION_LABELS[item.slot as ExerciseSession] ?? item.slot;
    const group = groups.find((g) => g[0] === label);
    if (group) group[1].push(item);
    else groups.push([label, [item]]);
  }

  if (exercises.length === 0 && medicines.length === 0) {
    return (
      <Card title="Exercises">
        <p className="text-sm text-muted">Nothing scheduled for this day.</p>
      </Card>
    );
  }

  return (
    <>
      <Card
        title="Exercises"
        right={
          <span className="text-sm text-muted">
            {done} / {exercises.length} done
          </span>
        }
      >
        <div className="h-1.5 overflow-hidden rounded-full bg-line">
          <div
            className="h-full rounded-full bg-sage transition-all"
            style={{ width: `${exercises.length ? (done / exercises.length) * 100 : 0}%` }}
          />
        </div>
        {groups.map(([label, items]) => (
          <div key={label}>
            <h3 className="mt-4 mb-1 text-xs font-semibold tracking-wide text-muted uppercase">{label}</h3>
            <ul className="divide-y divide-line">
              {items.map((item) => (
                <ItemRow key={item.id} item={item} writable={writable} showPlan={mode !== "public"} onItem={onItem} />
              ))}
            </ul>
          </div>
        ))}
      </Card>

      {medicines.length > 0 && (
        <Card title="Medicines" subtitle={privateNote(mode)}>
          <ul className="divide-y divide-line">
            {medicines.map((item) => (
              <ItemRow
                key={item.id}
                item={{ ...item, name: `${item.name} · ${TIME_LABELS[item.slot] ?? item.slot}` }}
                writable={writable}
                showPlan
                noActual
                onItem={(_, patch) => onItem(item, patch)}
              />
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}

function ItemRow({
  item,
  writable,
  showPlan,
  noActual,
  onItem,
}: {
  item: DayItem;
  writable: boolean;
  showPlan: boolean;
  noActual?: boolean;
  onItem: (item: DayItem, patch: Partial<Pick<DayItem, "done" | "actual">>) => void;
}) {
  const [actual, setActual] = useState(item.actual);
  useEffect(() => setActual(item.actual), [item.actual]);

  const plan = [item.sets && item.target ? `${item.sets} × ${item.target}` : item.sets || item.target, item.notes]
    .filter(Boolean)
    .join(" · ");

  return (
    <li className="flex items-center gap-3 py-2.5">
      <button
        disabled={!writable}
        onClick={() => onItem(item, { done: !item.done })}
        className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-default"
        aria-pressed={item.done}
      >
        <span
          className={`grid size-7 shrink-0 place-items-center rounded-full border-2 text-sm ${
            item.done ? "border-sage bg-sage text-white" : "border-line bg-white"
          }`}
          aria-hidden
        >
          {item.done ? "✓" : ""}
        </span>
        <span className="min-w-0">
          <span className={`block text-[15px] ${item.done ? "text-muted line-through decoration-sage/60" : ""}`}>
            {item.name}
          </span>
          {showPlan && plan && <span className="block text-xs text-muted">{plan}</span>}
        </span>
      </button>
      {!noActual &&
        (writable ? (
          <input
            value={actual}
            onChange={(e) => setActual(e.target.value)}
            onBlur={() => actual !== item.actual && onItem(item, { actual })}
            placeholder="reps"
            aria-label={`Actual reps for ${item.name}`}
            maxLength={40}
            className="w-16 shrink-0 rounded-lg border border-line bg-paper/50 px-2 py-1.5 text-center text-sm outline-none focus:border-sage"
          />
        ) : (
          item.actual && <span className="shrink-0 text-sm text-muted">{item.actual}</span>
        ))}
    </li>
  );
}

function Card({
  title,
  subtitle,
  right,
  children,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-line bg-card p-4 shadow-[0_1px_0_rgba(0,0,0,0.02)]">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <div>
          <h2 className="font-semibold">{title}</h2>
          {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
        </div>
        {right}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline gap-2">
        <span className="text-sm font-medium">{label}</span>
        {hint && <span className="text-xs text-muted">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

/** 0–10 as tappable chips; tapping the chosen one again clears it. */
function NumberChips({
  value,
  disabled,
  onPick,
}: {
  value: number | null;
  disabled: boolean;
  onPick: (v: number | null) => void;
}) {
  if (disabled) {
    return <span className="text-sm">{value === null ? <span className="text-muted">Not logged</span> : `${value} / 10`}</span>;
  }
  return (
    <div className="grid grid-cols-11 gap-1">
      {Array.from({ length: 11 }, (_, n) => (
        <button
          key={n}
          onClick={() => onPick(value === n ? null : n)}
          className={`aspect-square rounded-lg text-sm ${
            value === n ? "bg-ink font-semibold text-white" : "bg-paper text-ink"
          }`}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

function Chips({
  options,
  value,
  disabled,
  big,
  onPick,
}: {
  options: readonly string[];
  value: string | null;
  disabled: boolean;
  big?: boolean;
  onPick: (v: string | null) => void;
}) {
  if (disabled) {
    return value ? (
      <span className={big ? "text-2xl" : "text-sm capitalize"}>{value}</span>
    ) : (
      <span className="text-sm text-muted">Not logged</span>
    );
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o}
          onClick={() => onPick(value === o ? null : o)}
          className={`rounded-full capitalize ${big ? "px-2.5 py-1 text-2xl" : "px-3.5 py-1.5 text-sm"} ${
            value === o ? (big ? "bg-sage-soft ring-2 ring-sage" : "bg-ink text-white") : "bg-paper"
          }`}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

function AngleInput({
  label,
  value,
  min,
  max,
  disabled,
  onCommit,
}: {
  label: string;
  value: number | null;
  min: number;
  max: number;
  disabled: boolean;
  onCommit: (v: number | null) => void;
}) {
  const [text, setText] = useState(value === null ? "" : String(value));
  const [error, setError] = useState(false);
  useEffect(() => setText(value === null ? "" : String(value)), [value]);

  function commit() {
    const t = text.trim();
    if (t === "") return value !== null && onCommit(null);
    const n = Number(t);
    if (!Number.isInteger(n) || n < min || n > max) return setError(true);
    setError(false);
    if (n !== value) onCommit(n);
  }

  return (
    <label className="block">
      <span className="text-xs text-muted">{label}</span>
      {disabled ? (
        <span className="block text-sm">{value === null ? "—" : `${value}°`}</span>
      ) : (
        <div className="relative">
          <input
            value={text}
            inputMode="numeric"
            onChange={(e) => setText(e.target.value.replace(/[^\d-]/g, ""))}
            onBlur={commit}
            placeholder="—"
            className={`w-full rounded-lg border bg-paper/50 px-3 py-2 pr-7 outline-none focus:border-sage ${
              error ? "border-clay" : "border-line"
            }`}
          />
          <span className="pointer-events-none absolute top-2 right-3 text-muted">°</span>
          {error && (
            <span className="text-xs text-clay">
              {min} to {max}
            </span>
          )}
        </div>
      )}
    </label>
  );
}

function SaveBadge({ state, error }: { state: SaveState; error: string | null }) {
  if (state === "saving") return <span>Saving…</span>;
  if (state === "saved") return <span className="text-sage">Saved ✓</span>;
  if (state === "error") return <span className="text-clay">Not saved: {error}</span>;
  return <span>Changes save automatically</span>;
}
