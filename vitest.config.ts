import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.{test,spec}.?(c|m)[jt]s?(x)"],
    // Browser-mode integration tests need a real engine; they are run separately
    // via `pnpm run test:browser` (see vitest.browser.config.ts).
    exclude: [...configDefaults.exclude, "src/**/*.browser.test.ts"],
  },
});
