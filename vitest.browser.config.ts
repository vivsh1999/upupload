import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";

/**
 * Browser-mode integration tests: real OffscreenCanvas, real createImageBitmap
 * and real Web Workers. Run with `pnpm run test:browser`.
 *
 * The default `vitest.config.ts` excludes `*.browser.test.ts`, so the ordinary
 * `vp test` run stays in jsdom and does not need a browser installed.
 */
export default defineConfig({
  test: {
    include: ["src/**/*.browser.test.ts"],
    browser: {
      enabled: true,
      provider: playwright(),
      instances: [{ browser: "chromium" }],
      headless: true,
    },
  },
});
