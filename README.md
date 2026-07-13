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

| Benchmark                                                            | Ops/sec       | Prev Minor (v0.6.1) | Change     |
| -------------------------------------------------------------------- | ------------- | ------------------- | ---------- |
| fileExtensionLower > .JPG → .jpg                                     | 9,672,053.83  | 11,554,603.95       | 🔴 -1.3%   |
| fileExtensionLower > .Tar.Gz → .gz                                   | 10,234,095.32 | 11,222,305.82       | 🔴 -1.7%   |
| fileExtensionLower > no extension → empty                            | 11,460,243.98 | 11,072,868.36       | 🟢 +3.5%   |
| stem > photo.jpg → photo                                             | 11,576,103.26 | 11,367,995.98       | 🟢 +1.8%   |
| stem > archive.tar.gz → archive.tar                                  | 11,678,465.84 | 11,792,935.65       | 🔴 -1.0%   |
| stem > noext → noext                                                 | 11,310,156.96 | 11,375,677.25       | 🔴 -0.6%   |
| toJpegName > photo.png → photo.jpg                                   | 10,985,980.15 | 10,678,519.49       | 🟢 +2.9%   |
| toJpegName > img.heic → img.jpg                                      | 11,000,638.72 | 11,051,796.00       | 🔴 -0.5%   |
| toThumbName > photo.png → photo.thumb.jpg                            | 10,955,257.61 | 10,625,805.57       | 🟢 +3.1%   |
| toThumbName > img.heic → img.thumb.jpg                               | 11,137,028.80 | 11,197,477.57       | 🔴 -0.5%   |
| info helper > level + message                                        | 14,229,121.40 | 14,452,826.67       | 🔴 -1.5%   |
| info helper > level + message + code                                 | 11,549,527.65 | 11,423,579.29       | 🟢 +1.1%   |
| result helpers > emptyResult                                         | 16,079,838.39 | 16,073,540.52       | 🟢 +0.0%   |
| result helpers > artifact                                            | 65,061.66     | 64,544.39           | 🟢 +0.8%   |
| result helpers > warning                                             | 15,958,793.14 | 10,962,526.60       | 🟢 +45.6%  |
| result helpers > infoMessage                                         | 15,718,238.11 | 10,628,325.45       | 🟢 +47.9%  |
| Semaphore > new Semaphore(4)                                         | 15,149,177.67 | 15,990,439.39       | 🔴 -0.7%   |
| Semaphore > acquire + release — uncontended (concurrency=10, 1 task) | 4,875,504.60  | 4,529,799.09        | 🟢 +7.6%   |
| Semaphore > acquire — contended (concurrency=1, 2 tasks)             | 2,258,762.81  | 2,220,999.14        | 🟢 +1.7%   |
| Semaphore > run() — 10 concurrent resolved promises                  | 265,360.23    | 256,113.20          | 🟢 +3.6%   |
| audioBufferToWav > empty buffer (no samples, mono @ 44100)           | 405,746.95    | 418,972.76          | 🔴 -1.6%   |
| audioBufferToWav > 1 sec mono @ 44100                                | 1,650.98      | 1,599.30            | 🟢 +3.2%   |
| audioBufferToWav > 5 sec stereo @ 48000                              | 296.91        | 152.29              | 🟢 +95.0%  |
| audioBufferToWav > 30 sec stereo @ 44100                             | 57.5258       | 27.34               | 🟢 +110.4% |

### Internal Composition

| Benchmark                                                           | Ops/sec       | Prev Minor (v0.6.1) | Change    |
| ------------------------------------------------------------------- | ------------- | ------------------- | --------- |
| resolvePluginRefs > 5 bare Plugin instances (identity pass-through) | 11,849,108.29 | 12,370,848.54       | 🔴 -1.4%  |
| resolvePluginRefs > 5 PluginRef with opts + .with() merging         | 1,751,384.46  | 1,771,684.24        | 🔴 -1.1%  |
| resolvePluginRefs > 5 PluginRef with defaults (no registry lookup)  | 7,543,689.11  | 8,590,681.55        | 🔴 -1.2%  |
| resolvePipeline > first match (image → photos)                      | 7,103,584.54  | 7,065,080.64        | 🟢 +0.5%  |
| resolvePipeline > nested match (video → media → videos)             | 5,971,556.72  | 5,713,159.66        | 🟢 +4.5%  |
| resolvePipeline > no match (text → null)                            | 9,537,085.92  | 8,302,037.27        | 🟢 +14.9% |
| validatePipeline > validatePipeline (valid)                         | 2,575,019.85  | 2,678,847.95        | 🔴 -1.1%  |
| validatePipeline > validatePipeline (nested, depth 4)               | 1,587,932.37  | 1,594,792.70        | 🔴 -0.4%  |
| compose / stage > stage() by id+run                                 | 16,119,124.26 | 15,946,753.68       | 🟢 +1.1%  |
| compose / stage > compose() 3 defs                                  | 6,536,006.80  | 5,987,023.11        | 🟢 +9.2%  |
| sharedGet / sharedSet > sharedSet + sharedGet                       | 12,556,571.42 | 12,567,721.80       | 🔴 -0.1%  |
| createTimingMiddleware > wrap and run — no callback                 | 1,728,664.33  | 1,754,867.83        | 🔴 -1.5%  |
| createTimingMiddleware > wrap and run — with callback               | 1,685,861.31  | 1,744,445.89        | 🔴 -0.6%  |
| Pipeline factory > Pipeline() — 3 stages                            | 16,067,717.20 | 16,098,163.71       | 🔴 -0.2%  |
| flattenPipeline > 10 flat stages                                    | 3,951,510.64  | 3,918,597.91        | 🟢 +0.8%  |
| flattenPipeline > 3 nested sub-pipelines (depth 3)                  | 5,272,653.61  | 3,283,713.39        | 🟢 +60.6% |
| runPipelineFrom > 3 stages via factory                              | 664,480.39    | 705,411.99          | 🔴 -1.8%  |

### Plugins (Individual)

| Benchmark                                               | Ops/sec       | Prev Minor (v0.6.1) | Change   |
| ------------------------------------------------------- | ------------- | ------------------- | -------- |
| Plugin class > new Plugin() with run shorthand          | 15,740,826.65 | 15,979,608.11       | 🔴 -1.5% |
| Plugin class > Plugin.supports()                        | 20,057,896.23 | 20,090,490.71       | 🔴 -0.2% |
| Plugin class > Plugin.with()                            | 6,007,824.11  | 6,473,308.72        | 🔴 -1.7% |
| Plugin class > Plugin.with() with instanceId            | 5,165,456.44  | 5,301,628.36        | 🔴 -1.2% |
| Plugin class > Plugin.createStages()                    | 1,342,080.84  | 1,347,851.24        | 🔴 -0.4% |
| PluginProvider > new PluginProvider()                   | 1,222,938.17  | 1,134,967.90        | 🟢 +7.8% |
| PluginProvider > PluginProvider camelCase method        | 1,063,865.27  | 1,099,465.79        | 🔴 -0.8% |
| PluginProvider > PluginProvider.getPlugin() — found     | 1,195,875.59  | 1,189,881.90        | 🟢 +0.5% |
| PluginProvider > PluginProvider.getPlugin() — not found | 1,197,648.49  | 1,177,116.31        | 🟢 +1.7% |

### Plugins (Pipeline Composition)

| Benchmark                                                     | Ops/sec      | Prev Minor (v0.6.1) | Change   |
| ------------------------------------------------------------- | ------------ | ------------------- | -------- |
| runPipeline > 7 async stages (like real pipeline)             | 125.77       | 124.64              | 🟢 +0.9% |
| runPipeline > 7 stages with half skipped (when returns false) | 220.84       | 219.10              | 🟢 +0.8% |
| runPipeline > stage error → onError fallback                  | 292.88       | 291.52              | 🟢 +0.5% |
| runPipeline > stage error → onError skip                      | 297.07       | 295.05              | 🟢 +0.7% |
| pipeline control flow > skipGroup                             | 899,761.25   | 936,288.71          | 🔴 -0.6% |
| pipeline control flow > skipRemaining                         | 1,400,179.32 | 1,409,887.61        | 🔴 -0.7% |
| pipeline control flow > removeFromQueue                       | 1,398,479.82 | 1,402,209.94        | 🔴 -0.3% |
| parallel stages > 3 parallel stages                           | 600,059.78   | 589,604.19          | 🟢 +1.8% |
| dependsOn > 2 stages with dependsOn                           | 803,206.42   | 796,193.26          | 🟢 +0.9% |

<!-- benchmarks:end -->
