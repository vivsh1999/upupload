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
