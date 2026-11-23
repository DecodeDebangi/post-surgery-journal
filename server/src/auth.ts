import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcrypt";
import type { Request, Response, NextFunction } from "express";
import type { Mode } from "../../shared/types.ts";
import { config } from "./config.ts";
import { sql } from "./db.ts";

export const COOKIE = "psj_session";

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

function readCookie(req: Request, name: string): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) {
      try {
        return decodeURIComponent(part.slice(eq + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}

function cookieHeader(value: string, maxAgeSeconds: number): string {
  const parts = [
    `${COOKIE}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (config().production) parts.push("Secure");
  return parts.join("; ");
}

// ---- Session lookup (runs on every /api request) ---------------------------

/** The mode for this request. It only ever comes from the server-side session. */
export function modeOf(res: Response): Mode {
  return (res.locals.mode as Mode | undefined) ?? "public";
}

export async function loadSession(req: Request, res: Response, next: NextFunction) {
  res.locals.mode = "public";
  const token = readCookie(req, COOKIE);
  if (token && /^[A-Za-z0-9_-]{43}$/.test(token)) {
    const rows = await sql()`
      select mode from sessions
      where token_hash = ${hashToken(token)} and expires_at > now()`;
    if (rows.length) {
      res.locals.mode = rows[0].mode as Mode;
      res.locals.tokenHash = hashToken(token);
    }
  }
  next();
}

/** Allows the request only for the given modes: 401 if locked, 403 if the wrong mode. */
export function requireMode(...allowed: Mode[]) {
  return (_req: Request, res: Response, next: NextFunction) => {
    const mode = modeOf(res);
    if (allowed.includes(mode)) return next();
    if (mode === "public") return res.status(401).json({ error: "Enter the PIN first." });
    return res.status(403).json({ error: "Not allowed in doctor mode." });
  };
}

// ---- PIN rate limiting -----------------------------------------------------

/** Seconds until this IP may try again, or 0 if it is not locked out. */
async function lockedFor(ip: string): Promise<number> {
  const rows = await sql()`
    select ceil(extract(epoch from (locked_until - now())))::int as seconds
    from pin_attempts where ip = ${ip} and locked_until > now()`;
  return rows.length ? Math.max(1, rows[0].seconds as number) : 0;
}

/**
 * Records a wrong PIN atomically. Old failures (an expired lockout, or a
 * failure older than the lockout window) start the count again at 1.
 */
async function recordFailure(ip: string): Promise<number> {
  const { maxPinFailures: max, lockoutMinutes: mins } = config();
  const rows = await sql()`
    insert into pin_attempts as p (ip, failures, locked_until, updated_at)
    values (${ip}, 1, null, now())
    on conflict (ip) do update set
      failures = case
        when p.locked_until <= now()
          or (p.locked_until is null and p.updated_at < now() - make_interval(mins => ${mins}))
        then 1 else p.failures + 1 end,
      locked_until = case
        when p.locked_until <= now()
          or (p.locked_until is null and p.updated_at < now() - make_interval(mins => ${mins}))
        then null
        when p.failures + 1 >= ${max} then now() + make_interval(mins => ${mins})
        else p.locked_until end,
      updated_at = now()
    returning failures, locked_until`;
  const { failures, locked_until } = rows[0];
  return locked_until ? 0 : Math.max(0, max - (failures as number));
}

// ---- Routes ----------------------------------------------------------------

export async function unlock(req: Request, res: Response) {
  const ip = req.ip ?? "unknown";
  const { pin, as } = (req.body ?? {}) as { pin?: unknown; as?: unknown };

  const wait = await lockedFor(ip);
  if (wait) {
    res.setHeader("Retry-After", String(wait));
    return res.status(429).json({
      error: `Too many wrong PINs. Try again in ${Math.ceil(wait / 60)} min.`,
      retryAfter: wait,
    });
  }

  const mode: "me" | "doctor" = as === "doctor" ? "doctor" : "me";
  const hash = mode === "doctor" ? config().doctorPinHash : config().sitePinHash;
  const ok = typeof pin === "string" && /^\d{6}$/.test(pin) && (await bcrypt.compare(pin, hash));

  if (!ok) {
    const left = await recordFailure(ip);
    if (left === 0) {
      return res.status(429).json({
        error: `Too many wrong PINs. Try again in ${config().lockoutMinutes} min.`,
        retryAfter: config().lockoutMinutes * 60,
      });
    }
    return res.status(401).json({ error: `Wrong PIN. ${left} ${left === 1 ? "try" : "tries"} left.` });
  }

  const token = randomBytes(32).toString("base64url");
  const days = config().sessionDays;
  await sql().transaction([
    sql()`delete from pin_attempts where ip = ${ip}`,
    // Replace this browser's old session, and clear out expired ones.
    sql()`delete from sessions where token_hash = ${res.locals.tokenHash ?? ""} or expires_at < now()`,
    sql()`insert into sessions (token_hash, mode, expires_at)
          values (${hashToken(token)}, ${mode}, now() + make_interval(days => ${days}))`,
  ]);
  res.setHeader("Set-Cookie", cookieHeader(token, days * 86_400));
  res.json({ mode });
}

export async function lock(_req: Request, res: Response) {
  if (res.locals.tokenHash) {
    await sql()`delete from sessions where token_hash = ${res.locals.tokenHash}`;
  }
  res.setHeader("Set-Cookie", cookieHeader("", 0));
  res.json({ mode: "public" });
}
