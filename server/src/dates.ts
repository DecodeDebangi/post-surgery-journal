import { isIsoDate, todayIn } from "../../shared/postop.ts";
import { config } from "./config.ts";
import { BadRequest } from "./validate.ts";

/** A date that can be written to: from surgery day up to today (journal time zone). */
export function writableDate(raw: unknown): string {
  if (!isIsoDate(raw)) throw new BadRequest("Date must be YYYY-MM-DD");
  if (raw > todayIn(config().timeZone)) throw new BadRequest("That day hasn't happened yet");
  if (raw < config().surgeryDate) throw new BadRequest("That day is before the surgery");
  return raw;
}
