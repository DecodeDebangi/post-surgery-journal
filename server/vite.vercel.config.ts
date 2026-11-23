// Bundles the API into a single CommonJS file for a Vercel function.
// Everything is bundled except bcrypt, which has a native binary and is
// copied next to the bundle by build-vercel.ts.
import { defineConfig } from "vite";

export default defineConfig({
  logLevel: "warn",
  ssr: { noExternal: true, external: ["bcrypt"], target: "node" },
  build: {
    ssr: "server/src/vercel.ts",
    outDir: ".vercel/output/functions/api/index.func",
    emptyOutDir: false,
    target: "node22",
    minify: false,
    rollupOptions: {
      output: { format: "cjs", entryFileNames: "index.cjs", exports: "default" },
    },
  },
});
