# Upgrade Routine

When making changes, update ALL files in the affected dependency chain. The following tables map what to update for each type of change.

## Source Code → Derivative File Map

| If you change…                                     | Also update these files                                                                                                                                                                                                                                                       |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/core/types.ts` (pipeline types)               | `src/core/index.ts` (re-export), `src/plugin/types.ts` (imports types), `src/plugin/plugin.ts`, `src/plugin/test-utils.ts`, `src/browser/pipeline.ts`, `src/browser/pipeline-utils.ts`, `docs/pipeline.md`, `docs/plugins.md`                                                 |
| `src/core/runPipeline.ts`                          | `src/browser/pipeline.ts` (calls it), `docs/pipeline.md`                                                                                                                                                                                                                      |
| `src/core/result.ts`                               | `src/core/index.ts` (re-export), `docs/pipeline.md`, `docs/plugins.md`, `AGENTS.md` (result helpers section)                                                                                                                                                                  |
| `src/plugin/types.ts` (ProcessingPlugin interface) | All `*.ts` files in `src/plugin/`, `src/browser/pipeline.ts`, `docs/plugins.md`, `AGENTS.md`, `examples/`, `skills/` (all SKILL.md files)                                                                                                                                     |
| `src/plugin/plugin.ts` (Plugin class)              | All built-in plugins (`raw-to-jpeg.ts`, `jpeg-compressor.ts`, `video-poster.ts`), `src/plugin/plugin-provider.ts`, `docs/plugins.md`                                                                                                                                          |
| Any built-in plugin (`src/plugin/*.ts`)            | `src/plugin/index.ts` (barrel), `package.json` `exports`, `jsr.json` `exports`, `docs/plugins.md`, `docs/configuration.md`, `AGENTS.md` (built-in plugins table)                                                                                                              |
| `src/plugin/test-utils.ts`                         | `src/plugin/index.ts` (barrel), `docs/plugins.md`, `skills/` (all SKILL.md files reference mock utilities)                                                                                                                                                                    |
| `src/react/index.ts` (hook / types)                | `docs/react.md`, `docs/pipeline.md` (upload pattern), `docs/configuration.md`, `AGENTS.md` (React hook section), `examples/tanstack-start/src/components/media-upload/types.ts` (if types added/removed), `skills/upupload/SKILL.md` (references UseFileUploadOptions/Result) |
| `src/react/utils.ts` (Semaphore)                   | `docs/react.md`                                                                                                                                                                                                                                                               |
| `src/react/persistence.ts`                         | `src/react/index.ts` (imports it), `docs/react.md`, `AGENTS.md` (file locations)                                                                                                                                                                                              |

## Documentation / Meta → Source File Map

| If you change…           | Also update these files                                                                                              |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `docs/*.md`              | `AGENTS.md` (keeps Architecture & API in sync with separate docs), `skills/` (if skill content mirrors doc patterns) |
| `package.json` `exports` | `jsr.json` `exports` (must match), `docs/plugins.md` (import paths if adding plugin)                                 |
| `jsr.json` `exports`     | `package.json` `exports` (must match)                                                                                |
| `examples/`              | Ensure `npx tsc --noEmit` passes in the example project                                                              |

## Verification Checklist

After making ANY changes, run:

```bash
npx tsc --noEmit                           # Main project
npx tsc --noEmit                            # (if changed) Examples
pnpm run test                               # 106+ tests must pass
pnpm run build                              # Dist must compile
```

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
- **Stage progress** — `ctx.reportProgress(percent)` allows stages to surface internal progress; wired via `PipelineOptions.onStageProgress`
- **Pause/Resume** — `PipelineOptions.onPauseCheck` yields between stages when the caller is paused
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
fallbackResult(); // Create empty PipelineResult for error handler fallback values
```

## Plugin System (`src/plugin/`)

```ts
interface ProcessingPlugin<TOpts = Record<string, unknown>> {
  readonly id: string;
  readonly name: string;
  readonly options: TOpts;
  supports(file: { name: string; type?: string | null; size?: number }): boolean;
  createStages(
    input: PipelineSource,
    opts: TOpts,
    classif: FileClassification,
    ctx: PipelineContext,
  ): PipelineStage<PipelineSource, PipelineResult>[];
  preload?(): void;
}
```

`FileClassification` includes `ext`, `mime`, `stemName`, `isVideo`, `isAudio`, `isSvg`, `size`, `lastModified`, and optional `meta` bag.

### Plugin Context

The `PipelineContext` passed to stage `run()` and `createStages()` includes:

```ts
{
  log(level, message, extra?);   // Structured logging
  shared: Map<string, unknown>;  // Inter-stage communication
  signal?: AbortSignal;          // Cancellation
  reportProgress?(percent);      // Report 0-100 progress during long operations
}
```

### Plugin Class (Canonical Way)

```ts
import { Plugin } from "@vivsh1999/upupload/plugins";
import { emptyResult } from "@vivsh1999/upupload/core";

const myPlugin = new Plugin<{ quality: number }>({
  id: "my-plugin",
  name: "My Plugin",
  options: { quality: 80 },
  supports(file) {
    // file.name, file.type, file.size available
    return file.type?.startsWith("image/") ?? false;
  },
  // run shorthand — no manual createStages/array wrapping needed
  run: async (input, opts, classif, ctx) => {
    // opts is fully typed as { quality: number }
    // classif.stemName, classif.ext, etc. available directly
    // ctx.shared: Map<string, unknown> — inter-plugin communication
    // ctx.log(level, message, extra?) — structured logging
    // ctx.signal?: AbortSignal — cancellation support
    // ctx.reportProgress(percent) — surface progress during long ops
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

`jpegCompressor` reads the decoded file from shared context (if available) and compresses it into the configured variant. Falls back to Canvas API when `browser-image-compression` is unavailable. Register with defaults, then reference with overrides:

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

`videoPoster` extracts a JPEG poster frame. Optionally accepts `produceArtifact: false` to skip emitting an artifact (sets `pipeline:current` only).

> **Tip:** Published plugins use the `Plugin` class and the `.with()` pattern. Consumers write `plugin.with({ ... })` instead of factory functions.

### Writing a Custom Plugin

```ts
const myPlugin: ProcessingPlugin<MyOpts> = {
  id: "my-plugin",
  name: "My Plugin",
  options: {},
  supports(file) {
    // file.name, file.type, file.size available
    return true;
  },
  run: async (input, opts, classif, ctx) => {
    // opts is typed as MyOpts
    // classif.stemName, classif.ext available directly
    // ctx.shared: Map<string, unknown> — inter-plugin communication
    // ctx.log(level, message, extra?) — structured logging
    // ctx.signal?: AbortSignal — cancellation support
    // ctx.reportProgress(n) — surface progress 0-100
    return emptyResult();
  },
  // Declare shared context keys so downstream plugins can reference
  // them via plugin.sharedKeys.* instead of hardcoded strings
  sharedKeys: { output: "my-plugin:processed" },
};
```

### Result Helpers

```ts
import { emptyResult, artifact, warning, infoMessage, fallbackResult } from "@vivsh1999/upupload/core";

emptyResult();         // { artifacts: [], info: [], removeFromQueue: false }
artifact(...);         // Single artifact builder
warning(msg, code?);   // Warning info message
infoMessage(msg, code?); // Info message
fallbackResult();      // Empty result for onError fallback values
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
- **`pause()` / `resume()`** — pauses in-flight pipeline execution between stages
- **`retryUpload(fileId)`** — re-runs upload adapter only (no re-processing)
- **`isDragOver` state** — composable drag-and-drop with enter/leave counter
- **`tuning.maxConcurrency` / `tuning.maxUploadConcurrency`** — separate semaphores for processing and upload
- **Preview URLs** — `previewUrl` and per-artifact `url` on queue items (auto-released)
- **`startUpload(fileIds?)`** — selective processing of specific items
- **Artifact blobs** — each artifact carries a `blob: Blob` for upload or display
- **`onFileProcessed`** — fires after pipeline completes, before upload adapter
- **`onFileComplete`** — fires after both pipeline and upload adapter resolve
- **`onBatchComplete`** — cumulative stats when all files finish processing
- **`onBatchProgress`** — live batch stats during processing/uploads
- **Statuses**: `"idle" | "processing" | "uploading" | "complete" | "error"`
- **Upload adapter** — generic function type, user brings their own upload implementation
- **`autoPauseOnOffline`** — auto-pauses on network disconnect
- **`autoWakeLock`** — prevents screen sleep during long operations
- **`autoPreventTabClose`** — prevents accidental tab close during processing
- **`persistence: "indexeddb"`** — queue metadata survives page reload
- **`maxQueuedUploads`** — backpressure limit for upload backlog
- **`onWarning` wired** — error messages in queue trigger the callback

### Options

```ts
interface UseFileUploadOptions<TMeta = void, TPreload = undefined> {
  plugins?: ProcessingPlugin<any>[];
  pipeline?: PipelineDef[];
  pipelineConfig?: Partial<BrowserPipelineOptions>;
  maxNumberOfFiles?: number;
  maxFileSize?: number; // Bytes per file
  maxTotalBatchSize?: number; // Bytes total across queue
  maxQueuedUploads?: number; // Upload backlog limit
  autoPreventTabClose?: boolean;
  autoPauseOnOffline?: boolean;
  autoWakeLock?: boolean;
  persistence?: "memory" | "indexeddb";
  tuning?: {
    maxConcurrency?: number; // Pipeline concurrency
    maxUploadConcurrency?: number; // Upload adapter concurrency
  };
  uploadAdapter?: UploadAdapter; // Generic upload function
  getMeta?: (file: File) => TMeta;
  getPipelineContextMeta?: () => Record<string, unknown>;
  onInfo?: (message: string) => void;
  onWarning?: (message: string) => void;
  onError?: (error: Error, context?: { fileName?: string }) => void;
  onFileProcessed?: (item: FileUploadQueueItem<TMeta>) => void;
  onFileComplete?: (item: FileUploadQueueItem<TMeta>) => void;
  onBatchComplete?: (stats: BatchCompleteStats) => void;
  onBatchProgress?: (stats: BatchProgressStats) => void;
  onBeforeStart?: (files: FileUploadQueueItem<TMeta>[]) => Promise<TPreload>;
  retryMode?: "pipeline" | "adapter-only";
}
```

### Return Value

```ts
interface UseFileUploadResult<TMeta = void> {
  config: BrowserPipelineOptions;
  updateConfig: (patch: Partial<BrowserPipelineOptions>) => void;
  queue: FileUploadQueueItem<TMeta>[];
  startUpload: (fileIds?: string[]) => Promise<void>;
  clear: () => void;
  retry: (fileId: string) => void;
  retryUpload: (fileId: string) => void;
  cancelUpload: (fileId: string) => void;
  cancelAll: () => void;
  pause: () => void;
  resume: () => void;
  isBusy: boolean;
  isPaused: boolean;
  isDragOver: boolean;
  getDropTargetProps: <T>(props?: T) => T & { onDrop; onDragOver; onDragEnter; onDragLeave };
  getFileInputProps: <T>(props?: T) => T & { type: "file"; multiple: true };
  getFolderInputProps: <T>(props?: T) => T & { type: "file"; multiple: true; webkitdirectory };
}
```

### Queue Item

```ts
type FileUploadQueueItem<TMeta = void> =
  | {
      id: string;
      name: string;
      file: File;
      status: "idle" | "processing" | "uploading" | "complete" | "error";
      progress: number;
      error?: string;
      previewUrl?: string;
      meta?: TMeta;
      needsReselect: false;
      artifacts?: {
        variant: string;
        filename: string;
        blob: Blob;
        url?: string;
      }[];
    }
  | {
      id: string;
      name: string;
      file?: never;
      status: "idle" | "processing" | "uploading" | "complete" | "error";
      progress: number;
      error?: string;
      previewUrl?: string;
      meta?: TMeta;
      needsReselect: true;
      artifacts?: {
        variant: string;
        filename: string;
        blob: Blob;
        url?: string;
      }[];
    };
```

### UploadAdapter

```ts
type UploadAdapter<TPreload = undefined> = (
  artifact: { variant: string; blob: Blob; filename: string; filetype: string },
  helpers: {
    onProgress: (progress: number) => void;
    signal?: AbortSignal;
    fileId: string; // file this artifact belongs to
    totalArtifacts: number; // total artifacts for this file
    artifactIndex: number; // index of this artifact (0-based)
    batch?: {
      files: FileUploadQueueItem[];
      batchId: string;
      preload?: TPreload; // typed via UseFileUploadOptions generic
    };
  },
) => Promise<void>;
```

### BatchCompleteStats

```ts
interface BatchCompleteStats {
  totalFiles: number; // Cumulative files across all batches
  succeeded: number; // Files with status "complete"
  failed: number; // Files with status "error"
  totalBytes: number; // Cumulative bytes
  totalTimeMs: number; // Elapsed since first batch started
}
```

### BatchProgressStats

```ts
interface BatchProgressStats {
  totalFiles: number; // Total files in the batch
  succeeded: number; // Files completed successfully
  failed: number; // Files that failed
  totalBytes: number; // Sum of original file sizes
  uploadedBytes: number; // Estimated from per-file progress
}
```

## Semaphore Utility

```ts
import { Semaphore } from "@vivsh1999/upupload/react";

const sem = new Semaphore(4); // max 4 concurrent
await sem.run(() => fetch(...));
```

Used internally by `useFileUpload` with `tuning.maxConcurrency` and `tuning.maxUploadConcurrency`.

## File Locations

### Core

- `src/core/types.ts` — All pipeline types
- `src/core/runPipeline.ts` — Generic engine
- `src/core/result.ts` — `emptyResult()`, `artifact()`, `warning()`, `infoMessage()`, `fallbackResult()`
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
- `src/react/persistence.ts` — IndexedDB persistence helpers

### Server

- `src/server/types.ts` — `ServerProcessor` interface
