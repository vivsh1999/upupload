---
name: upupload-contribute
description: Contribute to the @vivsh1999/upupload repository itself. Use when fixing bugs, adding new built-in plugins, improving documentation, or setting up the development environment for this package.
---

# Contributing to @vivsh1999/upupload

Guide for contributors to the UpUpload repository.

## Prerequisites

- [pnpm](https://pnpm.io/) v10.2.0+
- [Vite+](https://github.com/voidzero-dev/vite-plus) (`vp`) — `pnpm add -g vite-plus` or use `npx vp`

## Setup

```sh
git clone https://github.com/vivsh1999/upupload.git
cd upupload
pnpm install
```

## Project Structure

```
src/
├── core/              # Generic pipeline engine
│   ├── types.ts       # All pipeline types (PipelineStage, PipelineDefinition, PipelineResult, etc.)
│   ├── runPipeline.ts # Generic engine runner
│   ├── result.ts      # emptyResult(), artifact(), warning(), infoMessage()
│   ├── utils.ts       # compose(), stage(), createTimingMiddleware(), Pipeline(), runPipelineFrom()
│   ├── constants.ts   # PIPELINE_CURRENT_KEY
│   └── index.ts       # Barrel — re-exports everything from core
├── plugin/            # Plugin system
│   ├── plugin.ts      # Plugin class (canonical way)
│   ├── types.ts       # ProcessingPlugin<TOpts>, FileClassification
│   ├── plugin-provider.ts  # PluginProvider, TypedPluginRef
│   ├── jpeg-compressor.ts  # JPEG/PNG/WebP compressor
│   ├── raw-to-jpeg.ts      # RAW/HEIC/TIFF decoder
│   ├── video-poster.ts     # Video poster frame
│   ├── _rasterize.ts       # Canvas JPEG conversion (internal — prefixed with _)
│   ├── _rawDecode.ts       # LibRaw WASM decoder (internal)
│   ├── _optionalDecoders.ts # HEIC/TIFF dynamic imports (internal)
│   ├── test-utils.ts       # mockPipelineSource, mockPipelineContext, mockFileClassification
│   └── index.ts            # Barrel export
├── browser/           # Browser-specific utils
│   ├── pipeline.ts    # runDefaultBrowserPipeline, topological sort
│   ├── pipeline-utils.ts  # PipelineDef, PluginRef, resolvePipeline, validatePipeline, file helpers
│   ├── allowlist.ts   # RAW_EXTENSIONS, VIDEO_EXTENSIONS, AUDIO_EXTENSIONS, etc.
│   ├── audio.ts       # audioBufferToWav, acquireAudioContext, isMediaRecorderSupported
│   ├── canvas.ts      # createCanvas, isOffscreenCanvasSupported
│   └── index.ts       # Barrel
├── react/             # React hook
│   ├── index.ts       # useFileUpload, re-exports Plugin, Semaphore, PluginProvider
│   └── utils.ts       # Semaphore utility
├── server/            # Server entry
│   ├── types.ts       # ServerProcessor interface
│   └── index.ts       # Barrel — currently exports just ServerProcessor type
├── preset/            # Zero-config upload
│   └── index.ts       # upload() function
└── index.ts           # Main barrel — re-exports core only
docs/                  # Documentation markdown files
examples/              # Example projects (vanilla-html, tanstack-start)
```

Files prefixed with `_` (e.g. `_rasterize.ts`, `_rawDecode.ts`) are internal and not part of the public API.

## Build System

Uses **Vite+** (`vp`) — a Vite-based build toolchain.

```sh
vp pack              # Build the project
vp pack --watch      # Dev mode with file watching
```

The build command in `package.json` lists all entry points:

```
vp pack src/index.ts src/core/index.ts src/browser/index.ts src/plugin/index.ts
        src/plugin/jpeg-compressor.ts src/plugin/raw-to-jpeg.ts
        src/plugin/video-poster.ts src/plugin/test-utils.ts
        src/react/index.ts src/server/index.ts src/preset/index.ts
```

### Adding a New Entry Point

When adding a new export path:

1. Add the source file (e.g. `src/feature/index.ts` with `/** @module feature */`)
2. Add the file path to the `build` and `dev` scripts in `package.json`
3. Add the export map entry in `package.json` `exports` field
4. Add the export map entry in `jsr.json` `exports` field
5. Add JSDoc on all exported symbols

## package.json Exports

The `exports` field maps import paths to dist files:

```json
"./new-feature": {
  "types": "./dist/feature/index.d.mts",
  "import": "./dist/feature/index.mjs",
  "default": "./dist/feature/index.mjs"
}
```

## Testing

Uses **Vitest** with **jsdom** environment.

```sh
vp test                          # Run all tests
vp test --run src/core/core.test # Single test file
```

Tests live next to the source file they test (e.g. `src/core/runPipeline.test.ts`).

### Unit Test Pattern

```ts
import { describe, it, expect } from "vitest";
import {
  mockPipelineSource,
  mockPipelineContext,
  mockFileClassification,
} from "@vivsh1999/upupload/plugins/testing";
import { myPlugin } from "./my-plugin";

describe("my-plugin", () => {
  it("produces an artifact for supported files", async () => {
    const source = mockPipelineSource({ name: "test.png", type: "image/png" });
    const ctx = mockPipelineContext();
    const classif = mockFileClassification({ ext: ".png", mime: "image/png" });
    const stages = myPlugin.createStages(source, myPlugin.options, classif, ctx);
    const result = await stages[0]!.run(source, ctx);
    expect(result.artifacts).toHaveLength(1);
  });

  it("does not match unsupported files", () => {
    expect(myPlugin.supports({ name: "file.txt", type: "text/plain" })).toBe(false);
  });
});
```

### Integration Test Pattern

```ts
import { runDefaultBrowserPipeline } from "../browser/pipeline";

it("processes a file end-to-end", async () => {
  const file = new File(["fake-image-data"], "test.png", { type: "image/png" });
  const result = await runDefaultBrowserPipeline(
    { file, name: "test.png", type: "image/png" },
    {},
    { plugins: [myPlugin.with({ quality: 80 })] },
  );
  expect(result.artifacts.length).toBeGreaterThan(0);
});
```

### Benchmarks

Benchmarks use `vitest bench` and live in `src/**/*.bench.ts`:

```ts
import { bench, describe } from "vitest";
describe("my-feature", () => {
  bench("fast path", () => {
    /* ... */
  });
});
```

Run with `vitest bench`. Results are auto-generated into README between `<!-- benchmarks:start -->` and `<!-- benchmarks:end -->` markers.

## Code Style

- **No comments** in source code unless explicitly required
- **TypeScript-native** — full type inference, never cast or annotate inferred values
- **Tree-shakeable** — each plugin is a separate import path; no side effects
- **JSDoc** — all exported symbols must have JSDoc for JSR publishing (80%+ coverage required)
- Entrypoint files need `/** @module <name> */` at the top

### JSDoc Requirements

**Module docs** at the top of every entrypoint file:

```ts
/** @module my-plugin */
```

**Symbol docs** on all exported functions, types, classes, interfaces:

````ts
/**
 * Creates a watermark on processed images.
 * @param opacity - Opacity level 0–1.
 * @returns The watermarked file.
 * @example
 * ```ts
 * const result = await watermark(file, { opacity: 0.5 });
 * ```
 */
````

## Adding a New Built-in Plugin

1. Create the file in `src/plugin/` (e.g. `src/plugin/my-plugin.ts`)
2. Export a `Plugin` instance:
   ```ts
   export const myPlugin = new Plugin<MyOptions>({ ... });
   ```
3. Export the options type:
   ```ts
   export type { MyOptions } from "./my-plugin";
   ```
4. Add the export to `src/plugin/index.ts`
5. Add the import path to `package.json` `exports`
6. Add the import path to `jsr.json` `exports`
7. Write tests in `src/plugin/my-plugin.test.ts` + benchmarks in `src/plugin/my-plugin.bench.ts`
8. Add JSDoc module docs at the top of the entrypoint file
9. Document required optional dependencies and internal module pattern

### Internal Module Pattern

Internal modules (not part of the public API) are prefixed with `_`:

- `_rawDecode.ts` — LibRaw WASM wrapper
- `_rasterize.ts` — Canvas JPEG conversion
- `_optionalDecoders.ts` — HEIC/TIFF dynamic imports

## Plugin Dependencies

- Core dependencies (listed in `package.json` `dependencies`): `browser-image-compression`, `heic-decode`, `heic2any`, `libraw-wasm`, `utif`
- Heavy decoders are imported dynamically at runtime (see `jpeg-compressor.ts` for the canonical pattern)
- Document required optional deps in the plugin's JSDoc and README

## Git & PR Workflow

1. Fork the repo and create a feature branch from `main`
2. Make changes following code style conventions
3. Run `vp check` to verify formatting and types
4. Run `vp test` to ensure all tests pass
5. Submit a PR against `main` with a clear description

## Publishing

Publishing is handled via GitHub Actions on release creation. Manual publishing:

### npm

```sh
pnpm build
pnpm publish
```

Requires `npm login` and `publishConfig.access = "public"` (already set).

### JSR

```sh
pnpm build
npx jsr publish
```

Requires authentication at https://jsr.io (`npx jsr auth`). JSR checks:

1. Module docs (`@module`) on every entrypoint
2. Symbol docs on ≥80% of exported symbols
