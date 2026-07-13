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
| fileExtensionLower > .JPG → .jpg                                     | 13,694,283.12 | 11,554,603.95       | 🟢 +18.5%  |
| fileExtensionLower > .Tar.Gz → .gz                                   | 13,921,829.77 | 11,222,305.82       | 🟢 +24.1%  |
| fileExtensionLower > no extension → empty                            | 14,491,995.04 | 11,072,868.36       | 🟢 +30.9%  |
| stem > photo.jpg → photo                                             | 15,439,755.41 | 11,367,995.98       | 🟢 +35.8%  |
| stem > archive.tar.gz → archive.tar                                  | 14,967,329.84 | 11,792,935.65       | 🟢 +26.9%  |
| stem > noext → noext                                                 | 14,659,661.68 | 11,375,677.25       | 🟢 +28.9%  |
| toJpegName > photo.png → photo.jpg                                   | 14,084,601.01 | 10,678,519.49       | 🟢 +31.9%  |
| toJpegName > img.heic → img.jpg                                      | 13,658,963.81 | 11,051,796.00       | 🟢 +23.6%  |
| toThumbName > photo.png → photo.thumb.jpg                            | 13,955,744.69 | 10,625,805.57       | 🟢 +31.3%  |
| toThumbName > img.heic → img.thumb.jpg                               | 13,582,487.92 | 11,197,477.57       | 🟢 +21.3%  |
| info helper > level + message                                        | 18,487,648.85 | 14,452,826.67       | 🟢 +27.9%  |
| info helper > level + message + code                                 | 15,500,236.30 | 11,423,579.29       | 🟢 +35.7%  |
| audioBufferToWav > empty buffer (no samples, mono @ 44100)           | 501,496.41    | 418,972.76          | 🟢 +19.7%  |
| audioBufferToWav > 1 sec mono @ 44100                                | 2,054.95      | 1,599.30            | 🟢 +28.5%  |
| audioBufferToWav > 5 sec stereo @ 48000                              | 430.93        | 152.29              | 🟢 +183.0% |
| audioBufferToWav > 30 sec stereo @ 44100                             | 81.7356       | 27.34               | 🟢 +199.0% |
| Semaphore > new Semaphore(4)                                         | 20,024,273.08 | 15,990,439.39       | 🟢 +25.2%  |
| Semaphore > acquire + release — uncontended (concurrency=10, 1 task) | 6,021,211.11  | 4,529,799.09        | 🟢 +32.9%  |
| Semaphore > acquire — contended (concurrency=1, 2 tasks)             | 2,879,073.19  | 2,220,999.14        | 🟢 +29.6%  |
| Semaphore > run() — 10 concurrent resolved promises                  | 280,968.91    | 256,113.20          | 🟢 +9.7%   |
| result helpers > emptyResult                                         | 20,693,475.67 | 16,073,540.52       | 🟢 +28.7%  |
| result helpers > artifact                                            | 84,333.04     | 64,544.39           | 🟢 +30.7%  |
| result helpers > warning                                             | 20,350,526.98 | 10,962,526.60       | 🟢 +85.6%  |
| result helpers > infoMessage                                         | 20,445,509.35 | 10,628,325.45       | 🟢 +92.4%  |

### Internal Composition

| Benchmark                                                           | Ops/sec       | Prev Minor (v0.6.1) | Change     |
| ------------------------------------------------------------------- | ------------- | ------------------- | ---------- |
| resolvePluginRefs > 5 bare Plugin instances (identity pass-through) | 16,078,700.84 | 12,370,848.54       | 🟢 +30.0%  |
| resolvePluginRefs > 5 PluginRef with opts + .with() merging         | 2,357,928.99  | 1,771,684.24        | 🟢 +33.1%  |
| resolvePluginRefs > 5 PluginRef with defaults (no registry lookup)  | 10,747,105.12 | 8,590,681.55        | 🟢 +25.1%  |
| resolvePipeline > first match (image → photos)                      | 10,711,805.89 | 7,065,080.64        | 🟢 +51.6%  |
| resolvePipeline > nested match (video → media → videos)             | 9,381,454.27  | 5,713,159.66        | 🟢 +64.2%  |
| resolvePipeline > no match (text → null)                            | 11,345,878.32 | 8,302,037.27        | 🟢 +36.7%  |
| validatePipeline > validatePipeline (valid)                         | 3,570,863.73  | 2,678,847.95        | 🟢 +33.3%  |
| validatePipeline > validatePipeline (nested, depth 4)               | 2,190,525.94  | 1,594,792.70        | 🟢 +37.4%  |
| compose / stage > stage() by id+run                                 | 20,466,901.26 | 15,946,753.68       | 🟢 +28.3%  |
| compose / stage > compose() 3 defs                                  | 7,803,427.58  | 5,987,023.11        | 🟢 +30.3%  |
| sharedGet / sharedSet > sharedSet + sharedGet                       | 15,334,228.77 | 12,567,721.80       | 🟢 +22.0%  |
| createTimingMiddleware > wrap and run — no callback                 | 2,045,916.73  | 1,754,867.83        | 🟢 +16.6%  |
| createTimingMiddleware > wrap and run — with callback               | 2,046,934.97  | 1,744,445.89        | 🟢 +17.3%  |
| Pipeline factory > Pipeline() — 3 stages                            | 20,568,861.01 | 16,098,163.71       | 🟢 +27.8%  |
| flattenPipeline > 10 flat stages                                    | 4,744,733.05  | 3,918,597.91        | 🟢 +21.1%  |
| flattenPipeline > 3 nested sub-pipelines (depth 3)                  | 6,614,678.41  | 3,283,713.39        | 🟢 +101.4% |
| runPipelineFrom > 3 stages via factory                              | 811,301.16    | 705,411.99          | 🟢 +15.0%  |

### Plugins (Individual)

| Benchmark                                               | Ops/sec       | Prev Minor (v0.6.1) | Change    |
| ------------------------------------------------------- | ------------- | ------------------- | --------- |
| Plugin class > new Plugin() with run shorthand          | 20,332,414.74 | 15,979,608.11       | 🟢 +27.2% |
| Plugin class > Plugin.supports()                        | 24,250,491.76 | 20,090,490.71       | 🟢 +20.7% |
| Plugin class > Plugin.with()                            | 8,811,785.81  | 6,473,308.72        | 🟢 +36.1% |
| Plugin class > Plugin.with() with instanceId            | 7,193,099.86  | 5,301,628.36        | 🟢 +35.7% |
| Plugin class > Plugin.createStages()                    | 1,435,360.86  | 1,347,851.24        | 🟢 +6.5%  |
| PluginProvider > new PluginProvider()                   | 1,616,700.34  | 1,134,967.90        | 🟢 +42.4% |
| PluginProvider > PluginProvider camelCase method        | 1,499,595.90  | 1,099,465.79        | 🟢 +36.4% |
| PluginProvider > PluginProvider.getPlugin() — found     | 1,606,616.89  | 1,189,881.90        | 🟢 +35.0% |
| PluginProvider > PluginProvider.getPlugin() — not found | 1,624,565.04  | 1,177,116.31        | 🟢 +38.0% |

### Plugins (Pipeline Composition)

| Benchmark                                                     | Ops/sec      | Prev Minor (v0.6.1) | Change    |
| ------------------------------------------------------------- | ------------ | ------------------- | --------- |
| runPipeline > 7 async stages (like real pipeline)             | 127.13       | 124.64              | 🟢 +2.0%  |
| runPipeline > 7 stages with half skipped (when returns false) | 223.46       | 219.10              | 🟢 +2.0%  |
| runPipeline > stage error → onError fallback                  | 297.44       | 291.52              | 🟢 +2.0%  |
| runPipeline > stage error → onError skip                      | 301.22       | 295.05              | 🟢 +2.1%  |
| pipeline control flow > skipGroup                             | 1,205,470.55 | 936,288.71          | 🟢 +28.7% |
| pipeline control flow > skipRemaining                         | 1,575,017.40 | 1,409,887.61        | 🟢 +11.7% |
| pipeline control flow > removeFromQueue                       | 1,755,607.71 | 1,402,209.94        | 🟢 +25.2% |
| parallel stages > 3 parallel stages                           | 616,205.69   | 589,604.19          | 🟢 +4.5%  |
| dependsOn > 2 stages with dependsOn                           | 1,040,705.80 | 796,193.26          | 🟢 +30.7% |

<!-- benchmarks:end -->
