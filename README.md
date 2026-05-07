# @vivsh1999/upupload

Client-first, multi-stage media uploader/processor with a **plugin architecture** for custom file processing.

- Pipeline engine handles validation, original passthrough, video posters, and safe fallback
- **Plugin system** — every file-type-specific processor is a separate, tree-shakeable plugin
- Ships two processing plugins: `raw-to-jpeg` (RAW/HEIC/TIFF) and `jpeg-compressor` (compress/thumbnail)
- **Zero-cost imports** — plugins are tree-shaken at the bundler level; pay only for what you use
- **No auto-installed heavy deps** — plugin dependencies (`browser-image-compression`, `libraw-wasm`) are never installed unless you add them
- Optional decoder dependencies (HEIC/HEIF, TIFF, LibRaw WASM) loaded via runtime imports
- TypeScript-native, fully typed

## Installation

```sh
npm add @vivsh1999/upupload
# or
pnpm add @vivsh1999/upupload
```

The package itself has zero image-processing dependencies on first install.

### Plugin dependencies (install only what you need)

```sh
# For JPEG/PNG/WebP compression
npm add browser-image-compression

# For RAW camera files (CR3, DNG, NEF, ARW…)
npm add libraw-wasm

# Optional: for HEIC/HEIF / TIFF decode via the raw-to-jpeg plugin
npm add heic-decode heic2any utif
```

## Entry Points

| Path                                          | Environment | Contents                                      | Bundle cost |
| --------------------------------------------- | ----------- | --------------------------------------------- | ----------- |
| `@vivsh1999/upupload`                         | Browser     | Re-exports core + browser                     | —           |
| `@vivsh1999/upupload/browser`                 | Browser     | Pipeline, allowlist, TUS upload, plugin types | 8 kB        |
| `@vivsh1999/upupload/core`                    | Universal   | Generic pipeline engine and types (no DOM)    | 1 kB        |
| `@vivsh1999/upupload/react`                   | Browser     | `useMediaUpload` React hook                   | 60 kB       |
| `@vivsh1999/upupload/server`                  | Node        | Server entry (minimal)                        | < 1 kB      |
| `@vivsh1999/upupload/plugins`                 | Browser     | Barrel re-export of all plugins               | N/A         |
| `@vivsh1999/upupload/plugins/jpeg-compressor` | Browser     | JPEG/PNG/WebP compressor plugin               | +4 kB       |
| `@vivsh1999/upupload/plugins/raw-to-jpeg`     | Browser     | RAW/HEIC/TIFF decoder plugin                  | +12 kB      |

Only the specific plugin path you import is added to your bundle.

## Quick Start (React)

```tsx
import { useMediaUpload } from "@vivsh1999/upupload/react";
import { createJpegCompressorPlugin } from "@vivsh1999/upupload/plugins/jpeg-compressor";

function Uploader() {
  const { getDropTargetProps, getFileInputProps, queue, startUpload, isDragOver, cancelUpload } =
    useMediaUpload({
      plugins: [createJpegCompressorPlugin()],
      transport: "tus",
      tus: { endpoint: "/api/tus" },
      // Generic metadata — each file gets an id
      getMeta: (file) => ({ uploadedAt: Date.now() }),
    });

  return (
    <div
      {...getDropTargetProps()}
      style={{ border: isDragOver ? "2px dashed blue" : "2px dashed gray" }}
    >
      <input {...getFileInputProps()} />
      {queue.map((item) => (
        <div key={item.id}>
          {item.name} — {item.status} ({item.progress}%)
          {item.previewUrl && <img src={item.previewUrl} alt="" width={80} />}
          {item.status === "error" && <button onClick={() => cancelUpload(item.id)}>Cancel</button>}
        </div>
      ))}
      <button onClick={() => startUpload()}>Upload</button>
    </div>
  );
}
```

## Quick Start (Vanilla JS)

```js
import { runDefaultBrowserPipeline } from "@vivsh1999/upupload/browser";
import { createJpegCompressorPlugin } from "@vivsh1999/upupload/plugins/jpeg-compressor";

const result = await runDefaultBrowserPipeline(source, opts, {
  plugins: [createJpegCompressorPlugin()],
});
```

## Pipeline Engine

Built-in stages run in this order:

| Stage                        | Condition                      | What it does                                     |
| ---------------------------- | ------------------------------ | ------------------------------------------------ |
| `validate-allowlist`         | Always                         | Rejects non-media files (exe, txt, etc.)         |
| `original`                   | `saveOriginal: true`           | Passes source file through as `original` variant |
| `video-poster-thumbnail`     | `saveThumbnails: true` + video | Extracts a JPEG poster frame as `thumbnail`      |
| _plugin stages_              | Per plugin `supports()`        | Stages contributed by matched plugins            |
| `final-fallback-to-original` | `fallbackToOriginal: true`     | Uploads original for video/audio/SVG             |

### Pipeline Features

- **Shared context bag** (`ctx.shared: Map<string, unknown>`) — stages and plugins communicate by reading/writing shared keys
- **AbortSignal support** — pipelines and uploads can be cancelled mid-flight
- **Stage middleware** — `PipelineDefinition.middleware` transforms every stage (timing, monitoring, etc.)
- **Progress events** — `PipelineOptions.onProgress` fires `start`/`end` per stage
- **Retry on error** — error handler supports `{ action: "retry"; maxRetries; delayMs? }`
- **Accumulated result in `when()`** — stage guards receive the current accumulated `PipelineResult`

### Pipeline Utilities

```ts
import { compose, stage, createTimingMiddleware } from "@vivsh1999/upupload/core";

// Compose multiple definitions into one
const fullDef = compose(def1, def2);

// Wrap a single stage as a definition
const def = stage({ id: "my-stage", when: () => ({ run: true }), run: async () => ({ ... }) });

// Timing middleware — logs stage duration
const timing = createTimingMiddleware((id, ms) => console.log(`${id} took ${ms}ms`));
```

## Plugin Architecture

### `ProcessingPlugin` Interface

```ts
interface ProcessingPlugin<TOpts = Record<string, unknown>> {
  readonly id: string;
  readonly name: string;
  supports(file: { name: string; type?: string | null }): boolean;
  createStages(
    input: PipelineSource,
    opts: TOpts, // Typed — no cast needed
    classif: FileClassification,
    ctx: PipelineContext, // Logger + shared bag + AbortSignal
  ): PipelineStage<PipelineSource, PipelineResult>[];
  preload?(): void;
}
```

- `supports()` — quick classifier, determines if this plugin handles a file
- `createStages()` — returns pipeline stages for a matched file. The `opts` parameter is fully typed via the generic. `ctx.shared` enables inter-stage communication. `ctx.log` provides structured logging. `ctx.signal` enables cancellation.
- `preload()` — optional, pre-warms decoders/WASM modules. Called at most once per plugin per `preloadBrowserPipelineForFiles` call

### `FileClassification`

```ts
interface FileClassification {
  ext: string;
  mime: string;
  stemName: string;
  isVideo: boolean;
  isAudio: boolean;
  isSvg: boolean;
  size: number; // File size in bytes
  lastModified: number; // Last modified timestamp (ms since epoch)
  meta?: Record<string, unknown>; // Optional custom metadata bag
}
```

### Import Patterns

```ts
// Barrel — imports both plugins
import { createJpegCompressorPlugin, createRawToJpegPlugin } from "@vivsh1999/upupload/plugins";

// Individual — only what you use (tree-shaking)
import { createJpegCompressorPlugin } from "@vivsh1999/upupload/plugins/jpeg-compressor";
```

### Usage Patterns

```ts
// No plugins — only built-in stages
runDefaultBrowserPipeline(source, opts);

// Only JPEG/PNG/WebP compression (no RAW)
runDefaultBrowserPipeline(source, opts, {
  plugins: [createJpegCompressorPlugin()],
});

// With cancellation signal
const controller = new AbortController();
runDefaultBrowserPipeline(source, opts, {
  plugins: [createJpegCompressorPlugin()],
  signal: controller.signal,
});

// React hook
useMediaUpload({ plugins: [createJpegCompressorPlugin()] });
```

### Plugin Stage Order

```
validate-allowlist          [built-in]
original                    [built-in, if saveOriginal]
video-poster-thumbnail      [built-in, if video + saveThumbnails]
--- plugin stages ---       [from matched plugins, in array order]
final-fallback-to-original  [built-in, if fallbackToOriginal]
```

## Built-in Plugins

### `createJpegCompressorPlugin()`

**Import:** `@vivsh1999/upupload/plugins/jpeg-compressor`

Handles standard raster images (JPEG, PNG, WebP, BMP, GIF, AVIF).

- Compresses the image via `browser-image-compression` to produce `optimized` and `thumbnail` JPEG artifacts
- Does NOT handle RAW/HEIC/TIFF — use `createRawToJpegPlugin()` for those
- **Dep:** `browser-image-compression` (install separately)

### `createRawToJpegPlugin()`

**Import:** `@vivsh1999/upupload/plugins/raw-to-jpeg`

Handles camera RAW (CR3, DNG, NEF, ARW, etc.), HEIC/HEIF, and TIFF files.

- Decodes to a raster JPEG using LibRaw WASM / heic-decode / utif
- Compresses the decoded image via `browser-image-compression` to produce `optimized` and `thumbnail` JPEG artifacts
- Shares decode cache between optimized and thumbnail stages (decodes RAW once)
- **Deps:** `libraw-wasm` (required), `heic-decode`/`heic2any`/`utif` (optional)

### Tree-shaking

Neither plugin is included in your bundle unless you explicitly import its sub-path:

```ts
// ✗ Zero cost — no plugin code imported
import { runDefaultBrowserPipeline } from "@vivsh1999/upupload/browser";

// ✓ 4 kB added — only jpeg-compressor code
import { createJpegCompressorPlugin } from "@vivsh1999/upupload/plugins/jpeg-compressor";

// ✓ 12 kB added — only raw-to-jpeg code
import { createRawToJpegPlugin } from "@vivsh1999/upupload/plugins/raw-to-jpeg";
```

## Writing a Custom Plugin

Create an object matching `ProcessingPlugin<TOpts>`. Stages use `input`, `ctx.log`, `ctx.shared`, and share state via the `createStages` closure:

```ts
import type { FileClassification, ProcessingPlugin } from "@vivsh1999/upupload";
import type { DefaultBrowserPipelineOptions } from "@vivsh1999/upupload/browser";

const metadataPlugin: ProcessingPlugin<DefaultBrowserPipelineOptions> = {
  id: "metadata-annotator",
  name: "Metadata Annotator Plugin",
  supports(file) {
    return (file.type ?? "").startsWith("image/");
  },
  createStages(input, opts, classif, ctx) {
    return [
      {
        id: "read-metadata",
        when: () => ({ run: true }),
        run: async () => {
          const img = new Image();
          const url = URL.createObjectURL(input.file);
          await new Promise((resolve) => {
            img.onload = resolve;
            img.src = url;
          });
          URL.revokeObjectURL(url);

          ctx.log("info", `${input.name}: ${img.width}x${img.height}`);
          ctx.shared.set("detected-dimensions", `${img.width}x${img.height}`);

          return {
            artifacts: [
              {
                variant: "metadata",
                file: new Blob([JSON.stringify({ width: img.width, height: img.height })], {
                  type: "application/json",
                }),
                filename: `${classif.stemName}.json`,
                filetype: "application/json",
              },
            ],
            info: [
              { level: "info", message: `${img.width}x${img.height}`, code: "image_metadata" },
            ],
            removeFromQueue: false,
          };
        },
      },
    ];
  },
};
```

See `examples/vanilla-html/custom-pipeline.js` for a complete working example.

### `preloadBrowserPipelineForFiles`

```ts
import { preloadBrowserPipelineForFiles } from "@vivsh1999/upupload/browser";

preloadBrowserPipelineForFiles(
  fileList,
  { saveOptimized: true, saveThumbnails: true },
  { plugins: [createJpegCompressorPlugin()] },
);
```

## Configuration

### `DefaultBrowserPipelineOptions`

```ts
type DefaultBrowserPipelineOptions = {
  saveOriginal: boolean; // default: false
  saveOptimized: boolean; // default: true
  saveThumbnails: boolean; // default: true
  qualityPercent: number; // 1–100, default: 90
  maxLongEdge: number | "original"; // default: 3840
  thumbnailMaxEdge: number; // default: 640
  optimizedMaxSizeMB: number; // default: 1
  thumbnailMaxSizeMB: number; // default: 0.25
  fallbackToOriginal: boolean; // default: true
  debug?: boolean;
};
```

### `UseMediaUploadOptions` (React hook)

```ts
interface UseMediaUploadOptions<TMeta = void> {
  initialConfig?: Partial<DefaultBrowserPipelineOptions>;
  plugins?: ProcessingPlugin[];
  transport?: "tus" | "custom"; // "xhr" removed
  tus?: TusUploadOptions;
  uploadHandler?: MediaUploadCustomUploadHandler;
  maxNumberOfFiles?: number;
  tuning?: MediaUploadTuningOptions; // { simultaneousUploads?: number }
  getMeta?: (file: File) => TMeta; // Per-file metadata
  onInfo?: (message: string) => void;
  onWarning?: (message: string) => void;
  onError?: (error: Error, context?: MediaUploadCustomUploadContext) => void;
  onFileComplete?: (fileName: string) => void;
}
```

### `UseMediaUploadResult` (React hook return)

```ts
interface UseMediaUploadResult<TMeta = void> {
  config: DefaultBrowserPipelineOptions;
  updateConfig: (patch: Partial<DefaultBrowserPipelineOptions>) => void;
  queue: MediaUploadQueueItem<TMeta>[];
  startUpload: (fileIds?: string[]) => Promise<void>; // Selective processing
  clear: () => void;
  retry: (fileId: string) => void;
  cancelUpload: (fileId: string) => void; // Cancel one file
  cancelAll: () => void; // Cancel everything
  isBusy: boolean;
  isDragOver: boolean; // Drag-and-drop visual state
  getDropTargetProps: <T>(props?: T) => T & { onDrop; onDragOver; onDragEnter; onDragLeave };
  getFileInputProps: <T>(props?: T) => T & { type: "file"; multiple: true };
  getFolderInputProps: <T>(props?: T) => T & { type: "file"; multiple: true; webkitdirectory };
}
```

### `MediaUploadQueueItem`

```ts
interface MediaUploadQueueItem<TMeta = void> {
  id: string;
  name: string;
  file: File; // Direct file reference
  status: "idle" | "processing" | "uploading" | "error";
  progress: number; // 0–100
  error?: string;
  previewUrl?: string; // Auto-released on clear/cancel
  meta?: TMeta; // From getMeta()
  artifacts?: {
    // Per-artifact progress
    variant: string;
    filename: string;
    progress: number;
    url?: string; // Blob URL for preview
  }[];
}
```

## Semaphore Utility

Built-in concurrency limiter. Available as a standalone utility:

```ts
import { Semaphore } from "@vivsh1999/upupload/react";

const sem = new Semaphore(4); // max 4 concurrent
await Promise.all(tasks.map((t) => sem.run(() => process(t))));
```

## Pipeline Result

```ts
{
  artifacts: PipelineArtifact[];  // Produced files (variant + file + metadata)
  info: PipelineInfoMessage[];    // Info/warning messages
  removeFromQueue: boolean;       // True for junk files (folder drops)
}
```

Artifact variants: `"original"`, `"optimized"`, `"thumbnail"`.

## Decoder Dependencies

The `raw-to-jpeg` plugin optionally imports decoders at runtime:

| Package       | Format                           | Strategy                                |
| ------------- | -------------------------------- | --------------------------------------- |
| `libraw-wasm` | Camera RAW (CR3, DNG, NEF, ARW…) | Web Worker + WASM                       |
| `heic-decode` | HEIC/HEIF                        | Raw pixels, smaller bundle              |
| `heic2any`    | HEIC/HEIF                        | Fallback when `heic-decode` unavailable |
| `utif`        | TIFF                             | Decodes to RGBA → JPEG                  |

Install any you need:

```sh
npm add libraw-wasm heic-decode utif
```

## Examples

- [`examples/vanilla-html`](./examples/vanilla-html) — two pages:
  - `index.html` — basic pipeline with both plugins
  - `custom-pipeline.html` — both plugins plus a custom `metadata-annotator` plugin
- [`examples/tanstack-start`](./examples/tanstack-start) — TanStack Start app with TUS uploads and the React hook

## Benchmarks

Autogenerated from `vitest bench` (via pre-commit hook).

| Benchmark                                       | Ops/sec       |
| ----------------------------------------------- | ------------- |
| video (MIME match)                              | 13,867,600.92 |
| RAW octet-stream (extension match)              | 7,760,688.48  |
| SVG (MIME match)                                | 13,953,687.30 |
| raster image (MIME match)                       | 13,666,505.56 |
| audio (MIME match)                              | 14,640,528.10 |
| reject (text/plain)                             | 16,078,575.55 |
| by MIME                                         | 7,810,828.16  |
| by extension                                    | 9,533,160.49  |
| false (image)                                   | 9,752,923.41  |
| by MIME                                         | 7,392,811.32  |
| by extension                                    | 10,371,326.49 |
| false (image)                                   | 10,121,306.44 |
| RAW extension — true                            | 2,155,880.18  |
| non-RAW extension — false                       | 10,406,883.63 |
| .heic extension — true                          | 10,763,937.25 |
| image/heif MIME — true                          | 8,364,052.88  |
| false (PNG)                                     | 8,723,039.62  |
| .tif extension — true                           | 10,953,509.26 |
| .tiff extension — true                          | 10,667,540.61 |
| image/tiff MIME — true                          | 8,281,071.55  |
| false (JPEG)                                    | 8,053,863.73  |
| video — true                                    | 7,538,091.79  |
| audio — true                                    | 7,189,850.91  |
| SVG — true                                      | 6,225,137.15  |
| raster PNG — false                              | 5,911,807.35  |
| RAW extension — true                            | 6,013,819.11  |
| raster PNG — true                               | 5,207,878.17  |
| SVG — false                                     | 6,453,190.85  |
| audio — false                                   | 7,530,249.31  |
| 7 async stages (like real pipeline)             | 128.22        |
| 7 stages with half skipped (when returns false) | 224.05        |
| stage error → onError fallback                  | 298.60        |
| stage error → onError skip                      | 300.15        |
