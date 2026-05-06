# Package Setup and Management Guide

This document serves as the standard operating procedure for creating, developing, maintaining, and publishing packages within our project infrastructure.

---

## 1. Prerequisites

- **Node.js**: >= 18.0.0
- **Package Manager**: pnpm (v10.33.0 or higher)
- **Toolchain**: Vite+ (`vp`)

---

## 2. Configuration Files Reference

### `package.json`

Crucial for publishing and metadata. Ensure these fields are set:

```json
{
  "name": "@scope/your-package",
  "version": "1.0.0",
  "description": "Short description of the package",
  "type": "module",
  "license": "MIT",
  "files": ["dist"],
  "sideEffects": false,
  "exports": {
    ".": {
      "types": "./dist/index.d.mts",
      "import": "./dist/index.mjs",
      "default": "./dist/index.mjs"
    },
    "./package.json": "./package.json"
  },
  "publishConfig": {
    "access": "public"
  },
  "scripts": {
    "build": "vp pack src/index.ts",
    "dev": "vp pack src/index.ts --watch",
    "test": "vp test",
    "check": "vp check",
    "prepublishOnly": "vp run build"
  },
  "packageManager": "pnpm@10.33.0"
}
```

**Notes**:

- Use `sideEffects: false` for better tree-shaking.
- Use conditional `exports` with `types`, `import`, and `default` sub-keys for TypeScript users.
- Multi-entry packages (e.g. `./browser`, `./core`, `./server`) add additional export keys following the same pattern.
- Build/dev scripts list entry points explicitly: `vp pack src/index.ts src/core/index.ts ...`.

### `vite.config.ts`

Configures Vite+ behavior (build, linting, formatting).

```typescript
import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    dts: true,
  },
  lint: {
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  fmt: {},
});
```

**Notes**:

- `pack.dts` can be `true` (simple) or `{ tsgo: true }` (advanced type generation).
- Optionally add a `staged` section for pre-commit hooks:
  ```ts
  staged: {
    "*": "vp check --fix",
  },
  ```

### `vitest.config.ts`

Test runner configuration (separate from Vite+).

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: [],
    include: ["src/**/*.{test,spec}.?(c|m)[jt]s?(x)"],
  },
});
```

### `jsr.json`

Required if publishing to JSR (JavaScript Registry). Use conditional exports matching `package.json`.

```json
{
  "name": "@scope/your-package",
  "version": "1.0.0",
  "description": "Short description",
  "license": "MIT",
  "exports": {
    ".": "./src/index.ts",
    "./subpath": "./src/subpath/index.ts"
  },
  "publish": {
    "include": ["src", "README.md", "LICENSE", "package.json", "tsconfig.json"]
  }
}
```

### `deno.json`

Required if publishing to JSR. Mirrors the exports from `jsr.json` with npm specifier imports.

```json
{
  "name": "@scope/your-package",
  "version": "1.0.0",
  "exports": {
    ".": "./src/index.ts",
    "./subpath": "./src/subpath/index.ts"
  },
  "imports": {
    "some-npm-dep": "npm:some-npm-dep@^1.0.0"
  }
}
```

### `pnpm-workspace.yaml`

Required for monorepo setups (e.g. with examples).

```yaml
packages:
  - "examples/*"
```

---

## 3. GitHub Actions CI

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 10
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install
      - run: pnpm check
      - run: pnpm test
      - run: pnpm build

  publish:
    if: github.ref == 'refs/heads/main'
    needs: [check]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 10
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
          registry-url: "https://registry.npmjs.org"
      - run: pnpm install
      - run: pnpm build
      - run: pnpm publish
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

Adjust secrets, registry URL, and job names as needed. For JSR publishing, add a `npx jsr publish` step.

---

## 4. Development Workflow

```bash
# Install dependencies
pnpm install

# Development (watch mode)
pnpm dev

# Run checks (lint + typecheck)
pnpm check

# Run tests
pnpm test

# Build for production
pnpm build

# Benchmarks (if applicable)
pnpm bench
```

---

## 5. Publishing

### npm

```bash
pnpm build
pnpm publish
```

Requirements:

- Logged into npm (`npm login`)
- Package is public (already configured via `publishConfig.access = "public"`)
- Version bump as needed before publish

### JSR

```bash
pnpm build
npx jsr publish
```

Requirements:

- Authenticated at https://jsr.io (run `npx jsr auth` or use `JSR_TOKEN` env var)
- Version bump as needed before publish
