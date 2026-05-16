---
name: upupload
description: Configure and use @vivsh1999/upupload — a client-first multi-stage file processor with plugin architecture. Use when processing images (RAW/HEIC/TIFF/JPEG/PNG/WebP), extracting video posters, building React upload UIs, writing custom processing plugins, or setting up browser-based file pipelines.
---

# @vivsh1999/upupload

Client-first, multi-stage file uploader/processor with a plugin architecture. Supports RAW/HEIC/TIFF decoding, JPEG compression/thumbnails, video poster extraction, and a React hook with drag-and-drop.

## Installation

```sh
npm add @vivsh1999/upupload
```

### Plugin Dependencies (install only what you need)

```sh
# JPEG/PNG/WebP compression
npm add browser-image-compression

# RAW camera files (CR3, DNG, NEF, ARW…)
npm add libraw-wasm

# HEIC/HEIF / TIFF decode (via raw-to-jpeg plugin)
npm add heic-decode heic2any utif
```

## Entry Points

| Path                                          | Environment | Use Case                                        |
| --------------------------------------------- | ----------- | ----------------------------------------------- |
| `@vivsh1999/upupload`                         | Browser     | Re-exports core types                           |
| `@vivsh1999/upupload/core`                    | Universal   | Generic pipeline engine, types, result helpers  |
| `@vivsh1999/upupload/browser`                 | Browser     | Browser pipeline, allowlist, audio/canvas utils |
| `@vivsh1999/upupload/plugins`                 | Browser     | Barrel of all plugins                           |
| `@vivsh1999/upupload/plugins/jpeg-compressor` | Browser     | JPEG/PNG/WebP compressor plugin                 |
| `@vivsh1999/upupload/plugins/raw-to-jpeg`     | Browser     | RAW/HEIC/TIFF decoder plugin                    |
| `@vivsh1999/upupload/plugins/video-poster`    | Browser     | Video poster frame plugin                       |
| `@vivsh1999/upupload/plugins/testing`         | Browser     | Plugin test utilities                           |
| `@vivsh1999/upupload/react`                   | Browser     | `useFileUpload` React hook                      |
| `@vivsh1999/upupload/server`                  | Node        | `ServerProcessor` interface                     |
| `@vivsh1999/upupload/preset`                  | Browser     | Zero-config `upload()` function                 |

## Quick Start

### Preset (zero-config)

```ts
import { upload } from "@vivsh1999/upupload/preset";

const result = await upload(file, { quality: 80 });
```

### React with Built-in Plugins

```tsx
import { useFileUpload } from "@vivsh1999/upupload/react";
import { jpegCompressor, rawToJpeg } from "@vivsh1999/upupload/plugins";

function Uploader() {
  const { getDropTargetProps, getFileInputProps, queue, startUpload } = useFileUpload({
    plugins: [rawToJpeg, jpegCompressor.with({ quality: 80, maxSizeMB: 1 })],
    onFileComplete: async (item) => {
      for (const a of item.artifacts ?? []) {
        await fetch("/api/upload", { method: "POST", body: a.blob });
      }
    },
  });

  return (
    <div {...getDropTargetProps()}>
      <input {...getFileInputProps()} />
      {queue.map((item) => (
        <div key={item.id}>
          {item.name} — {item.status} ({item.progress}%)
        </div>
      ))}
      <button onClick={() => startUpload()}>Upload</button>
    </div>
  );
}
```

### Vanilla JS

```ts
import { runDefaultBrowserPipeline } from "@vivsh1999/upupload/browser";
import { jpegCompressor } from "@vivsh1999/upupload/plugins";

const result = await runDefaultBrowserPipeline(
  { file, name: file.name, type: file.type },
  {},
  { plugins: [jpegCompressor.with({ quality: 80, maxSizeMB: 1 })] },
);
```

### Handling Results

```ts
for (const artifact of result.artifacts) {
  await fetch("/api/upload", {
    method: "POST",
    body: artifact.file,
    headers: { "Content-Type": artifact.filetype },
  });
}
```

## Built-in Plugins

Each plugin is a `Plugin` instance exported from its own entry point.

### `jpegCompressor` — JPEG/PNG/WebP compressor

- **Import:** `@vivsh1999/upupload/plugins/jpeg-compressor` or `@vivsh1999/upupload/plugins`
- **Options:** `{ variant?: string, quality: number (1-100), maxLongEdge?: number (pixels, -1 for no limit), maxSizeMB: number, debug?: boolean }`
- **Default options:** `{ variant: "outputFile", quality: 1, maxLongEdge: -1, maxSizeMB: 1, debug: false }`
- **Supports:** All raster image files (JPEG, PNG, WebP, BMP, TIFF, HEIC, HEIF, AVIF) plus RAW extensions
- SVG files are skipped with a warning
- Reads from `PIPELINE_CURRENT_KEY` in shared context (enables chaining with `rawToJpeg`)
- Use `.with()` to configure variants:

```ts
const compressed = jpegCompressor.with({ quality: 80, maxSizeMB: 1 });
const thumbnail = jpegCompressor.with(
  { variant: "thumb", quality: 78, maxLongEdge: 320, maxSizeMB: 0.25 },
  { instanceId: "thumb" },
);
const proof = jpegCompressor.with(
  { variant: "client-proof", quality: 85, maxLongEdge: 2560 },
  { instanceId: "proof" },
);
```

### `rawToJpeg` — RAW/HEIC/TIFF decoder

- **Import:** `@vivsh1999/upupload/plugins/raw-to-jpeg` or `@vivsh1999/upupload/plugins`
- **Options:** `{ debug?: boolean }`
- **Pure decoder** — produces no artifact; places decoded JPEG in shared context
- Writes to `PIPELINE_CURRENT_KEY` and its own `sharedKeys.decoded` (`"raw-to-jpeg:decoded"`)
- Supports: Camera RAW extensions (`.cr3`, `.cr2`, `.dng`, `.nef`, `.arw`, `.raf`, `.rw2`, `.orf`, `.srw`, `.pef`, `.x3f`, `.r3d`, `.braw`, `.ari`), HEIC/HEIF, TIFF
- Requires optional deps: `libraw-wasm`, `heic-decode`/`heic2any`, `utif`

```ts
// raw-to-jpeg runs first as a pure decoder, then jpegCompressor reads
// the decoded file from shared context:
const plugins = [rawToJpeg, jpegCompressor.with({ quality: 80, maxSizeMB: 1 })];
```

### `videoPoster` — Video poster frame extractor

- **Import:** `@vivsh1999/upupload/plugins/video-poster` or `@vivsh1999/upupload/plugins`
- **Options:** `{ variant?: string, maxEdge?: number (pixels, default 640) }`
- **Default options:** `{ variant: "poster", maxEdge: 640 }`
- Extracts a JPEG frame at ~0.25s from video files (MIME `video/*` or video extensions)
- Supports extensions: `.mp4`, `.m4v`, `.mkv`, `.mov`, `.webm`, `.avi`, `.wmv`, `.mpg`, `.mpeg`, `.ogv`, `.ts`, `.m2ts`, `.3gp`, `.mxf`
- Updates `PIPELINE_CURRENT_KEY` so downstream plugins can chain

```ts
const plugins = [
  videoPoster,
  videoPoster.with({ variant: "thumb", maxEdge: 320 }, { instanceId: "thumb" }),
];
```

### `PluginProvider` — Typed plugin registry

```ts
import { PluginProvider } from "@vivsh1999/upupload/plugins";

const pp = new PluginProvider([
  rawToJpeg,
  jpegCompressor.with({ quality: 80, maxLongEdge: 1920, maxSizeMB: 1 }),
  videoPoster.with({ maxEdge: 640 }),
]);

// CamelCase methods named after each plugin's ID:
pp.rawToJpeg(); // → TypedPluginRef
pp.jpegCompressor({ variant: "client-proof" }); // → with overrides
pp.videoPoster().defaults.supports(file); // → access plugin classifier
```

## useFileUpload (React Hook)

### Options

```ts
interface UseFileUploadOptions<TMeta = void> {
  plugins?: ProcessingPlugin<any>[];
  pipeline?: PipelineDef[];
  pipelineConfig?: Partial<BrowserPipelineOptions>;
  maxNumberOfFiles?: number;
  maxFileSize?: number; // bytes per file
  maxTotalBatchSize?: number; // total bytes across queue
  maxQueuedUploads?: number; // upload backlog limit
  autoPreventTabClose?: boolean;
  autoPauseOnOffline?: boolean;
  autoWakeLock?: boolean;
  persistence?: "memory" | "indexeddb";
  tuning?: {
    maxConcurrency?: number; // pipeline concurrency
    maxUploadConcurrency?: number; // upload adapter concurrency
  };
  uploadAdapter?: UploadAdapter; // generic upload function
  getMeta?: (file: File) => TMeta;
  getPipelineContextMeta?: () => Record<string, unknown>;
  onInfo?: (message: string) => void;
  onWarning?: (message: string) => void;
  onError?: (error: Error, context?: { fileName?: string }) => void;
  onFileProcessed?: (item: FileUploadQueueItem<TMeta>) => void;
  onFileComplete?: (item: FileUploadQueueItem<TMeta>) => void;
  onBatchComplete?: (stats: BatchCompleteStats) => void;
  onBatchProgress?: (stats: BatchProgressStats) => void; // live batch progress
  onBeforeStart?: (files: FileUploadQueueItem<TMeta>[]) => Promise<TPreload>;
  retryMode?: "pipeline" | "adapter-only";
}
```

### Result

```ts
interface UseFileUploadResult<TMeta = void> {
  config: BrowserPipelineOptions;
  updateConfig: (patch: Partial<BrowserPipelineOptions>) => void;
  queue: FileUploadQueueItem<TMeta>[];
  startUpload: (fileIds?: string[]) => Promise<void>;
  clear: () => void;
  retry: (fileId: string) => void;
  retryUpload: (fileId: string) => void; // upload-only retry
  cancelUpload: (fileId: string) => void;
  cancelAll: () => void;
  pause: () => void; // pause pipeline
  resume: () => void; // resume + auto-start queued
  isBusy: boolean;
  isPaused: boolean;
  isDragOver: boolean;
  getDropTargetProps: (props?) => object;
  getFileInputProps: (props?) => object;
  getFolderInputProps: (props?) => object;
}
```

### Statuses

`"idle"` → `"processing"` → `"uploading"` → `"complete"` | `"error"`

### Multi-instance Plugins (e.g. multiple variants)

```tsx
useFileUpload({
  plugins: [
    rawToJpeg,
    jpegCompressor.with(
      { variant: "proof", quality: 85, maxLongEdge: 2560 },
      { instanceId: "proof" },
    ),
    jpegCompressor.with(
      { variant: "thumb", quality: 78, maxLongEdge: 320, maxSizeMB: 0.25 },
      { instanceId: "thumb" },
    ),
  ],
  onFileComplete: (item) => {
    for (const a of item.artifacts ?? []) {
      // a.variant → "original", "proof", "thumb"
      // a.blob → the processed file blob
      // a.url → auto-released object URL
    }
  },
});
```

### Drag-and-Drop with Enter/Leave Counter

```tsx
const { getDropTargetProps, isDragOver } = useFileUpload({ plugins });

return (
  <div
    {...getDropTargetProps()}
    style={{ border: isDragOver ? "2px dashed blue" : "2px dashed gray" }}
  >
    Drop files here
  </div>
);
```

### Metadata per File

```tsx
useFileUpload({
  getMeta: (file) => ({ uploadedAt: Date.now(), category: "photos" }),
  // queue[i].meta → { uploadedAt, category }
});
```

### Concurrency Control

```tsx
useFileUpload({
  tuning: { maxConcurrency: 2 },  // process 2 files at a time
});
// Uses Semaphore internally — also available as standalone:
import { Semaphore } from "@vivsh1999/upupload/react";
const sem = new Semaphore(4);
await sem.run(() => fetch(...));
```

## Custom Plugins (Usecase-Specific)

Write plugins inline for project-specific processing needs.

```ts
import { Plugin } from "@vivsh1999/upupload/plugins";
import { artifact } from "@vivsh1999/upupload/core";

const watermark = new Plugin<{ opacity: number; text: string }>({
  id: "watermark",
  name: "Watermark Plugin",
  options: { opacity: 0.5, text: "© 2025" },
  supports: (file) => file.type?.startsWith("image/") ?? false,
  run: async (input, opts, classif, ctx) => {
    // opts — resolved options (typed as { opacity, text })
    // classif.stemName, classif.ext — file metadata
    // ctx.shared — inter-plugin communication
    // ctx.log — structured logging
    // ctx.signal — cancellation support
    return artifact(
      "watermarked",
      input.file, // or your processed blob/file
      `${classif.stemName}.jpg`,
      "image/jpeg",
    );
  },
  sharedKeys: { output: "watermark:done" },
});

// Register like any built-in plugin:
useFileUpload({ plugins: [watermark.with({ opacity: 0.3 })] });
```

### Plugin Methods

| Method                                           | Description                                                                            |
| ------------------------------------------------ | -------------------------------------------------------------------------------------- |
| `plugin.with(overrides, opts?)`                  | Create variant with partial option overrides. Pass `{ instanceId }` for multi-instance |
| `plugin.supports(file)`                          | Check if plugin handles a file                                                         |
| `plugin.createStages(input, opts, classif, ctx)` | Get pipeline stages                                                                    |
| `plugin.preload()`                               | Pre-warm decoders/WASM                                                                 |

### `sharedKeys` Pattern

Declare shared context keys so downstream plugins reference them without hardcoded strings:

```ts
const encoder = new Plugin<{}>({
  id: "encoder",
  options: {},
  supports: (f) => true,
  run: async (input, opts, classif, ctx) => {
    ctx.shared.set("encoder:output", processedFile);
    return emptyResult();
  },
  sharedKeys: { output: "encoder:output" },
});

// Downstream plugin reads via sharedKeys:
const output = ctx.shared.get(encoder.sharedKeys.output) as File;
```

### `PIPELINE_CURRENT_KEY` Convention

The well-known key `"pipeline:current"` (imported from `@vivsh1999/upupload/core` as `PIPELINE_CURRENT_KEY`) holds the "current working file". Upstream stages set it; downstream stages read it:

```ts
import { PIPELINE_CURRENT_KEY } from "@vivsh1999/upupload/core";

// Write:
ctx.shared.set(PIPELINE_CURRENT_KEY, processedFile);

// Read (fall back to input.file):
const current = (ctx.shared.get(PIPELINE_CURRENT_KEY) as File | undefined) ?? input.file;
```

### Plugin Ordering (`after` / `before`)

```ts
const decode = new Plugin<{}>({
  id: "decode",
  ...,
  sharedKeys: { output: "decode:done" },
});

const compress = new Plugin<{}>({
  id: "compress",
  ...,
  after: ["decode"],  // compress runs after decode
  run: async (input, opts, classif, ctx) => {
    const decoded = ctx.shared.get(decode.sharedKeys.output) as File;
    // ...
  },
});
```

## Browser Pipeline

For direct (non-React) usage or custom pipeline definitions:

```ts
import { runDefaultBrowserPipeline } from "@vivsh1999/upupload/browser";
import type { PipelineDef } from "@vivsh1999/upupload/browser";
import { fileExtensionLower, RAW_EXTENSIONS } from "@vivsh1999/upupload/browser";

const pipelines: PipelineDef[] = [
  {
    id: "raw-photo",
    supports: (f) => RAW_EXTENSIONS.has(fileExtensionLower(f.name)),
    plugins: [rawToJpeg, jpegCompressor.with({ quality: 80 })],
  },
  {
    id: "raster-photo",
    supports: (f) => !RAW_EXTENSIONS.has(fileExtensionLower(f.name)),
    plugins: [jpegCompressor.with({ quality: 80 })],
  },
];

const result = await runDefaultBrowserPipeline(
  { file, name: file.name, type: file.type },
  {},
  { pipeline: pipelines },
);
```

The pipeline validates files against an allowlist (image, video, audio MIME types/extensions), always passes through the original file as `"original"` artifact, then runs matched plugin stages. `skip: true` artifacts are filtered from the final result.

### Core Pipeline Engine

For advanced use, use the generic engine directly:

```ts
import { runPipeline, compose, stage, Pipeline, runPipelineFrom } from "@vivsh1999/upupload/core";
import { emptyResult, artifact, warning } from "@vivsh1999/upupload/core";

const def = compose(
  stage("validate", async (input, ctx) => {
    /* ... */ return emptyResult();
  }),
  stage({
    id: "transform",
    when: (input, ctx, current) =>
      current.artifacts.length > 0 ? { run: true } : { run: false, reason: "No artifacts yet" },
    run: async (input, ctx) => artifact("output", input.file, input.name, input.type),
    onError: (err, input, ctx) => ({ action: "skip", info: warning("Transform failed") }),
  }),
);

const result = await runPipeline(source, def, {
  logger: (level, msg) => console[level](msg),
  signal: abortController.signal,
  onProgress: (ev) => console.log(ev.stageId, ev.phase),
});
```

### Pipeline Features

- **Parallel execution:** `parallel: true` on a stage — batches run via `Promise.all`
- **Dependency ordering:** `dependsOn: ["stage-id"]` for explicit ordering
- **Group skipping:** `group: "thumbnail"` + `skipGroup: "thumbnail"` in result
- **Skip remaining:** `skipRemaining: true` halts all remaining stages
- **Retry:** `{ action: "retry", maxRetries: 3, delayMs: 200 }` in error handler
- **Timing middleware:** `createTimingMiddleware((id, ms) => ...)` — wraps stages to log duration
- **Nested pipelines:** `Pipeline((ctx, source) => [...])` + `runPipelineFrom(source, factory)`
- **Shared context:** `sharedSet(ctx.shared, "key", value)` / `sharedGet(ctx.shared, "key")` — type-safe helpers

## Audio & Canvas Utilities

Available from `@vivsh1999/upupload/browser`:

- `audioBufferToWav(buffer)` — convert AudioBuffer to WAV Blob
- `acquireAudioContext(poolKey?)` — pooled AudioContext with ref-counted release
- `isMediaRecorderSupported(mimeType)` — check MediaRecorder support
- `createCanvas(w, h)` — auto OffscreenCanvas or HTMLCanvasElement fallback
- `isOffscreenCanvasSupported()` — feature detection
