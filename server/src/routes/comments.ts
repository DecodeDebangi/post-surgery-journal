import { Router, type Request } from "express";
import { isIsoDate } from "../../../shared/postop.ts";
import type { Author } from "../../../shared/types.ts";
import { modeOf, requireMode } from "../auth.ts";
import { sql } from "../db.ts";
import { BadRequest, int, oneOf, pick, str } from "../validate.ts";

export const comments = Router();

// Anyone with the link can read comments; writing one (and the unread
// bookkeeping) needs the site or doctor PIN.
const pinOnly = requireMode("me", "doctor");

const TARGET_TYPES = ["day", "week", "plan"] as const;

function checkTarget(type: unknown, key: unknown): { type: string; key: string } {
  if (type === "day" && isIsoDate(key)) return { type, key };
  if (type === "week" && typeof key === "string" && /^\d{1,3}$/.test(key) && Number(key) >= 1) return { type, key };
  if (type === "plan" && key === "current") return { type, key };
  throw new BadRequest("Unknown comment target");
}

function targetOf(req: Request) {
  return checkTarget(req.query.type, req.query.key);
}

comments.get("/", async (req, res) => {
  const { type, key } = targetOf(req);
  // Notes on the plan talk about the prescription and medicines: PIN only.
  if (type === "plan" && modeOf(res) === "public") {
    return res.status(401).json({ error: "Enter the PIN first." });
  }
  const rows = await sql()`
    select id, target_type, target_key, parent_id, about, author, body, created_at, read_at from comments
    where target_type = ${type} and target_key = ${key}
    order by created_at, id`;
  res.json({ comments: rows });
});

comments.post("/", pinOnly, async (req, res) => {
  const fields = pick(
    req.body,
    {
      target_type: oneOf(TARGET_TYPES),
      target_key: str(20, 1),
      parent_id: int(1, 2 ** 31 - 1),
      about: str(100),
      body: str(5000, 1),
    },
    { required: ["target_type", "target_key", "body"] },
  );
  const { type, key } = checkTarget(fields.target_type, fields.target_key);
  const parentId = (fields.parent_id as number | undefined) ?? null;

  if (parentId !== null) {
    // Replies go one level deep, on the same target.
    const [parent] = await sql()`
      select parent_id from comments
      where id = ${parentId} and target_type = ${type} and target_key = ${key}`;
    if (!parent) throw new BadRequest("That comment doesn't exist here");
    if (parent.parent_id !== null) throw new BadRequest("Reply to the first comment in the thread");
  }

  // The author always comes from the session, never from the request.
  const author: Author = modeOf(res) as Author;
  const [row] = await sql()`
    insert into comments (target_type, target_key, parent_id, about, author, body)
    values (${type}, ${key}, ${parentId}, ${(fields.about as string) ?? ""}, ${author}, ${fields.body as string})
    returning id, target_type, target_key, parent_id, about, author, body, created_at, read_at`;
  res.status(201).json(row);
});

/** Marks the other person's comments on a target as read. */
comments.post("/read", pinOnly, async (req, res) => {
  const { type, key } = checkTarget(req.body?.type, req.body?.key);
  const rows = await sql()`
    update comments set read_at = now()
    where target_type = ${type} and target_key = ${key}
      and author <> ${modeOf(res)} and read_at is null
    returning id`;
  res.json({ marked: rows.length });
});

/** Recent comments everywhere, plus how many from the other person are unread. */
comments.get("/inbox", async (_req, res) => {
  const mode = modeOf(res);
  const [recent, [{ unread }]] = await Promise.all([
    sql()`select id, target_type, target_key, parent_id, about, author, body, created_at, read_at from comments
           where ${mode !== "public"} or target_type <> 'plan'
           order by created_at desc, id desc limit 100`,
    mode === "public"
      ? Promise.resolve([{ unread: 0 }])
      : sql()`select count(*)::int as unread from comments where author <> ${mode} and read_at is null`,
  ]);
  res.json({ unread, comments: recent });
});
