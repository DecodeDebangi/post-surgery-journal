import { randomUUID } from "node:crypto";
import express, { Router } from "express";
import type { Media, Mode } from "../../../shared/types.ts";
import { modeOf, requireMode } from "../auth.ts";
import { writableDate } from "../dates.ts";
import { sql } from "../db.ts";
import { storage } from "../storage.ts";
import { BadRequest, bool, pick, str } from "../validate.ts";

export const media = Router();

const MAX_PHOTO_BYTES = 4 * 1024 * 1024; // the client shrinks photos well below this

/** Recognise the image type from its first bytes, rather than trusting a header. */
function sniffImage(b: Uint8Array): { type: string; ext: string } | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { type: "image/jpeg", ext: "jpg" };
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { type: "image/png", ext: "png" };
  const ascii = (from: number, to: number) => String.fromCharCode(...b.slice(from, to));
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return { type: "image/webp", ext: "webp" };
  return null;
}

/** Accepts the usual Google Drive share links and returns the file id. */
export function driveFileId(link: string): string | null {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || !/^(drive|docs)\.google\.com$/.test(url.hostname)) return null;
  const fromPath = url.pathname.match(/\/file\/d\/([A-Za-z0-9_-]{10,})/)?.[1];
  const id = fromPath ?? url.searchParams.get("id");
  return id && /^[A-Za-z0-9_-]{10,}$/.test(id) ? id : null;
}

type MediaRow = Omit<Media, "url"> & { storage_key: string | null };

export function toMedia(row: MediaRow): Media {
  const { storage_key, ...rest } = row;
  return { ...rest, url: storage_key ? `/api/media/${row.id}/file` : null };
}

/** Media for some dates; the public only gets items not marked private. */
export async function mediaFor(dates: string[], mode: Mode): Promise<Media[]> {
  if (dates.length === 0) return [];
  const rows = await sql()`
    select id, date::text, kind, caption, is_private, storage_key, drive_id, created_at
    from media
    where date = any(${dates}::date[]) and (${mode !== "public"} or not is_private)
    order by created_at, id`;
  return (rows as MediaRow[]).map(toMedia);
}

const SELECT = "id, date::text, kind, caption, is_private, storage_key, drive_id, created_at";

// ---- Upload a photo (raw image body) ---------------------------------------

media.post(
  "/photos",
  requireMode("me"),
  express.raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: MAX_PHOTO_BYTES }),
  async (req, res) => {
    const store = storage();
    if (!store) return res.status(503).json({ error: "Photo storage isn't set up on this server." });
    const date = writableDate(req.query.date);
    const caption = typeof req.query.caption === "string" ? str(300)(req.query.caption, "caption") : "";
    const isPrivate = req.query.private === "1";

    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      throw new BadRequest("Send the photo as a JPEG, PNG or WebP image.");
    }
    const bytes = new Uint8Array(req.body);
    const kind = sniffImage(bytes);
    if (!kind) throw new BadRequest("That file isn't a JPEG, PNG or WebP image.");

    const key = `photos/${date}/${randomUUID()}.${kind.ext}`;
    await store.put(key, bytes, kind.type);
    try {
      const [row] = await sql().query(
        `insert into media (date, kind, storage_key, content_type, bytes, caption, is_private)
         values ($1, 'photo', $2, $3, $4, $5, $6) returning ${SELECT}`,
        [date, key, kind.type, bytes.length, caption, isPrivate],
      );
      res.status(201).json(toMedia(row as MediaRow));
    } catch (e) {
      await store.delete(key).catch(() => {});
      throw e;
    }
  },
);

// ---- Add a Google Drive video link -----------------------------------------

media.post("/videos", requireMode("me"), async (req, res) => {
  const fields = pick(
    req.body,
    { date: str(10, 10), drive_url: str(500, 1), caption: str(300), is_private: bool },
    { required: ["date", "drive_url"] },
  );
  const date = writableDate(fields.date);
  const driveId = driveFileId(fields.drive_url as string);
  if (!driveId) {
    throw new BadRequest("Paste a Google Drive share link, like https://drive.google.com/file/d/…/view");
  }
  const [row] = await sql().query(
    `insert into media (date, kind, drive_id, caption, is_private)
     values ($1, 'video', $2, $3, $4) returning ${SELECT}`,
    [date, driveId, fields.caption ?? "", fields.is_private ?? false],
  );
  res.status(201).json(toMedia(row as MediaRow));
});

// ---- Edit / delete ---------------------------------------------------------

function mediaId(raw: unknown): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) throw new BadRequest("Bad media id");
  return id;
}

media.patch("/:id", requireMode("me"), async (req, res) => {
  const fields = pick(req.body, { caption: str(300), is_private: bool }, { partial: true });
  const cols = Object.keys(fields);
  const rows = await sql().query(
    `update media set ${cols.map((c, i) => `${c} = $${i + 2}`).join(", ")}
     where id = $1 returning ${SELECT}`,
    [mediaId(req.params.id), ...Object.values(fields)],
  );
  if (!rows.length) return res.status(404).json({ error: "No such photo or video" });
  res.json(toMedia(rows[0] as MediaRow));
});

media.delete("/:id", requireMode("me"), async (req, res) => {
  const [row] = await sql()`delete from media where id = ${mediaId(req.params.id)} returning storage_key`;
  if (!row) return res.status(404).json({ error: "No such photo or video" });
  if (row.storage_key) await storage()?.delete(row.storage_key);
  res.json({ deleted: true });
});

// ---- Serve a photo ---------------------------------------------------------
// Photos are streamed through the API rather than linked from the bucket:
// the permission check runs on every view, and browsers never need to reach
// the storage host directly.

media.get("/:id/file", async (req, res) => {
  const [row] = await sql()`
    select storage_key, is_private from media
    where id = ${mediaId(req.params.id)} and kind = 'photo'`;
  if (!row || (row.is_private && modeOf(res) === "public")) {
    return res.status(404).json({ error: "Not found" });
  }
  const store = storage();
  if (!store) return res.status(503).json({ error: "Photo storage isn't set up on this server." });
  const file = await store.get(row.storage_key);
  if (!file) return res.status(404).json({ error: "Not found" });

  // A photo's bytes never change, so the browser may keep it for a day. "private"
  // keeps it out of shared caches (a CDN), so switching a photo to private
  // takes effect for everyone else straight away.
  res.setHeader("Content-Type", file.contentType);
  res.setHeader("Cache-Control", "private, max-age=86400");
  res.send(Buffer.from(file.body));
});
