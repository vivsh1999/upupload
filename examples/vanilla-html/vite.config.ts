import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Proxy TUS to the TanStack Start example so this page can stay framework-free
 * while still exercising a real upload when you run both dev servers:
 *
 *   pnpm dev:tanstack-start   # http://localhost:3000
 *   pnpm dev:vanilla-html     # http://localhost:4174
 */
export default defineConfig({
  root: __dirname,
  server: {
    proxy: {
      "/api/tus": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
