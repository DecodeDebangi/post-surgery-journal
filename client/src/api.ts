// Thin fetch wrapper. The session cookie is httpOnly, so the browser sends it
// automatically; the page itself never sees or sets the mode.

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { "X-PSJ": "1" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers,
      credentials: "same-origin",
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "Can't reach the server. Check your connection.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? `Request failed (${res.status})`);
  return data as T;
}

/** Uploads a photo as the raw request body (not JSON). */
export async function uploadPhoto<T>(date: string, photo: Blob, caption: string, isPrivate: boolean): Promise<T> {
  const query = new URLSearchParams({ date, caption, private: isPrivate ? "1" : "0" });
  let res: Response;
  try {
    res = await fetch(`/api/media/photos?${query}`, {
      method: "POST",
      headers: { "X-PSJ": "1", "Content-Type": photo.type || "image/jpeg" },
      credentials: "same-origin",
      body: photo,
    });
  } catch {
    throw new ApiError(0, "Can't reach the server. Check your connection.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? `Upload failed (${res.status})`);
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body ?? {}),
  patch: <T>(path: string, body: unknown) => request<T>("PATCH", path, body),
  del: <T>(path: string) => request<T>("DELETE", path),
};
