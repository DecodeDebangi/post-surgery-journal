// Vercel function entry. The build bundles this (and the whole server) into
// one CommonJS file; see server/scripts/build-vercel.ts.
import type { IncomingMessage, ServerResponse } from "node:http";
import { createApp } from "./app.ts";

process.env.NODE_ENV ??= "production";
const app = createApp({ trustProxy: true });

export default function handler(req: IncomingMessage, res: ServerResponse) {
  // The route config sends /api/* here as /api/index?__route=/api/<rest>.
  // Put the original path back so Express routes it normally.
  const url = new URL(req.url ?? "/", "http://x");
  const route = url.searchParams.get("__route");
  if (route) {
    url.searchParams.delete("__route");
    const rest = url.searchParams.toString();
    req.url = route + (rest ? `?${rest}` : "");
  }
  return app(req as never, res as never);
}
