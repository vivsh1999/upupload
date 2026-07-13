import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.{test,spec}.?(c|m)[jt]s?(x)"],
    browser: {
      enabled: false,
      name: "chromium",
      provider: playwright,
    } as any,
  },
});
