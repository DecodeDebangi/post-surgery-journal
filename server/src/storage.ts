// Photo storage behind a small interface, so the backend is swappable.
// The Neon (S3-compatible) adapter signs requests with AWS Signature V4
// using node:crypto, instead of pulling in the AWS SDK.

import { createHash, createHmac } from "node:crypto";

export interface Storage {
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<{ body: Uint8Array; contentType: string } | null>;
  delete(key: string): Promise<void>;
}

export interface S3Settings {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

const sha256 = (data: string) => createHash("sha256").update(data).digest("hex");
const hmac = (key: string | Buffer, data: string) => createHmac("sha256", key).update(data).digest();

/** RFC 3986 encoding, as SigV4 requires. */
function encode(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
}

function amzDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""); // 20130524T000000Z
}

/**
 * A SigV4 presigned URL (query-string auth, unsigned payload).
 * Exported for the test against AWS's published example.
 */
export function presignUrl(opts: {
  method: string;
  url: URL;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  expiresSeconds: number;
  now?: Date;
}): string {
  const { method, url, region, accessKeyId, secretAccessKey, expiresSeconds } = opts;
  const date = amzDate(opts.now ?? new Date());
  const day = date.slice(0, 8);
  const scope = `${day}/${region}/s3/aws4_request`;
  const params: Record<string, string> = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${accessKeyId}/${scope}`,
    "X-Amz-Date": date,
    "X-Amz-Expires": String(expiresSeconds),
    "X-Amz-SignedHeaders": "host",
  };
  const query = Object.keys(params)
    .sort()
    .map((k) => `${encode(k)}=${encode(params[k])}`)
    .join("&");
  const canonical = [method, url.pathname, query, `host:${url.host}\n`, "host", "UNSIGNED-PAYLOAD"].join("\n");
  const toSign = ["AWS4-HMAC-SHA256", date, scope, sha256(canonical)].join("\n");
  const key = hmac(hmac(hmac(hmac("AWS4" + secretAccessKey, day), region), "s3"), "aws4_request");
  const signature = createHmac("sha256", key).update(toSign).digest("hex");
  return `${url.origin}${url.pathname}?${query}&X-Amz-Signature=${signature}`;
}

/** Neon Object Storage (path-style S3). */
export function s3Storage(s: S3Settings): Storage {
  const urlFor = (method: string, key: string) =>
    presignUrl({
      method,
      url: new URL(`${s.endpoint.replace(/\/$/, "")}/${encode(s.bucket)}/${key.split("/").map(encode).join("/")}`),
      region: s.region,
      accessKeyId: s.accessKeyId,
      secretAccessKey: s.secretAccessKey,
      expiresSeconds: 300, // used immediately by this server
    });

  async function fail(res: Response, what: string): Promise<never> {
    const text = await res.text().catch(() => "");
    throw new Error(`Storage ${what} failed: ${res.status} ${text.slice(0, 200)}`);
  }

  return {
    async put(key, body, contentType) {
      const res = await fetch(urlFor("PUT", key), {
        method: "PUT",
        body,
        headers: { "Content-Type": contentType },
      });
      if (!res.ok) await fail(res, "upload");
    },
    async get(key) {
      const res = await fetch(urlFor("GET", key));
      if (res.status === 404) return null;
      if (!res.ok) await fail(res, "download");
      return {
        body: new Uint8Array(await res.arrayBuffer()),
        contentType: res.headers.get("content-type") ?? "application/octet-stream",
      };
    },
    async delete(key) {
      const res = await fetch(urlFor("DELETE", key), { method: "DELETE" });
      if (!res.ok && res.status !== 404) await fail(res, "delete");
    },
  };
}

let cached: Storage | null | undefined;

/** The configured storage, or null when photo storage isn't set up. */
export function storage(): Storage | null {
  if (cached !== undefined) return cached;
  const env = process.env;
  const { STORAGE_ENDPOINT, STORAGE_REGION, STORAGE_BUCKET, STORAGE_ACCESS_KEY_ID, STORAGE_SECRET_ACCESS_KEY } = env;
  cached =
    STORAGE_ENDPOINT && STORAGE_REGION && STORAGE_BUCKET && STORAGE_ACCESS_KEY_ID && STORAGE_SECRET_ACCESS_KEY
      ? s3Storage({
          endpoint: STORAGE_ENDPOINT,
          region: STORAGE_REGION,
          bucket: STORAGE_BUCKET,
          accessKeyId: STORAGE_ACCESS_KEY_ID,
          secretAccessKey: STORAGE_SECRET_ACCESS_KEY,
        })
      : null;
  return cached;
}
