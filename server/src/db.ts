import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { config } from "./config.ts";

// Neon's HTTP driver: one HTTPS request per query, no connection pool to
// manage, which suits a serverless host. Tagged templates are parameterised,
// so values never end up inside the SQL text.
let client: NeonQueryFunction<false, false> | null = null;

export function sql(): NeonQueryFunction<false, false> {
  client ??= neon(config().databaseUrl);
  return client;
}
