import { isIsoDate } from "../../shared/postop.ts";

export interface Config {
  databaseUrl: string;
  sitePinHash: string;
  doctorPinHash: string;
  surgeryDate: string;
  timeZone: string;
  port: number;
  production: boolean;
  sessionDays: number;
  maxPinFailures: number;
  lockoutMinutes: number;
}

let cached: Config | null = null;

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} in the environment (see .env.example)`);
  return value;
}

/** Reads and checks the environment once; fails fast on a missing secret. */
export function config(): Config {
  if (cached) return cached;
  const sitePinHash = required("SITE_PIN_HASH");
  const doctorPinHash = required("DOCTOR_PIN_HASH");
  for (const [name, hash] of [["SITE_PIN_HASH", sitePinHash], ["DOCTOR_PIN_HASH", doctorPinHash]]) {
    if (!/^\$2[aby]\$\d{2}\$.{53}$/.test(hash)) {
      throw new Error(`${name} is not a bcrypt hash. Make one with: npm run hash-pin`);
    }
  }
  const surgeryDate = process.env.SURGERY_DATE ?? "2026-08-15";
  if (!isIsoDate(surgeryDate)) throw new Error("SURGERY_DATE must be YYYY-MM-DD");

  cached = {
    databaseUrl: required("DATABASE_URL"),
    sitePinHash,
    doctorPinHash,
    surgeryDate,
    timeZone: process.env.TIMEZONE ?? "Asia/Kolkata",
    port: Number(process.env.PORT ?? 3001),
    production: process.env.NODE_ENV === "production",
    sessionDays: 30,
    maxPinFailures: 5,
    lockoutMinutes: 15,
  };
  return cached;
}
