import { defineConfig } from "vite-plus";

export default defineConfig({
  staged: {
    "src/**/*": "node scripts/check-changelog.mjs",
    "*": "vp check --fix",
  },
  pack: {
    dts: true,
    deps: {
      neverBundle: ["react"],
    },
  },
  lint: {
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  fmt: {},
});
