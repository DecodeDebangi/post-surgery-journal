import { useEffect, useState } from "react";
import { formatDate } from "../../../shared/postop.ts";
import type { Comment } from "../../../shared/types.ts";
import { api } from "../api.ts";
import { authorLabel, timeLabel } from "../components/Comments.tsx";
import { Link } from "../router.tsx";
import { useSession } from "../session.tsx";

function targetLink(c: Comment, today: string, mode: string): { href: string; label: string } {
  if (c.target_type === "plan") return { href: "/prescription#comments", label: "Prescription" };
  if (c.target_type === "week") return { href: `/week/${c.target_key}`, label: `Week ${c.target_key} summary` };
  return {
    href: c.target_key === today && mode === "me" ? "/#comments" : `/day/${c.target_key}#comments`,
    label: c.target_key === today ? "Today" : formatDate(c.target_key),
  };
}

/** Every comment between me and the doctor, newest first. */
export function InboxPage() {
  const { session } = useSession();
  const [list, setList] = useState<Comment[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ comments: Comment[] }>("/comments/inbox")
      .then((r) => setList(r.comments))
      .catch((e) => setError(e.message));
  }, []);

  if (!session) return null;
  const mode = session.mode;

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-lg font-semibold">Comments</h1>
        <p className="text-sm text-muted">
          {mode === "doctor"
            ? "Everything you and the patient have written, newest first. Open a day to reply or add a comment."
            : mode === "public"
              ? "Notes between the patient and their doctor, newest first. Log in to reply."
              : "Everything you and your doctor have written, newest first. Open one to reply."}
        </p>
      </div>
      {error && <p className="text-sm text-clay">{error}</p>}
      {list === null && !error && <p className="py-10 text-center text-muted">Loading…</p>}
      {list?.length === 0 && (
        <p className="rounded-2xl border border-dashed border-line p-6 text-center text-muted">
          No comments yet. Add one from any day or from the prescription.
        </p>
      )}
      {list?.map((c) => {
        const { href, label } = targetLink(c, session.today, mode);
        const unread = c.author !== mode && !c.read_at;
        return (
          <Link
            key={c.id}
            href={href}
            className={`block rounded-2xl border p-3 ${unread ? "border-clay/40 bg-clay-soft" : "border-line bg-card"}`}
          >
            <div className="mb-1 flex flex-wrap items-center gap-x-2 text-xs text-muted">
              <span className={`font-semibold ${c.author === "doctor" ? "text-sky" : "text-ink"}`}>
                {authorLabel(c.author, mode)}
              </span>
              <span>on {label}</span>
              {c.about && <span>· {c.about}</span>}
              <span className="ml-auto">{timeLabel(c.created_at)}</span>
            </div>
            <p className="line-clamp-3 text-[15px]">
              {c.parent_id && <span className="text-muted">↳ </span>}
              {c.body}
            </p>
          </Link>
        );
      })}
    </div>
  );
}
