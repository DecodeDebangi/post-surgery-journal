// Builds the site for Vercel using its Build Output API (.vercel/output):
//   static/                    the client (Vite build)
//   functions/api/index.func/  the whole API bundled into index.cjs (+ bcrypt)
//   config.json                routing and headers
// Vercel deploys this folder as-is. Usage: npm run build:vercel
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../../", import.meta.url).pathname;
const out = join(root, ".vercel/output");
const fn = join(out, "functions/api/index.func");
const vite = join(root, "node_modules/.bin/vite");
const run = (args: string[]) => execFileSync(vite, args, { cwd: root, stdio: "inherit" });

rmSync(out, { recursive: true, force: true });

// 1. Client
run(["build", "--config", "client/vite.config.ts", "--outDir", join(out, "static")]);

// 2. API bundle
run(["build", "--config", "server/vite.vercel.config.ts"]);

// 3. bcrypt (native) and the one package it loads at runtime
for (const pkg of ["bcrypt", "node-gyp-build"]) {
  cpSync(join(root, "node_modules", pkg), join(fn, "node_modules", pkg), { recursive: true });
}
writeFileSync(join(fn, "package.json"), JSON.stringify({ type: "commonjs" }));
writeFileSync(
  join(fn, ".vc-config.json"),
  JSON.stringify(
    {
      runtime: "nodejs22.x",
      handler: "index.cjs",
      launcherType: "Nodejs",
      shouldAddHelpers: false,
      regions: ["sin1"], // Singapore, next to the Neon database
      maxDuration: 30,
    },
    null,
    2,
  ),
);

// 4. Routing and headers
const security = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "same-origin",
  "X-Robots-Tag": "noindex, nofollow",
  "Content-Security-Policy": [
    "default-src 'self'",
    "img-src 'self' data: blob:",
    "frame-src https://drive.google.com",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self'",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; "),
};
mkdirSync(out, { recursive: true });
writeFileSync(
  join(out, "config.json"),
  JSON.stringify(
    {
      version: 3,
      routes: [
        { src: "/(.*)", headers: security, continue: true },
        { src: "/assets/(.*)", headers: { "Cache-Control": "public, max-age=31536000, immutable" }, continue: true },
        { src: "/api/(.*)", dest: "/api/index?__route=/api/$1" },
        { handle: "filesystem" },
        // Client-side routes (/day/…, /week/…) all load the app.
        { src: "/(.*)", dest: "/index.html" },
      ],
    },
    null,
    2,
  ),
);
console.log("Built .vercel/output");
