import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";
import { devtools } from "@tanstack/devtools-vite";

import { tanstackStart } from "@tanstack/react-start/plugin/vite";

import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const config = defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    tsconfigPaths: true,
  },
  plugins: [
    devtools(),
    tailwindcss(),
    // Vite 8+ may expose `dispatchFetch` on the SSR env; Start then skips the dev
    // middleware by default, so /api/* never hits `src/server.ts` and the router
    // returns HTML 404. Force the handler so tus (and other custom fetch logic) works.
    tanstackStart({ vite: { installDevServerMiddleware: true } }),
    viteReact(),
  ],
});

export default config;
