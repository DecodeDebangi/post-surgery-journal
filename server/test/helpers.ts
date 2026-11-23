// Shared test setup: points the app at the Neon "test" branch, uses known
// PINs, resets the tables, and starts the API on a random port.
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import bcrypt from "bcrypt";
import { neon } from "@neondatabase/serverless";
import { migrate } from "../scripts/migrate.ts";
import { seed } from "../scripts/seed.ts";

export const SITE_PIN = "111111";
export const DOCTOR_PIN = "222222";

const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl) throw new Error("Set TEST_DATABASE_URL (the Neon test branch) in .env");
if (testUrl === process.env.DATABASE_URL) throw new Error("TEST_DATABASE_URL must not be the main database");

process.env.DATABASE_URL = testUrl;
if (process.env.TEST_STORAGE_ENDPOINT) process.env.STORAGE_ENDPOINT = process.env.TEST_STORAGE_ENDPOINT;
else delete process.env.STORAGE_ENDPOINT; // never touch the real bucket from tests
process.env.SITE_PIN_HASH = bcrypt.hashSync(SITE_PIN, 4);
process.env.DOCTOR_PIN_HASH = bcrypt.hashSync(DOCTOR_PIN, 4);
process.env.NODE_ENV = "test";

export const db = neon(testUrl);

export async function resetDb(): Promise<void> {
  await migrate(testUrl!, () => {});
  await db`truncate sessions, pin_attempts, comments, media, milestones, day_items, day_logs, prescription_changes,
           exercises, medicines restart identity`;
  await seed(testUrl!, () => {});
}

export interface Api {
  base: string;
  close: () => Promise<void>;
}

export async function startApi(): Promise<Api> {
  const { createApp } = await import("../src/app.ts");
  const server: Server = createApp({ trustProxy: true }).listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    base: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

export interface Reply {
  status: number;
  body: any;
  setCookie: string | null;
}

/** Calls the API as a browser would: optional session cookie and client IP. */
export async function call(
  api: Api,
  method: string,
  path: string,
  opts: { body?: unknown; cookie?: string | null; ip?: string; noCsrfHeader?: boolean } = {},
): Promise<Reply> {
  const headers: Record<string, string> = { "X-Forwarded-For": opts.ip ?? "10.0.0.1" };
  if (!opts.noCsrfHeader) headers["X-PSJ"] = "1";
  if (opts.cookie) headers.Cookie = opts.cookie;
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(api.base + path, {
    method,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  return { status: res.status, body: await res.json(), setCookie: res.headers.get("set-cookie") };
}

/** Unlocks and returns the "name=value" cookie to send on later requests. */
export async function login(api: Api, as: "me" | "doctor", ip = "10.9.9.9"): Promise<string> {
  const pin = as === "doctor" ? DOCTOR_PIN : SITE_PIN;
  const r = await call(api, "POST", "/api/auth/unlock", { body: { pin, as }, ip });
  if (r.status !== 200 || !r.setCookie) throw new Error(`login failed: ${r.status} ${JSON.stringify(r.body)}`);
  return r.setCookie.split(";")[0];
}
