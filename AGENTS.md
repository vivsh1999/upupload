# Documentation (JSR)

JSR generates API documentation from JSDoc comments in source code. Two mandatory checks must pass:

1. **Module docs (0/1)** — every entrypoint listed in `jsr.json` `exports` needs `@module`
2. **Symbol docs (0/1)** — at least 80 % of exported symbols need JSDoc

## Symbol Documentation

Add JSDoc above all exported symbols (`/** ... */`) — especially types, interfaces, and functions defined directly in entrypoint files (re-exports inherit docs from their source):

- `@param` — describe function parameters
- `@returns` — describe return value
- `@example` — show usage with \`\`\`ts code blocks
- `{@link}` — create clickable cross-reference links

## Module Documentation

Add a JSDoc comment at the top of **every entrypoint file** with `@module`:

- `/** Overview of this module's purpose. @module */` — shown on package "Overview" tab (overrides README by default; toggle via Settings > Readme Source)
- Custom wildcard import identifier: `/** @module <name> */` makes `import * as <name> from "..."` use the custom name instead of `mod`

See: https://jsr.io/docs/writing-docs

# Publishing

## npm

```bash
pnpm build
pnpm publish
```

Requirements:

- Logged into npm (`npm login`)
- Package is public (already configured via `publishConfig.access = "public"`)
- Version bump as needed before publish

## JSR

```bash
pnpm build
npx jsr publish
```

Requirements:

- Authenticated at https://jsr.io (run `npx jsr auth` or use `JSR_TOKEN` env var)
- Version bump as needed before publish

# Architecture & API

## Pipeline Engine (`src/core/`)

The generic pipeline engine (`runPipeline`) executes ordered stages with:

- **Shared context bag** (`ctx.shared: Map<string, unknown>`) — stages/plugins communicate by reading/writing shared keys
- **AbortSignal support** — pipelines and uploads can be cancelled mid-flight
- **Stage middleware** — `PipelineDefinition.middleware` transforms every stage (timing, monitoring, etc.)
- **Progress events** — `PipelineOptions.onProgress` fires `start`/`end` per stage
- **Retry on error** — error handler supports `{ action: "retry"; maxRetries; delayMs? }`
- **Accumulated result in `when()`** — stage guards receive the current accumulated `PipelineResult`
- **Parallel execution** — stages with `parallel: true` run concurrently in batches via `Promise.all`
- **Dependency ordering** — stages declare `dependsOn` for explicit ordering constraints
- **Group skipping** — stages belong to named `group`s; a stage can `skipGroup` to disable an entire phase
- **Skip remaining** — `skipRemaining: true` halts all remaining stages

### Utilities

```ts
compose(...defs); // Merge multiple pipeline definitions
stage(s); // Wrap a single stage as a definition
createTimingMiddleware(); // Log stage duration to ctx.log
sharedGet(map, key); // Type-safe read from shared context
sharedSet(map, key, value); // Type-safe write to shared context
Pipeline(fn); // Nestable pipeline factory (callback-based)
runPipelineFrom(source, factory); // Execute a Pipeline factory
flattenPipeline(nodes, ctx, source); // Flatten nested pipelines into stages
```

## Plugin System (`src/plugin/`)

```ts
interface ProcessingPlugin<TOpts = Record<string, unknown>> {
  readonly id: string;
  readonly name: string;
  readonly options: TOpts;
  supports(file: { name: string; type?: string | null }): boolean;
  createStages(
    input: PipelineSource,
    opts: TOpts,
    classif: FileClassification,
    ctx: PipelineContext,
  ): PipelineStage<PipelineSource, PipelineResult>[];
  preload?(): void;
}
```

`FileClassification` now includes `size`, `lastModified`, and optional `meta` bag.

### Plugin Class (Canonical Way)

```ts
import { Plugin } from "@vivsh1999/upupload/plugins";
import { emptyResult } from "@vivsh1999/upupload/core";

const myPlugin = new Plugin<{ quality: number }>({
  id: "my-plugin",
  name: "My Plugin",
  options: { quality: 80 },
  supports(file) {
    /* return true/false */
  },
  // run shorthand — no manual createStages/array wrapping needed
  run: async (input, opts, classif, ctx) => {
    // opts is fully typed as { quality: number }
    // classif.stemName, classif.ext, etc. available directly
    // ctx.shared: Map<string, unknown> — inter-plugin communication
    // ctx.log(level, message, extra?) — structured logging
    // ctx.signal?: AbortSignal — cancellation support
    return emptyResult();
  },
  // Declare shared context keys so downstream plugins can reference
  // them via plugin.sharedKeys.* instead of hardcoded strings
  sharedKeys: { output: "my-plugin:processed" },
});

// Create a variants with overridden options — no factory needed:
const highQuality = myPlugin.with({ quality: 95 });

// For multi-instance setups, use instanceId:
const hq = myPlugin.with({ quality: 95 }, { instanceId: "hq" });
const lq = myPlugin.with({ quality: 60 }, { instanceId: "lq" });
```

### Built-in Plugins

| Base instance    | File type            | Import path                                   |
| ---------------- | -------------------- | --------------------------------------------- |
| `rawToJpeg`      | RAW/HEIC/TIFF → JPEG | `@vivsh1999/upupload/plugins/raw-to-jpeg`     |
| `jpegCompressor` | JPEG/PNG/WebP → JPEG | `@vivsh1999/upupload/plugins/jpeg-compressor` |
| `videoPoster`    | Video → JPEG poster  | `@vivsh1999/upupload/plugins/video-poster`    |

Each built-in plugin also exports a base `Plugin` instance for the `.with()` pattern:

```ts
import { rawToJpeg, jpegCompressor, videoPoster } from "@vivsh1999/upupload/plugins";
```

`rawToJpeg` is a pure decoder — it decodes RAW/HEIC/TIFF to JPEG and places the result in the shared pipeline context. It produces no artifact.

`jpegCompressor` reads the decoded file from shared context (if available) and compresses it into the configured variant. Register with defaults, then reference with overrides:

```ts
// Plugin registry (init with defaults via .with())
const registry = [rawToJpeg, jpegCompressor.with({ quality: 80, maxLongEdge: 1920, maxSizeMB: 1 })];

// Or with instanceId for multi-instance:
const registry = [
  rawToJpeg,
  jpegCompressor.with(
    { variant: "client-proof", quality: 85, maxLongEdge: 2560 },
    { instanceId: "proof" },
  ),
  jpegCompressor.with(
    { variant: "thumbnail", quality: 78, maxLongEdge: 640, maxSizeMB: 0.25 },
    { instanceId: "thumb" },
  ),
];
```

> **Tip:** Published plugins use the `Plugin` class and the `.with()` pattern. Consumers write `plugin.with({ ... })` instead of factory functions.

### Writing a Custom Plugin

```ts
const myPlugin: ProcessingPlugin<MyOpts> = {
  id: "my-plugin",
  name: "My Plugin",
  options: {},
  supports(file) {
    /* return true/false */
  },
  run: async (input, opts, classif, ctx) => {
    // opts is typed as MyOpts
    // classif.stemName, classif.ext available directly
    // ctx.shared: Map<string, unknown> — inter-plugin communication
    // ctx.log(level, message, extra?) — structured logging
    // ctx.signal?: AbortSignal — cancellation support
    return emptyResult();
  },
  // Declare shared context keys so downstream plugins can reference
  // them via plugin.sharedKeys.* instead of hardcoded strings
  sharedKeys: { output: "my-plugin:processed" },
};
```

## React Hook (`src/react/`)

```ts
function useFileUpload<TMeta = void>(
  options?: UseFileUploadOptions<TMeta>,
): UseFileUploadResult<TMeta>;
```

Key features:

- **Generic over metadata** — `queue` items include `meta?: TMeta` from `getMeta: (file) => TMeta`
- **`file: File` on every queue item** — no more DOM queries
- **`cancelUpload(fileId)` / `cancelAll()`** — aborts in-flight pipelines and uploads
- **`isDragOver` state** — composable drag-and-drop with enter/leave counter
- **`tuning.maxConcurrency`** — concurrency-limited via `Semaphore` (auto-detected from CPU count)
- **Preview URLs** — `previewUrl` and per-artifact `url` on queue items (auto-released)
- **`startUpload(fileIds?)`** — selective processing of specific items
- **Artifact blobs** — each artifact carries a `blob: Blob` for upload or display
- **`onFileComplete`** — receives the full queue item with artifacts
- **Statuses**: `"idle" | "processing" | "complete" | "error"` (no built-in upload transport)
- **`onWarning` wired** — error messages in queue trigger the callback

## Semaphore Utility

```ts
import { Semaphore } from "@vivsh1999/upupload/react"; // internal, re-exported

const sem = new Semaphore(4); // max 4 concurrent
await sem.run(() => fetch(...));
```

It is also used internally by `useFileUpload` with `tuning.maxConcurrency`.

## File Locations

### Core

- `src/core/types.ts` — All pipeline types
- `src/core/runPipeline.ts` — Generic engine
- `src/core/result.ts` — `emptyResult()`, `artifact()`, `warning()`, `infoMessage()` helpers
- `src/core/utils.ts` — `compose`, `stage`, `createTimingMiddleware`
- `src/core/index.ts` — Barrel

### Plugin

- `src/plugin/types.ts` — `ProcessingPlugin<TOpts>`, `FileClassification`, `sharedKeys`
- `src/plugin/plugin.ts` — `Plugin` class (canonical way to create plugins; supports `run` shorthand, `.with({}, { instanceId })`)
- `src/plugin/raw-to-jpeg.ts` — RAW/HEIC/TIFF decoder plugin
- `src/plugin/jpeg-compressor.ts` — JPEG/PNG/WebP compressor plugin
- `src/plugin/video-poster.ts` — Video poster frame plugin
- `src/plugin/_rasterize.ts` — Canvas JPEG conversion (internal)
- `src/plugin/_rawDecode.ts` — LibRaw WASM decoder (internal)
- `src/plugin/_optionalDecoders.ts` — HEIC/TIFF dynamic imports (internal)
- `src/plugin/index.ts` — Barrel

### Browser

- `src/browser/pipeline.ts` — `runDefaultBrowserPipeline`, topological sort (with cycle detection)
- `src/browser/pipeline-utils.ts` — `PipelineDef`, `PluginRef`, `PIPELINE_CURRENT_KEY`, `PIPELINE_CLASSIF_KEY`, `validatePipeline()`
- `src/browser/audio.ts` — `audioBufferToWav()`, `acquireAudioContext()` (pooled), `isMediaRecorderSupported()`
- `src/browser/canvas.ts` — `createCanvas()` (auto OffscreenCanvas fallback), `isOffscreenCanvasSupported()`
- `src/browser/allowlist.ts` — File type classification
- `src/browser/index.ts` — Barrel

### React

- `src/react/index.ts` — `useFileUpload` hook
- `src/react/utils.ts` — `Semaphore` utility

### Server

- `src/server/types.ts` — `ServerProcessor` interface
