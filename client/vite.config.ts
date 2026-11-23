import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  root: "client",
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // The client imports ../shared, which sits outside client/.
    fs: { allow: [".."] },
    proxy: { "/api": process.env.API_URL ?? "http://localhost:3001" },
  },
  build: { outDir: "../dist", emptyOutDir: true },
});
