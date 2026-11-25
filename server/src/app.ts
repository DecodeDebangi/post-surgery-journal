import express, { type NextFunction, type Request, type Response } from "express";
import { postOp, todayIn } from "../../shared/postop.ts";
import { loadSession, lock, modeOf, unlock } from "./auth.ts";
import { config } from "./config.ts";
import { comments } from "./routes/comments.ts";
import { days } from "./routes/days.ts";
import { media } from "./routes/media.ts";
import { milestones } from "./routes/milestones.ts";
import { stats } from "./routes/stats.ts";
import { timeline } from "./routes/timeline.ts";
import { overview } from "./routes/overview.ts";
import { prescription } from "./routes/prescription.ts";
import { BadRequest } from "./validate.ts";

export function createApp(opts: { trustProxy?: boolean } = {}) {
  const cfg = config();
  const app = express();
  app.disable("x-powered-by");
  // Behind Vercel's proxy, req.ip must come from X-Forwarded-For for the
  // per-IP PIN lockout to work.
  if (opts.trustProxy ?? cfg.production) app.set("trust proxy", 1);

  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "same-origin");
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
    res.setHeader("Cache-Control", "no-store");
    next();
  });

  app.use(express.json({ limit: "100kb" }));

  // CSRF guard: every write must carry a custom header. Browsers won't send
  // one cross-site without a CORS preflight, which this API never allows.
  app.use("/api", (req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD" && req.get("X-PSJ") !== "1") {
      return res.status(403).json({ error: "Missing X-PSJ header" });
    }
    next();
  });

  app.use("/api", loadSession);

  app.get("/api/auth/session", (_req, res) => {
    const today = todayIn(cfg.timeZone);
    res.json({
      mode: modeOf(res),
      today,
      surgeryDate: cfg.surgeryDate,
      postOp: postOp(cfg.surgeryDate, today),
    });
  });
  app.post("/api/auth/unlock", unlock);
  app.post("/api/auth/lock", lock);

  app.use("/api/prescription", prescription);
  app.use("/api/days", days);
  app.use("/api/comments", comments);
  app.use("/api/media", media);
  app.use("/api/milestones", milestones);
  app.use("/api/timeline", timeline);
  app.use("/api/stats", stats);
  app.use("/api/overview", overview);

  app.use("/api", (_req, res) => res.status(404).json({ error: "Not found" }));

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof BadRequest) return res.status(400).json({ error: err.message });
    if (err instanceof SyntaxError && "body" in err) return res.status(400).json({ error: "Invalid JSON" });
    if ((err as { type?: string }).type === "entity.too.large") {
      return res.status(413).json({ error: "That file is too big." });
    }
    // Postgres check/format violations are bad input, not server bugs.
    const code = (err as { code?: string }).code;
    if (code === "23514" || code === "22P02" || code === "22007" || code === "22008") {
      return res.status(400).json({ error: "That value isn't allowed" });
    }
    console.error(err);
    res.status(500).json({ error: "Something went wrong on the server" });
  });

  return app;
}
