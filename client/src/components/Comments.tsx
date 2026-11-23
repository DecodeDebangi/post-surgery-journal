import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { Comment, CommentTarget, Mode } from "../../../shared/types.ts";
import { api } from "../api.ts";
import { useSession } from "../session.tsx";

export function authorLabel(author: string, mode: Mode): string {
  if (author === mode) return "You";
  return author === "doctor" ? "Doctor" : "Patient";
}

export function timeLabel(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * A comment thread on one target (a day, a week, or the prescription).
 * Only rendered for me and the doctor; the API refuses the public anyway.
 */
export function Comments({
  type,
  targetKey,
  aboutOptions,
  title = "Comments",
  intro,
}: {
  type: CommentTarget;
  targetKey: string;
  aboutOptions: string[];
  title?: string;
  intro?: string;
}) {
  const { session, refreshUnread } = useSession();
  const mode = session!.mode;
  const [list, setList] = useState<Comment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const { comments } = await api.get<{ comments: Comment[] }>(
        `/comments?type=${type}&key=${encodeURIComponent(targetKey)}`,
      );
      setList(comments);
      setError(null);
      if (comments.some((c) => c.author !== mode && !c.read_at)) {
        await api.post("/comments/read", { type, key: targetKey });
        refreshUnread();
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }, [type, targetKey, mode, refreshUnread]);

  useEffect(() => {
    load();
  }, [load]);

  // Links like "/day/2026-11-14#comments" jump here once the thread has loaded.
  useEffect(() => {
    if (list && location.hash === "#comments") {
      document.getElementById("comments")?.scrollIntoView({ behavior: "smooth" });
    }
  }, [list]);

  async function send(body: string, about: string, parentId: number | null) {
    await api.post("/comments", {
      target_type: type,
      target_key: targetKey,
      body,
      ...(about ? { about } : {}),
      ...(parentId ? { parent_id: parentId } : {}),
    });
    setReplyTo(null);
    await load();
  }

  const threads = (list ?? []).filter((c) => c.parent_id === null);
  const replies = (id: number) => (list ?? []).filter((c) => c.parent_id === id);

  return (
    <section id="comments" className="scroll-mt-24 rounded-2xl border border-sky/25 bg-card p-4">
      <h2 className="font-semibold">💬 {title}</h2>
      <p className="mb-3 text-xs text-muted">{intro ?? "Only you and your doctor see these."}</p>

      {error && <p className="mb-3 text-sm text-clay">{error}</p>}
      {list === null && !error && <p className="text-sm text-muted">Loading…</p>}
      {list?.length === 0 && <p className="mb-3 text-sm text-muted">No comments yet.</p>}

      <div className="space-y-3">
        {threads.map((c) => (
          <div key={c.id}>
            <Bubble comment={c} mode={mode} />
            <div className="mt-2 ml-5 space-y-2 border-l-2 border-line pl-3">
              {replies(c.id).map((r) => (
                <Bubble key={r.id} comment={r} mode={mode} />
              ))}
              {replyTo === c.id ? (
                <Composer
                  placeholder="Write a reply…"
                  onSend={(body) => send(body, "", c.id)}
                  onCancel={() => setReplyTo(null)}
                />
              ) : (
                <button onClick={() => setReplyTo(c.id)} className="text-xs text-sky">
                  Reply
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 border-t border-line pt-4">
        <Composer
          aboutOptions={aboutOptions}
          placeholder={mode === "doctor" ? "Write a note, a correction, or an instruction…" : "Ask your doctor something…"}
          onSend={(body, about) => send(body, about, null)}
        />
      </div>
    </section>
  );
}

function Bubble({ comment, mode }: { comment: Comment; mode: Mode }) {
  const fromDoctor = comment.author === "doctor";
  const unread = comment.author !== mode && !comment.read_at;
  return (
    <div className={`rounded-xl p-3 ${fromDoctor ? "bg-sky-soft" : "bg-paper"}`}>
      <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <span className={`font-semibold ${fromDoctor ? "text-sky" : "text-ink"}`}>
          {authorLabel(comment.author, mode)}
        </span>
        <span className="text-muted">{timeLabel(comment.created_at)}</span>
        {comment.about && (
          <span className="rounded-full bg-white/70 px-2 py-0.5 text-[11px] text-muted">About: {comment.about}</span>
        )}
        {unread && <span className="rounded-full bg-clay px-2 py-0.5 text-[10px] font-semibold text-white">New</span>}
      </div>
      <p className="text-[15px] whitespace-pre-wrap">{comment.body}</p>
    </div>
  );
}

function Composer({
  aboutOptions,
  placeholder,
  onSend,
  onCancel,
}: {
  aboutOptions?: string[];
  placeholder: string;
  onSend: (body: string, about: string) => Promise<void>;
  onCancel?: () => void;
}) {
  const [body, setBody] = useState("");
  const [about, setAbout] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await onSend(body.trim(), about);
      setBody("");
      setAbout("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      {aboutOptions && aboutOptions.length > 0 && (
        <select
          value={about}
          onChange={(e) => setAbout(e.target.value)}
          className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-sky"
          aria-label="What is this about?"
        >
          <option value="">About: general</option>
          {aboutOptions.map((o) => (
            <option key={o} value={o}>
              About: {o}
            </option>
          ))}
        </select>
      )}
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        maxLength={5000}
        placeholder={placeholder}
        className="w-full resize-y rounded-lg border border-line bg-white p-3 text-[15px] outline-none focus:border-sky"
      />
      {error && <p className="text-sm text-clay">{error}</p>}
      <div className="flex gap-2">
        <button
          disabled={busy || !body.trim()}
          className="flex-1 rounded-lg bg-sky py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {busy ? "Sending…" : "Send"}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="rounded-lg border border-line px-4 py-2 text-sm">
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
