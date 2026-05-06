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
  "name": "your-package-name",
  "version": "1.0.0",
  "description": "Short description of the package",
  "type": "module",
  "license": "MIT",
  "files": ["dist"],
  "exports": {
    ".": "./dist/index.mjs",
    "./package.json": "./package.json"
  },
  "publishConfig": {
    "access": "public"
  },
  "scripts": {
    "build": "vp pack",
    "dev": "vp pack --watch",
    "test": "vp test",
    "check": "vp check",
    "prepublishOnly": "vp run build"
  },
  "packageManager": "pnpm@10.33.0"
}
```

### `vite.config.ts`
Configures Vite+ behavior (build, linting, formatting).

```typescript
import { defineConfig } from "vite-plus";

export default defineConfig({
  staged: {
    "*": "vp check --fix", // Runs auto-fixes on staged files
  },
  pack: {
    dts: {
      tsgo: true, // Generate type definitions
    },
    exports: true, // Automatically handle package exports
  },
  lint: {
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  fmt: {}, // Default formatting
});
```

### `jsr.json`
Required if publishing to JSR (JavaScript Registry).

```json
{
  "name": "@your-scope/your-package-name",
  "version": "1.0.0",
  "exports": "./src/index.ts",
  "license": "MIT",
  "description": "Short description"
}
```

---

## 3. GitHub Actions Workflow
Create `.github/workflows/publish.yml` to automate CI/CD.

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
      contents: write # Required for committing and pushing updates back to main

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          ref: main 
          fetch-depth: 0 

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Setup Vite+
        uses: voidzero-dev/setup-vp@v1
        with:
          cache: true

      - name: Install dependencies
        run: vp install

      - name: Check formatting and types
        run: vp check

      - name: Run tests
        run: vp test

      - name: Sync Version and Commit
        if: github.event_name == 'release'
        run: |
          VERSION=${GITHUB_REF_NAME#v}
          echo "Setting version to $VERSION"

          # Setup Git
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

          # Update package.json
          node -e "const fs = require('fs'); const pkg = JSON.parse(fs.readFileSync('package.json')); pkg.version = '$VERSION'; fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');"

          # Update jsr.json
          node -e "const fs = require('fs'); const jsr = JSON.parse(fs.readFileSync('jsr.json')); jsr.version = '$VERSION'; fs.writeFileSync('jsr.json', JSON.stringify(jsr, null, 2) + '\n');"

          # Format json files
          vp check --fix package.json jsr.json || true

          # Commit and Push
          if [[ -n "$(git status --porcelain)" ]]; then
            git add package.json jsr.json
            git commit --no-verify -m "chore: release v$VERSION [skip ci]"
            git push origin main
            
            # Re-point the release tag
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
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          ref: main 

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          registry-url: "https://registry.npmjs.org"

      - name: Setup Vite+
        uses: voidzero-dev/setup-vp@v1
        with:
          cache: true

      - name: Install dependencies
        run: vp install

      - name: Build project
        run: vp pack

      - name: Publish to npm
        run: npm publish --access public --provenance

  publish-jsr:
    needs: prepare
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write 
    continue-on-error: true 

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          ref: main 

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Setup Vite+
        uses: voidzero-dev/setup-vp@v1
        with:
          cache: true

      - name: Install dependencies
        run: vp install

      - name: Build project
        run: vp pack

      - name: Publish to JSR
        run: npx jsr publish
