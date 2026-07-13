# @vivsh1999/upupload

Client-first, multi-stage file uploader/processor with a **plugin architecture** for custom processing.

- **Background Web Worker Threading** — Offload intensive image scaling/compression entirely to a Web Worker via `useWorker: true`
- **Progressive Memory Garbage Collection** — Auto-purges file buffers and revokes object URLs on successful uploads to keep RAM clean
- **Pre-built Upload Adapters** — Zero-dependency, tree-shakable standard HTTP & S3/R2 presigned URL upload adapters
- Pipeline engine handles validation, original passthrough, video posters, and safe fallback
- **Plugin system** — every file-type-specific processor is a separate, tree-shakeable plugin
- Ships built-in plugins: `rawToJpeg` (RAW/HEIC/TIFF), `jpegCompressor` (compress/thumbnail), `videoPoster`
- **Zero-cost imports** — plugins are tree-shaken at the bundler level; pay only for what you use
- **No auto-installed heavy deps** — plugin dependencies are never installed unless you add them
- TypeScript-native, fully typed

---

## Who Is This For?

| You want to…                                                                  | Start here                                                                       |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| **Use built-in plugins (or none at all)** to process images/video in your app | [Quick Start](#quick-start) ↓                                                    |
| **Write your own custom plugin** for a specific file type or processing step  | [Custom Plugins](#custom-plugins) ↓ & [docs/plugins.md](docs/plugins.md)         |
| **Publish a plugin** for the community (open-source extension)                | [Publishing Plugins](#publishing-plugins) ↓ & [docs/plugins.md](docs/plugins.md) |
| **Contribute to the repo itself** — fix bugs, add features, improve docs      | [CONTRIBUTING.md](CONTRIBUTING.md)                                               |

---

## Agent Skills

Install the UpUpload agent skill for AI-powered guidance on plugin configuration, React hook usage, custom plugin development, and more:

```sh
npx skills add vivsh1999/upupload
```

Works with OpenCode, Claude Code, Cursor, Codex, and 50+ other coding agents.

---

## Installation

```sh
npm add @vivsh1999/upupload
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

---

## Entry Points

| Path                                          | Environment | Contents                                                 | Bundle cost |
| --------------------------------------------- | ----------- | -------------------------------------------------------- | ----------- |
| `@vivsh1999/upupload`                         | Browser     | Re-exports core (pipeline engine, types, result helpers) | —           |
| `@vivsh1999/upupload/browser`                 | Browser     | Pipeline, allowlist, audio/canvas utils, plugins         | 8 kB        |
| `@vivsh1999/upupload/core`                    | Universal   | Generic pipeline engine, types, result helpers           | 1 kB        |
| `@vivsh1999/upupload/react`                   | Browser     | `useFileUpload` React hook                               | 60 kB       |
| `@vivsh1999/upupload/adapters`                | Browser     | Pre-built fetch & S3/R2 upload adapters                  | 5 kB        |
| `@vivsh1999/upupload/server`                  | Node        | Server entry (minimal)                                   | < 1 kB      |
| `@vivsh1999/upupload/plugins`                 | Browser     | Barrel re-export of all plugins                          | N/A         |
| `@vivsh1999/upupload/plugins/jpeg-compressor` | Browser     | JPEG/PNG/WebP compressor plugin                          | +4 kB       |
| `@vivsh1999/upupload/plugins/raw-to-jpeg`     | Browser     | RAW/HEIC/TIFF decoder plugin                             | +12 kB      |
| `@vivsh1999/upupload/plugins/video-poster`    | Browser     | Video poster frame plugin                                | +6 kB       |
| `@vivsh1999/upupload/plugins/testing`         | Browser     | Plugin test utilities                                    | +1 kB       |
| `@vivsh1999/upupload/preset`                  | Browser     | Zero-config `upload()` with auto-detected plugins        | +13 kB      |

Only the specific plugin path you import is added to your bundle.

---

## Quick Start

### React (with built-in plugins)

```tsx
import { useFileUpload } from "@vivsh1999/upupload/react";
import { jpegCompressor } from "@vivsh1999/upupload/plugins";

function Uploader() {
  const {
    getDropTargetProps,
    getFileInputProps,
    queue,
    startUpload,
    cancelUpload,
    isDragOver,
    isBusy,
  } = useFileUpload({
    plugins: [jpegCompressor.with({ quality: 80, maxSizeMB: 1 })],
    uploadAdapter: async (artifact, { onProgress, fileId, totalArtifacts, artifactIndex }) => {
      for (let pct = 0; pct <= 100; pct += 10) {
        await new Promise((r) => setTimeout(r, 10));
        onProgress(pct);
      }
      await fetch("/api/upload", { method: "POST", body: artifact.blob });
    },
  });
  return (
    <div {...getDropTargetProps()} style={{ border: isDragOver ? "2px dashed blue" : "" }}>
      <input {...getFileInputProps()} />
      {queue.map((item) => (
        <div key={item.id}>
          {!item.needsReselect && <img src={item.previewUrl} alt="" width={40} />}
          {item.name} — {item.status} ({item.progress}%)
          {item.status === "error" && !item.needsReselect && (
            <button onClick={() => cancelUpload(item.id)}>Cancel</button>
          )}
        </div>
      ))}
      <button onClick={() => startUpload()} disabled={isBusy}>
        Upload
      </button>
    </div>
  );
}
```

### React (no plugins — validation + original passthrough only)

```tsx
import { useFileUpload } from "@vivsh1999/upupload/react";

function Uploader() {
  const { getDropTargetProps, getFileInputProps, queue, startUpload } =
    useFileUpload();
  // No plugins passed — files pass through validation only.
  // Queue items will have 1 artifact: variant "original".
  return (/* … */);
}
```

### Vanilla JS (with built-in plugins)

```js
import { runDefaultBrowserPipeline } from "@vivsh1999/upupload/browser";
import { jpegCompressor } from "@vivsh1999/upupload/plugins";

const result = await runDefaultBrowserPipeline(source, opts, {
  plugins: [jpegCompressor.with({ quality: 80, maxSizeMB: 1 })],
});
```

### Vanilla JS (no plugins)

```js
import { runDefaultBrowserPipeline } from "@vivsh1999/upupload/browser";

const result = await runDefaultBrowserPipeline({ file, name: file.name, type: file.type }, {});
// result.artifacts has 1 item: variant "original"
```

### Preset (zero-config)

```ts
import { upload } from "@vivsh1999/upupload/preset";

const result = await upload(file, { quality: 80 });
```

### React Hook Options

The hook accepts a `UseFileUploadOptions<TMeta, TPreload>` object. Key options:

| Option                             | Description                                                               |
| ---------------------------------- | ------------------------------------------------------------------------- |
| `plugins`                          | Processing plugins to apply                                               |
| `pipeline`                         | `PipelineDef[]` for per-type routing                                      |
| `pipelineConfig`                   | Pass `{ logLevel: "debug" }` for verbose console output                   |
| `uploadAdapter`                    | Function that receives each artifact and its helpers                      |
| `tuning.maxConcurrency`            | Pipeline parallelism (default: CPU count, capped at 4)                    |
| `tuning.maxUploadConcurrency`      | Upload adapter parallelism (defaults to `maxConcurrency`)                 |
| `maxQueuedUploads`                 | Backpressure limit for `"uploading"` state                                |
| `maxFileSize`                      | Reject files over N bytes                                                 |
| `maxTotalBatchSize`                | Reject if total batch exceeds N bytes                                     |
| `maxNumberOfFiles`                 | Cap on total queue items                                                  |
| `persistence`                      | `"memory"` or `"indexeddb"` (survives page reload)                        |
| `storageKeyPrefix`                 | Isolate IndexedDB database name                                           |
| `retryMode`                        | `"pipeline"` (default) or `"adapter-only"` (skip re-compression on retry) |
| `autoPreventTabClose`              | Prevent tab close during processing                                       |
| `autoPauseOnOffline`               | Auto-pause on network disconnect                                          |
| `autoWakeLock`                     | Prevent screen sleep during upload                                        |
| `getMeta`                          | Attach custom metadata (`TMeta`) to each queue item                       |
| `getPipelineContextMeta`           | Inject values into every file's pipeline shared context                   |
| `onBeforeStart`                    | Batch pre-processing hook, returns `TPreload` for adapter                 |
| `onFileProcessed`                  | Fires after pipeline, before upload                                       |
| `onFileComplete`                   | Fires after pipeline + upload complete                                    |
| `onBatchComplete`                  | Cumulated stats when batch finishes                                       |
| `onBatchProgress`                  | Live progress during batch processing/uploads                             |
| `onInfo` / `onWarning` / `onError` | Structured logging and error callbacks                                    |

Queue items are a **discriminated union** — when restored from IndexedDB after page reload, `needsReselect: true` and `file` is unavailable. Check `item.needsReselect` before accessing `item.file`.

Full reference: [docs/react.md](docs/react.md)

### uploadAdapter

The `uploadAdapter` replaces manual `onFileComplete` iteration and provides helper fields:

```tsx
useFileUpload<{ sessionId: string }, { token: string }>({
  plugins: [jpegCompressor.with({ quality: 80 })],
  onBeforeStart: async (files) => {
    const res = await fetch("/api/bulk-init", { method: "POST" });
    return { token: await res.text() };
  },
  uploadAdapter: async (
    artifact,
    { onProgress, signal, fileId, totalArtifacts, artifactIndex, batch },
  ) => {
    // artifact: { variant, blob, filename, filetype }
    // onProgress(0-100) — updates the queue item's progress
    // signal — honour cancellation
    // fileId, totalArtifacts, artifactIndex — per-file context
    // batch.files, batch.batchId, batch.preload.token — batch context
    for (let pct = 0; pct <= 100; pct += 10) {
      await new Promise((r) => setTimeout(r, 10));
      if (signal?.aborted) return;
      onProgress(pct);
    }
    await fetch("/api/upload", { method: "POST", body: artifact.blob });
  },
});
```

For custom upload without the hook, use the core result helpers:

```ts
import { upload } from "@vivsh1999/upupload/preset";
const result = await upload(file, { quality: 80 });
for (const artifact of result.artifacts) {
  await fetch("/api/upload", {
    method: "POST",
    body: artifact.file,
    headers: { "Content-Type": artifact.filetype },
  });
}
```

---

## File Processing Flow (React Hook)

When you call `startUpload()`, files go through three throttle-controlled stages:

```
Input → queue (idle)
         │
         ▼
┌──────────────────────────────────────────┐
│ 1. Pipeline Processing (maxConcurrency)  │  ← compression, transcoding
│    • Each file acquires a semaphore slot │     (0 – pipelineEndProgress%)
│    • Progress derived from completed     │
│    • stages / total stages × 90          │
│    • Multiple files processed in parallel│
│    • Plugins run sequentially per file   │
└──────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────┐
│ 2. Upload Adapter (per file, sequential) │  ← your adapter sends artifacts
│    • Called once per artifact            │     (pipelineEndProgress – 99%)
│    • All artifacts of a file are sent    │
│      sequentially (one at a time)        │
│    • Adapter receives batch context      │
│      via `helpers.batch`                 │
└──────────────────────────────────────────┘
         │
         ▼
    File marked "complete"  →  onFileComplete fires
```

### Throttles (three independent controls)

| Setting                       | Controls                                                                                    | Default                                       |
| ----------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `tuning.maxConcurrency`       | How many files run the **pipeline** simultaneously                                          | `navigator.hardwareConcurrency` (capped at 4) |
| `tuning.maxUploadConcurrency` | How many files upload **artifacts** simultaneously                                          | Same as `maxConcurrency`                      |
| `maxQueuedUploads`            | Backpressure: how many files can be in **"uploading"** state at once before new files pause | Unlimited                                     |

**Important:** `maxConcurrency` and `maxUploadConcurrency` are independent semaphores.

- Four files could be processing pipelines while two others are uploading artifacts.
- `maxQueuedUploads` is a global ceiling on the number of files in `"uploading"` state.
  When hit, files that have finished processing will **not** start uploading until a slot frees up.

### retryUpload lifecycle

`retryUpload(fileId)` re-runs **only** the upload adapter — the pipeline
(compression, transcoding, etc.) is **not** re-executed. The existing
artifacts from the original processing are re-used. This means:

- The adapter must be **idempotent**: it may receive the same artifact blob
  across multiple `retryUpload` calls.
- If the pipeline failed (no artifacts), `retryUpload` returns early (no-op).
  Call `retry(fileId)` instead to reset the file to `"idle"` and re-process
  it through the full pipeline.

### retryMode

Set `retryMode: "adapter-only"` on the hook so `retry(fileId)` skips
re-compression and re-runs only the upload adapter when artifacts exist.
Falls back to full re-processing if no artifacts are available.

---

## Custom Plugins

Write your own plugin to handle file types or processing that the built-in plugins don't cover.

### Minimal Example

```ts
import { Plugin } from "@vivsh1999/upupload/plugins";
import { artifact } from "@vivsh1999/upupload/core";

const watermark = new Plugin<{ opacity: number }>({
  id: "watermark",
  name: "Watermark Plugin",
  options: { opacity: 0.5 },
  supports: (file) => file.type?.startsWith("image/") ?? false,
  run: async (input, opts, classif, ctx) => {
    // opts.opacity is typed as number
    // classif.stemName, classif.ext — file metadata
    // ctx.shared — inter-plugin communication
    // ctx.log(level, message, extra?) — structured logging
    // ctx.signal?: AbortSignal — cancellation support
    // ctx.reportProgress(percent) — surface progress during long ops
    return artifact("watermarked", input.file, classif.stemName + ".jpg", "image/jpeg");
  },
});
```

Register it like any built-in plugin:

```ts
useFileUpload({ plugins: [watermark.with({ opacity: 0.3 })] });
```

### Build a Thumbnail Plugin

A common use case is generating a smaller thumbnail variant alongside a full-size output. Here's a complete plugin that creates a 150×150 JPEG thumbnail using the Canvas API:

```ts
import { Plugin } from "@vivsh1999/upupload/plugins";
import { artifact, emptyResult } from "@vivsh1999/upupload/core";

interface ThumbnailOpts {
  /** Max width/height in pixels. Default: 150 */
  size?: number;
}

const thumbnailPlugin = new Plugin<ThumbnailOpts>({
  id: "thumbnail",
  name: "Thumbnail Generator",
  options: { size: 150 },
  supports: (file) => file.type?.startsWith("image/") ?? false,
  run: async (input, opts, classif, ctx) => {
    if (typeof OffscreenCanvas === "undefined") return emptyResult();

    const img = await createImageBitmap(input.file);
    const scale = Math.min(opts.size / img.width, opts.size / img.height, 1);
    const w = Math.round(img.width * scale);
    const h = Math.round(img.height * scale);

    ctx.reportProgress?.(50); // surface progress

    const canvas = new OffscreenCanvas(w, h);
    const ctx2d = canvas.getContext("2d")!;
    ctx2d.drawImage(img, 0, 0, w, h);
    img.close();

    const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.85 });
    return artifact("thumb", blob, `${classif.stemName}-thumb.jpg`, "image/jpeg");
  },
});

// Usage:
useFileUpload({
  plugins: [
    jpegCompressor.with({ variant: "full", quality: 80 }),
    thumbnailPlugin.with({ size: 150 }),
  ],
  // uploadAdapter receives both "full" and "thumb" artifacts per file
  uploadAdapter: async (artifact, helpers) => {
    if (artifact.variant === "thumb") {
      // upload to thumbnail bucket
    } else {
      // upload full-size
    }
  },
});
```

> **Tip for multi-artifact setups:** Each plugin variant produces a separate artifact. The `uploadAdapter` receives one call per artifact with `artifactIndex` and `totalArtifacts`, letting you coordinate uploads.

Full guide: [docs/plugins.md](docs/plugins.md) — covers `createStages` for multi-stage plugins, shared context patterns, `after`/`before` ordering, error handling, and testing.

Real example: [`examples/vanilla-html/custom-pipeline.js`](examples/vanilla-html/custom-pipeline.js) — a metadata-annotator plugin that reads image dimensions and writes JSON.

---

## Publishing Plugins

If you've built a plugin others can use, publish it as a standalone npm package. See [docs/plugins.md#publishing-a-plugin](docs/plugins.md#publishing-a-plugin) for the full checklist: naming conventions, `supports()` contract, shared keys, tree-shaking setup, JSR compliance, and testing requirements.

---

## Documentation

| Topic                                               | File                                                                                                     |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Pipeline engine (stages, features, utilities)       | [docs/pipeline.md](docs/pipeline.md)                                                                     |
| Plugin system (using, writing, publishing, testing) | [docs/plugins.md](docs/plugins.md)                                                                       |
| React hook (useFileUpload, options, return value)   | [docs/react.md](docs/react.md)                                                                           |
| Configuration reference (all types)                 | [docs/configuration.md](docs/configuration.md)                                                           |
| Case study: e-commerce product photography          | [docs/case-studies/ecommerce-product-photography.md](docs/case-studies/ecommerce-product-photography.md) |
| Case study: wedding photography client proofing     | [docs/case-studies/wedding-photography-uploader.md](docs/case-studies/wedding-photography-uploader.md)   |
| Case study: podcast audio publishing                | [docs/case-studies/podcast-audio-publishing.md](docs/case-studies/podcast-audio-publishing.md)           |

## Decoder Dependencies

The `rawToJpeg` plugin optionally imports decoders at runtime:

| Package       | Format                           | Strategy                                |
| ------------- | -------------------------------- | --------------------------------------- |
| `libraw-wasm` | Camera RAW (CR3, DNG, NEF, ARW…) | Web Worker + WASM                       |
| `heic-decode` | HEIC/HEIF                        | Raw pixels, smaller bundle              |
| `heic2any`    | HEIC/HEIF                        | Fallback when `heic-decode` unavailable |
| `utif`        | TIFF                             | Decodes to RGBA → JPEG                  |

```sh
npm add libraw-wasm heic-decode utif
```

## Examples

- [`examples/vanilla-html`](./examples/vanilla-html) — basic pipeline + custom pipeline with a metadata-annotator plugin. Demonstrates writing a `Plugin` class from scratch, composing multiple plugins, and inspecting the result.
- [`examples/tanstack-start`](./examples/tanstack-start) — TanStack Start app with TUS uploads and the React hook. Shows end-to-end upload with the `useFileUpload` hook.

<!-- benchmarks:start -->

## Benchmarks

Autogenerated from `vitest bench` (via GitHub Actions — pushed to main).

### Internal Components

| Benchmark                                                            | Ops/sec       | Prev Minor (v0.7.0) | Change     |
| -------------------------------------------------------------------- | ------------- | ------------------- | ---------- |
| fileExtensionLower > .JPG → .jpg                                     | 9,900,976.10  | 10,841,804.70       | 🔴 -0.9%   |
| fileExtensionLower > .Tar.Gz → .gz                                   | 9,720,214.27  | 11,442,844.47       | 🔴 -0.8%   |
| fileExtensionLower > no extension → empty                            | 11,338,658.57 | 11,584,114.31       | 🔴 -0.9%   |
| stem > photo.jpg → photo                                             | 11,571,708.15 | 11,900,961.90       | 🔴 -1.2%   |
| stem > archive.tar.gz → archive.tar                                  | 11,408,783.43 | 11,889,594.98       | 🔴 -1.1%   |
| stem > noext → noext                                                 | 11,433,182.56 | 11,944,255.21       | 🔴 -1.3%   |
| toJpegName > photo.png → photo.jpg                                   | 9,963,567.88  | 10,795,370.53       | 🔴 -1.2%   |
| toJpegName > img.heic → img.jpg                                      | 9,913,097.90  | 10,755,235.29       | 🔴 -1.7%   |
| toThumbName > photo.png → photo.thumb.jpg                            | 9,862,019.68  | 10,971,740.22       | 🔴 -0.7%   |
| toThumbName > img.heic → img.thumb.jpg                               | 10,155,844.40 | 10,920,338.76       | 🔴 -1.0%   |
| info helper > level + message                                        | 14,099,610.25 | 14,171,339.92       | 🔴 -0.5%   |
| info helper > level + message + code                                 | 11,137,464.44 | 11,363,970.57       | 🔴 -0.8%   |
| audioBufferToWav > empty buffer (no samples, mono @ 44100)           | 429,968.42    | 398,490.12          | 🟢 +7.9%   |
| audioBufferToWav > 1 sec mono @ 44100                                | 1,666.30      | 1,619.80            | 🟢 +2.9%   |
| audioBufferToWav > 5 sec stereo @ 48000                              | 327.38        | 153.26              | 🟢 +113.6% |
| audioBufferToWav > 30 sec stereo @ 44100                             | 59.4958       | 27.32               | 🟢 +117.7% |
| Semaphore > new Semaphore(4)                                         | 15,933,005.75 | 16,071,092.62       | 🔴 -0.9%   |
| Semaphore > acquire + release — uncontended (concurrency=10, 1 task) | 4,898,749.74  | 4,821,139.48        | 🟢 +1.6%   |
| Semaphore > acquire — contended (concurrency=1, 2 tasks)             | 2,321,308.76  | 2,279,232.42        | 🟢 +1.8%   |
| Semaphore > run() — 10 concurrent resolved promises                  | 266,143.66    | 255,743.02          | 🟢 +4.1%   |
| result helpers > emptyResult                                         | 16,119,026.71 | 16,080,444.87       | 🟢 +0.2%   |
| result helpers > artifact                                            | 64,355.27     | 64,100.92           | 🟢 +0.4%   |
| result helpers > warning                                             | 15,786,369.68 | 11,768,648.87       | 🟢 +34.1%  |
| result helpers > infoMessage                                         | 16,032,258.27 | 11,548,397.42       | 🟢 +38.8%  |

### Internal Composition

| Benchmark                                                           | Ops/sec       | Prev Minor (v0.7.0) | Change    |
| ------------------------------------------------------------------- | ------------- | ------------------- | --------- |
| resolvePluginRefs > 5 bare Plugin instances (identity pass-through) | 12,371,499.85 | 12,339,108.40       | 🟢 +0.3%  |
| resolvePluginRefs > 5 PluginRef with opts + .with() merging         | 1,774,033.06  | 1,711,032.18        | 🟢 +3.7%  |
| resolvePluginRefs > 5 PluginRef with defaults (no registry lookup)  | 8,215,908.96  | 8,569,433.11        | 🔴 -0.5%  |
| resolvePipeline > first match (image → photos)                      | 7,654,550.09  | 8,007,321.98        | 🔴 -1.7%  |
| resolvePipeline > nested match (video → media → videos)             | 6,000,089.95  | 6,428,278.23        | 🔴 -1.7%  |
| resolvePipeline > no match (text → null)                            | 8,527,283.40  | 8,941,202.64        | 🔴 -1.6%  |
| validatePipeline > validatePipeline (valid)                         | 2,575,145.73  | 2,324,845.63        | 🟢 +10.8% |
| validatePipeline > validatePipeline (nested, depth 4)               | 1,571,623.87  | 1,551,038.41        | 🟢 +1.3%  |
| compose / stage > stage() by id+run                                 | 16,077,948.75 | 16,021,603.04       | 🟢 +0.4%  |
| compose / stage > compose() 3 defs                                  | 6,329,083.16  | 5,777,696.73        | 🟢 +9.5%  |
| sharedGet / sharedSet > sharedSet + sharedGet                       | 12,294,472.06 | 11,962,210.73       | 🟢 +2.8%  |
| createTimingMiddleware > wrap and run — no callback                 | 1,744,539.86  | 1,779,031.47        | 🔴 -0.7%  |
| createTimingMiddleware > wrap and run — with callback               | 1,666,053.85  | 1,716,671.06        | 🔴 -0.9%  |
| Pipeline factory > Pipeline() — 3 stages                            | 15,105,454.91 | 16,034,097.23       | 🔴 -1.5%  |
| flattenPipeline > 10 flat stages                                    | 3,895,511.10  | 3,923,604.28        | 🔴 -0.7%  |
| flattenPipeline > 3 nested sub-pipelines (depth 3)                  | 5,073,542.86  | 3,499,317.27        | 🟢 +45.0% |
| runPipelineFrom > 3 stages via factory                              | 692,596.59    | 708,925.92          | 🔴 -1.5%  |

### Plugins (Individual)

| Benchmark                                               | Ops/sec       | Prev Minor (v0.7.0) | Change   |
| ------------------------------------------------------- | ------------- | ------------------- | -------- |
| Plugin class > new Plugin() with run shorthand          | 15,736,305.37 | 16,055,963.07       | 🔴 -1.2% |
| Plugin class > Plugin.supports()                        | 19,445,541.46 | 19,950,578.72       | 🔴 -0.9% |
| Plugin class > Plugin.with()                            | 6,796,073.84  | 6,517,389.47        | 🟢 +4.3% |
| Plugin class > Plugin.with() with instanceId            | 5,455,943.35  | 5,460,908.49        | 🔴 -0.1% |
| Plugin class > Plugin.createStages()                    | 1,311,506.41  | 1,326,118.72        | 🔴 -1.1% |
| PluginProvider > new PluginProvider()                   | 1,194,660.97  | 1,177,855.43        | 🟢 +1.4% |
| PluginProvider > PluginProvider camelCase method        | 1,115,565.00  | 1,079,219.25        | 🟢 +3.4% |
| PluginProvider > PluginProvider.getPlugin() — found     | 1,191,236.49  | 1,156,143.68        | 🟢 +3.0% |
| PluginProvider > PluginProvider.getPlugin() — not found | 1,187,171.43  | 1,161,200.96        | 🟢 +2.2% |

### Plugins (Pipeline Composition)

| Benchmark                                                     | Ops/sec      | Prev Minor (v0.7.0) | Change   |
| ------------------------------------------------------------- | ------------ | ------------------- | -------- |
| runPipeline > 7 async stages (like real pipeline)             | 126.42       | 128.52              | 🔴 -1.6% |
| runPipeline > 7 stages with half skipped (when returns false) | 221.13       | 220.89              | 🟢 +0.1% |
| runPipeline > stage error → onError fallback                  | 295.30       | 293.79              | 🟢 +0.5% |
| runPipeline > stage error → onError skip                      | 298.24       | 297.38              | 🟢 +0.3% |
| pipeline control flow > skipGroup                             | 887,017.64   | 908,274.81          | 🔴 -1.5% |
| pipeline control flow > skipRemaining                         | 1,356,382.28 | 1,383,768.92        | 🔴 -0.7% |
| pipeline control flow > removeFromQueue                       | 1,357,879.96 | 1,296,090.70        | 🟢 +4.8% |
| parallel stages > 3 parallel stages                           | 593,892.33   | 586,368.51          | 🟢 +1.3% |
| dependsOn > 2 stages with dependsOn                           | 830,520.31   | 785,853.61          | 🟢 +5.7% |

<!-- benchmarks:end -->
