import { useState, type FormEvent } from "react";
import { formatDate, postOp } from "../../../shared/postop.ts";
import type { Milestone } from "../../../shared/types.ts";
import { api } from "../api.ts";

const EMOJIS = ["⭐", "🎉", "🪜", "🦵", "🚶", "🚴", "🏃", "💪", "📐", "🏆"];
const IDEAS = ["First stairs without the rail", "First 90° bend", "Walked without crutches", "First full squat"];

/** The special card a milestone gets on the timeline and its day. */
export function MilestoneCard({
  milestone,
  surgeryDate,
  onEdit,
}: {
  milestone: Milestone;
  surgeryDate: string;
  onEdit?: () => void;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-sage/30 bg-gradient-to-br from-sage-soft via-white to-sky-soft p-4">
      <div className="flex items-start gap-3">
        <div className="text-4xl leading-none" aria-hidden>
          {milestone.emoji}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold tracking-wider text-sage uppercase">
            Milestone · {postOp(surgeryDate, milestone.date).label}
          </div>
          <div className="mt-0.5 text-lg leading-snug font-semibold">{milestone.title}</div>
          {milestone.note && <p className="mt-1 text-sm whitespace-pre-wrap text-muted">{milestone.note}</p>}
          <div className="mt-1 text-xs text-muted">{formatDate(milestone.date)}</div>
        </div>
        {onEdit && (
          <button onClick={onEdit} className="text-xs text-sky">
            Edit
          </button>
        )}
      </div>
    </div>
  );
}

/** Add or edit a milestone. With `fixedDate`, the date can't be changed. */
export function MilestoneForm({
  initial,
  fixedDate,
  today,
  surgeryDate,
  onDone,
  onCancel,
}: {
  initial?: Milestone;
  fixedDate?: string;
  today: string;
  surgeryDate: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [date, setDate] = useState(initial?.date ?? fixedDate ?? today);
  const [title, setTitle] = useState(initial?.title ?? "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [emoji, setEmoji] = useState(initial?.emoji ?? "⭐");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = { date, title, note, emoji };
      if (initial) await api.patch(`/milestones/${initial.id}`, body);
      else await api.post("/milestones", body);
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!initial || !confirm("Delete this milestone?")) return;
    try {
      await api.del(`/milestones/${initial.id}`);
      onDone();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const field = "w-full rounded-lg border border-line bg-white px-3 py-2 text-[15px] outline-none focus:border-sage";

  return (
    <form onSubmit={submit} className="space-y-3 rounded-2xl border border-sage/30 bg-sage-soft/60 p-4">
      <h3 className="font-semibold">{initial ? "Edit milestone" : "New milestone"}</h3>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="What did you manage?"
        maxLength={120}
        autoFocus
        className={field}
      />
      {!title && !initial && (
        <div className="flex flex-wrap gap-1.5">
          {IDEAS.map((i) => (
            <button type="button" key={i} onClick={() => setTitle(i)} className="rounded-full bg-white px-2.5 py-1 text-xs text-muted">
              {i}
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-1">
        {EMOJIS.map((e) => (
          <button
            type="button"
            key={e}
            onClick={() => setEmoji(e)}
            className={`rounded-lg px-2 py-1 text-xl ${emoji === e ? "bg-white ring-2 ring-sage" : ""}`}
            aria-label={`Use ${e}`}
          >
            {e}
          </button>
        ))}
      </div>
      {!fixedDate && (
        <input type="date" value={date} min={surgeryDate} max={today} onChange={(e) => setDate(e.target.value)} className={field} />
      )}
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        placeholder="A note about it (optional)"
        maxLength={1000}
        className={field}
      />
      {error && <p className="text-sm text-clay">{error}</p>}
      <div className="flex gap-2">
        <button disabled={busy || !title.trim()} className="flex-1 rounded-lg bg-sage py-2 text-sm font-medium text-white disabled:opacity-40">
          {busy ? "Saving…" : "Save milestone"}
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg border border-line bg-white px-4 py-2 text-sm">
          Cancel
        </button>
      </div>
      {initial && (
        <button type="button" onClick={remove} className="text-xs text-clay underline">
          Delete milestone
        </button>
      )}
    </form>
  );
}
