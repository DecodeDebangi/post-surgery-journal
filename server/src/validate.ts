// Small hand-written validators. Each route lists exactly which fields it
// accepts, so a request can never set a column it shouldn't (like changed_by).

import { isIsoDate } from "../../shared/postop.ts";

export class BadRequest extends Error {}

type Check = (value: unknown, field: string) => unknown;

export const str = (max: number, min = 0): Check => (v, f) => {
  if (typeof v !== "string") throw new BadRequest(`${f} must be text`);
  const t = v.trim();
  if (t.length < min || t.length > max) {
    throw new BadRequest(min ? `${f} must be ${min}–${max} characters` : `${f} is too long (max ${max})`);
  }
  return t;
};

export const bool: Check = (v, f) => {
  if (typeof v !== "boolean") throw new BadRequest(`${f} must be true or false`);
  return v;
};

export const int = (min: number, max: number): Check => (v, f) => {
  if (!Number.isInteger(v) || (v as number) < min || (v as number) > max) {
    throw new BadRequest(`${f} must be a whole number from ${min} to ${max}`);
  }
  return v;
};

export const oneOf = (options: readonly string[]): Check => (v, f) => {
  if (typeof v !== "string" || !options.includes(v)) {
    throw new BadRequest(`${f} must be one of: ${options.join(", ")}`);
  }
  return v;
};

export const setOf = <T>(item: Check): Check => (v, f) => {
  if (!Array.isArray(v) || v.length === 0) throw new BadRequest(`${f} must be a non-empty list`);
  return [...new Set(v.map((x) => item(x, f) as T))];
};

export const date: Check = (v, f) => {
  if (!isIsoDate(v)) throw new BadRequest(`${f} must be a date (YYYY-MM-DD)`);
  return v;
};

export const nullable = (check: Check): Check => (v, f) => (v === null ? null : check(v, f));

/**
 * Picks the allowed fields out of a request body and checks each one.
 * With `partial`, missing fields are skipped (PATCH); otherwise fields marked
 * required must be present.
 */
export function pick(
  body: unknown,
  schema: Record<string, Check>,
  opts: { partial?: boolean; required?: string[] } = {},
): Record<string, unknown> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new BadRequest("Expected a JSON object");
  }
  const input = body as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [field, check] of Object.entries(schema)) {
    if (input[field] === undefined) {
      if (!opts.partial && opts.required?.includes(field)) throw new BadRequest(`${field} is required`);
      continue;
    }
    out[field] = check(input[field], field);
  }
  const unknown = Object.keys(input).filter((k) => !(k in schema));
  if (unknown.length) throw new BadRequest(`Unknown field(s): ${unknown.join(", ")}`);
  if (Object.keys(out).length === 0) throw new BadRequest("Nothing to change");
  return out;
}
