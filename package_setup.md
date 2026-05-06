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

### `deno.json` (optional)

Only needed if you want your package to be consumed directly via Deno's import map. `jsr.json` is sufficient for publishing to JSR.

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
name: Publish Packages

on:
  release:
    types: [created]
  workflow_dispatch: # Allows manual triggering

jobs:
  prepare:
    runs-on: ubuntu-latest
    permissions:
      contents: write

    steps:
      - uses: actions/checkout@v4
        with:
          ref: main
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - uses: voidzero-dev/setup-vp@v1
        with:
          cache: true
      - run: vp install
      - run: vp check
      - run: vp test

      - name: Sync Version and Commit
        if: github.event_name == 'release'
        run: |
          VERSION=${GITHUB_REF_NAME#v}
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          node -e "const fs = require('fs'); const pkg = JSON.parse(fs.readFileSync('package.json')); pkg.version = '$VERSION'; fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');"
          node -e "const fs = require('fs'); const jsr = JSON.parse(fs.readFileSync('jsr.json')); jsr.version = '$VERSION'; fs.writeFileSync('jsr.json', JSON.stringify(jsr, null, 2) + '\n');"
          vp check --fix package.json jsr.json || true
          if [[ -n "$(git status --porcelain)" ]]; then
            git add package.json jsr.json
            git commit --no-verify -m "chore: release v$VERSION [skip ci]"
            git push origin main
            git tag -f $GITHUB_REF_NAME
            git push origin $GITHUB_REF_NAME -f
          fi

  publish-npm:
    needs: prepare
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write
    continue-on-error: true
    steps:
      - uses: actions/checkout@v4
        with:
          ref: main
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          registry-url: "https://registry.npmjs.org"
      - uses: voidzero-dev/setup-vp@v1
        with:
          cache: true
      - run: vp install
      - run: vp pack
      - run: npm publish --access public --provenance

  publish-jsr:
    needs: prepare
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write
    continue-on-error: true
    steps:
      - uses: actions/checkout@v4
        with:
          ref: main
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - uses: voidzero-dev/setup-vp@v1
        with:
          cache: true
      - run: vp install
      - run: vp pack
      - run: npx jsr publish
```

---

## 3.1 JSDoc Documentation for JSR

JSR generates API documentation from JSDoc comments in source code.

### Symbol Documentation

**At least 80% of exported symbols must have JSDoc** for JSR to pass this score. Add JSDoc above every exported symbol:

````ts
/**
 * Search the database with the given query.
 * @param query Search query (max 50 chars).
 * @param limit Number of results to return. Defaults to 20.
 * @returns Array of matched items.
 * @example
 * ```ts
 * search("Alan") // ["Alan Turing", "Alan Kay"]
 * ```
 */
export function search(query: string, limit = 20): string[];
````

- `{@link search}` creates clickable cross-references to other symbols.
- Annotate interface properties, class methods, and constructor params similarly.
- Re-exports from other modules inherit their JSDoc, but types/interfaces/functions defined **directly** in entrypoint files must be individually documented.

### Module Documentation

Add at the top of **every entrypoint file** (every file listed in `jsr.json` `exports`):

```ts
/**
 * This module contains functions to search the database.
 * @module
 */
```

- **Every entrypoint must have `@module`** — JSR scores this as a 0/1 pass/fail.
- Module docs appear on the package's **Overview** tab, replacing the README by default. Change this in the package Settings tab (**Readme Source** → "Readme").
- Custom wildcard import name: `/** @module myModule */` makes `import * as myModule from "..."` instead of `import * as mod from "..."`.

See: https://jsr.io/docs/writing-docs

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
