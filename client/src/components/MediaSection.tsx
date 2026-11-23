import { useState, type FormEvent } from "react";
import type { Media } from "../../../shared/types.ts";
import { api, uploadPhoto } from "../api.ts";
import { shrinkPhoto } from "../image.ts";

export function driveEmbed(id: string): string {
  return `https://drive.google.com/file/d/${encodeURIComponent(id)}/preview`;
}

/** Photos and Drive videos for one day. */
export function MediaSection({
  date,
  media,
  writable,
  onChange,
}: {
  date: string;
  media: Media[];
  writable: boolean;
  onChange: (media: Media[]) => void;
}) {
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadPrivate, setUploadPrivate] = useState(false);
  const [addingVideo, setAddingVideo] = useState(false);
  const [viewing, setViewing] = useState<Media | null>(null);

  if (!writable && media.length === 0) return null;

  const photos = media.filter((m) => m.kind === "photo");
  const videos = media.filter((m) => m.kind === "video");

  async function addPhotos(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    const added: Media[] = [];
    try {
      for (let i = 0; i < files.length; i++) {
        setStatus(files.length > 1 ? `Uploading ${i + 1} of ${files.length}…` : "Uploading…");
        const small = await shrinkPhoto(files[i]);
        added.push(await uploadPhoto<Media>(date, small, "", uploadPrivate));
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setStatus(null);
      if (added.length) onChange([...media, ...added]);
    }
  }

  async function update(m: Media, patch: Partial<Pick<Media, "caption" | "is_private">>) {
    setError(null);
    try {
      const next = await api.patch<Media>(`/media/${m.id}`, patch);
      onChange(media.map((x) => (x.id === m.id ? next : x)));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function remove(m: Media) {
    if (!confirm(`Delete this ${m.kind}? This can't be undone.`)) return;
    try {
      await api.del(`/media/${m.id}`);
      onChange(media.filter((x) => x.id !== m.id));
      setViewing(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function editCaption(m: Media) {
    const caption = prompt("Caption", m.caption);
    if (caption !== null && caption !== m.caption) update(m, { caption });
  }

  const controls = (m: Media) =>
    writable && (
      <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted">
        <button onClick={() => editCaption(m)}>{m.caption ? "Edit caption" : "Add caption"}</button>
        <button onClick={() => update(m, { is_private: !m.is_private })}>
          {m.is_private ? "Make public" : "Make private"}
        </button>
        <button onClick={() => remove(m)} className="text-clay">
          Delete
        </button>
      </div>
    );

  return (
    <section className="rounded-2xl border border-line bg-card p-4">
      <h2 className="font-semibold">Photos & videos</h2>
      <p className="mb-3 text-xs text-muted">
        {writable
          ? "Photos are resized and stored privately; the public only sees ones you leave public."
          : "Tap a photo to see it larger."}
      </p>

      {photos.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {photos.map((m, i) => (
            <figure key={m.id} className={i % 2 ? "rotate-[0.8deg]" : "-rotate-[0.8deg]"}>
              <button
                onClick={() => setViewing(m)}
                className="block w-full bg-white p-1.5 pb-2 shadow-[0_2px_8px_rgba(60,40,20,0.12)]"
              >
                <img src={m.url!} alt={m.caption || "Recovery photo"} loading="lazy" className="aspect-square w-full object-cover" />
                {m.caption && <figcaption className="mt-1 truncate text-left font-serif text-xs italic">{m.caption}</figcaption>}
              </button>
              {m.is_private && <span className="mt-1 inline-block text-[11px] text-muted">🔒 Private</span>}
              {controls(m)}
            </figure>
          ))}
        </div>
      )}

      {videos.map((m) => (
        <div key={m.id} className="mt-3">
          <div className="aspect-video overflow-hidden rounded-xl bg-paper">
            <iframe
              src={driveEmbed(m.drive_id!)}
              title={m.caption || "Exercise video"}
              allow="autoplay; fullscreen"
              allowFullScreen
              loading="lazy"
              className="size-full border-0"
            />
          </div>
          <p className="mt-1 text-sm">
            {m.is_private && <span className="mr-1 text-muted">🔒</span>}
            {m.caption || <span className="text-muted">Video</span>}
          </p>
          {writable && (
            <p className="text-[11px] text-muted">
              Not playing? In Google Drive, share the file as "Anyone with the link"
              {m.is_private ? " (or with your doctor's Google account)" : ""}.
            </p>
          )}
          {controls(m)}
        </div>
      ))}

      {writable && (
        <div className="mt-4 space-y-2 border-t border-line pt-4">
          <label className="flex items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={uploadPrivate}
              onChange={(e) => setUploadPrivate(e.target.checked)}
              className="size-4 accent-sage"
            />
            Keep new photos and videos private (only you and your doctor)
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label
              className={`cursor-pointer rounded-xl bg-ink px-3 py-2.5 text-center text-sm font-medium text-white ${status ? "opacity-50" : ""}`}
            >
              📷 {status ?? "Add photos"}
              <input
                type="file"
                accept="image/*"
                multiple
                disabled={!!status}
                className="sr-only"
                onChange={(e) => {
                  addPhotos(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
            <button
              onClick={() => setAddingVideo((v) => !v)}
              className="rounded-xl border border-line px-3 py-2.5 text-sm font-medium"
            >
              🎬 Add Drive video
            </button>
          </div>
          {addingVideo && (
            <VideoForm
              date={date}
              isPrivate={uploadPrivate}
              onCancel={() => setAddingVideo(false)}
              onAdded={(m) => {
                setAddingVideo(false);
                onChange([...media, m]);
              }}
            />
          )}
        </div>
      )}

      {error && <p className="mt-3 text-sm text-clay">{error}</p>}

      {viewing && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setViewing(null)}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/85 p-4"
        >
          <img src={viewing.url!} alt={viewing.caption || "Recovery photo"} className="max-h-[80dvh] max-w-full rounded" />
          {viewing.caption && <p className="mt-3 text-center text-white">{viewing.caption}</p>}
          <button className="mt-4 rounded-full bg-white/15 px-4 py-2 text-sm text-white">Close</button>
        </div>
      )}
    </section>
  );
}

function VideoForm({
  date,
  isPrivate,
  onCancel,
  onAdded,
}: {
  date: string;
  isPrivate: boolean;
  onCancel: () => void;
  onAdded: (m: Media) => void;
}) {
  const [url, setUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onAdded(await api.post<Media>("/media/videos", { date, drive_url: url.trim(), caption, is_private: isPrivate }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-2 rounded-xl bg-paper p-3">
      <p className="text-xs text-muted">
        Upload the video to Google Drive, tap Share → "Anyone with the link" → Copy link, and paste it here.
      </p>
      <input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://drive.google.com/file/d/…/view"
        inputMode="url"
        autoFocus
        className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-sage"
      />
      <input
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        placeholder="Caption (e.g. Step-downs, left vs right)"
        maxLength={300}
        className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-sage"
      />
      {error && <p className="text-sm text-clay">{error}</p>}
      <div className="flex gap-2">
        <button disabled={busy || !url.trim()} className="flex-1 rounded-lg bg-ink py-2 text-sm text-white disabled:opacity-40">
          {busy ? "Adding…" : "Add video"}
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg border border-line px-4 py-2 text-sm">
          Cancel
        </button>
      </div>
    </form>
  );
}
