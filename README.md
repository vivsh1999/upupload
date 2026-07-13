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

| Benchmark                                                            | Ops/sec       | Prev Minor (v0.6.1) | Change    |
| -------------------------------------------------------------------- | ------------- | ------------------- | --------- |
| fileExtensionLower > .JPG → .jpg                                     | 10,817,991.13 | 17,238,983.24       | 🔴 -37.2% |
| fileExtensionLower > .Tar.Gz → .gz                                   | 10,629,686.41 | 18,020,920.88       | 🔴 -41.0% |
| fileExtensionLower > no extension → empty                            | 10,573,303.70 | 17,972,534.20       | 🔴 -41.2% |
| stem > photo.jpg → photo                                             | 10,914,051.61 | 17,928,724.71       | 🔴 -39.1% |
| stem > archive.tar.gz → archive.tar                                  | 11,473,251.84 | 17,991,650.67       | 🔴 -36.2% |
| stem > noext → noext                                                 | 11,324,725.95 | 16,177,753.58       | 🔴 -30.0% |
| toJpegName > photo.png → photo.jpg                                   | 8,735,498.04  | 15,366,197.62       | 🔴 -43.2% |
| toJpegName > img.heic → img.jpg                                      | 7,908,199.02  | 16,447,879.24       | 🔴 -51.9% |
| toThumbName > photo.png → photo.thumb.jpg                            | 8,115,263.90  | 16,387,479.64       | 🔴 -50.5% |
| toThumbName > img.heic → img.thumb.jpg                               | 8,028,507.79  | 16,532,807.01       | 🔴 -51.4% |
| info helper > level + message                                        | 11,613,415.51 | 23,951,594.80       | 🔴 -51.5% |
| info helper > level + message + code                                 | 10,755,963.87 | 23,973,463.33       | 🔴 -55.1% |
| result helpers > emptyResult                                         | 14,329,473.37 | 25,220,863.04       | 🔴 -43.2% |
| result helpers > artifact                                            | 62,578.62     | 93,058.37           | 🔴 -32.8% |
| result helpers > warning                                             | 9,681,281.94  | 24,504,789.56       | 🔴 -60.5% |
| result helpers > infoMessage                                         | 10,063,571.76 | 23,800,453.33       | 🔴 -57.7% |
| Semaphore > new Semaphore(4)                                         | 15,717,811.83 | 24,138,773.28       | 🔴 -34.9% |
| Semaphore > acquire + release — uncontended (concurrency=10, 1 task) | 2,923,373.63  | 6,758,443.49        | 🔴 -56.7% |
| Semaphore > acquire — contended (concurrency=1, 2 tasks)             | 1,981,280.70  | 3,889,893.96        | 🔴 -49.1% |
| Semaphore > run() — 10 concurrent resolved promises                  | 239,226.38    | 402,950.01          | 🔴 -40.6% |
| audioBufferToWav > empty buffer (no samples, mono @ 44100)           | 531,856.66    | 805,351.33          | 🔴 -34.0% |
| audioBufferToWav > 1 sec mono @ 44100                                | 1,191.18      | 2,660.70            | 🔴 -55.2% |
| audioBufferToWav > 5 sec stereo @ 48000                              | 148.18        | 251.15              | 🔴 -41.0% |
| audioBufferToWav > 30 sec stereo @ 44100                             | 24.5436       | 45.35               | 🔴 -45.9% |

### Internal Composition

| Benchmark                                                           | Ops/sec       | Prev Minor (v0.6.1) | Change    |
| ------------------------------------------------------------------- | ------------- | ------------------- | --------- |
| resolvePluginRefs > 5 bare Plugin instances (identity pass-through) | 8,388,308.81  | 17,667,837.72       | 🔴 -52.5% |
| resolvePluginRefs > 5 PluginRef with opts + .with() merging         | 1,376,311.50  | 3,576,738.76        | 🔴 -61.5% |
| resolvePluginRefs > 5 PluginRef with defaults (no registry lookup)  | 7,002,871.72  | 12,297,027.48       | 🔴 -43.1% |
| resolvePipeline > first match (image → photos)                      | 5,623,875.11  | 9,767,403.92        | 🔴 -42.4% |
| resolvePipeline > nested match (video → media → videos)             | 4,119,073.95  | 11,194,994.59       | 🔴 -63.2% |
| resolvePipeline > no match (text → null)                            | 6,844,678.77  | 14,504,259.50       | 🔴 -52.8% |
| validatePipeline > validatePipeline (valid)                         | 1,536,705.66  | 2,578,393.56        | 🔴 -40.4% |
| validatePipeline > validatePipeline (nested, depth 4)               | 1,115,699.44  | 1,952,123.77        | 🔴 -42.8% |
| compose / stage > stage() by id+run                                 | 12,896,434.78 | 25,084,718.00       | 🔴 -48.6% |
| compose / stage > compose() 3 defs                                  | 4,409,601.81  | 10,150,873.63       | 🔴 -56.6% |
| sharedGet / sharedSet > sharedSet + sharedGet                       | 9,014,193.15  | 17,049,411.86       | 🔴 -47.1% |
| createTimingMiddleware > wrap and run — no callback                 | 1,424,077.52  | 2,780,357.95        | 🔴 -48.8% |
| createTimingMiddleware > wrap and run — with callback               | 1,315,137.66  | 2,804,639.10        | 🔴 -53.1% |
| Pipeline factory > Pipeline() — 3 stages                            | 12,744,619.52 | 23,113,901.77       | 🔴 -44.9% |
| flattenPipeline > 10 flat stages                                    | 2,705,021.68  | 5,349,470.22        | 🔴 -49.4% |
| flattenPipeline > 3 nested sub-pipelines (depth 3)                  | 3,482,270.46  | 5,235,592.02        | 🔴 -33.5% |
| runPipelineFrom > 3 stages via factory                              | 674,729.07    | 811,245.66          | 🔴 -16.8% |

### Plugins (Individual)

| Benchmark                                               | Ops/sec       | Prev Minor (v0.6.1) | Change    |
| ------------------------------------------------------- | ------------- | ------------------- | --------- |
| Plugin class > new Plugin() with run shorthand          | 16,063,626.78 | 25,463,548.73       | 🔴 -36.9% |
| Plugin class > Plugin.supports()                        | 19,707,232.42 | 33,299,581.20       | 🔴 -40.8% |
| Plugin class > Plugin.with()                            | 6,192,164.14  | 14,702,915.94       | 🔴 -57.9% |
| Plugin class > Plugin.with() with instanceId            | 4,349,569.26  | 10,239,614.87       | 🔴 -57.5% |
| Plugin class > Plugin.createStages()                    | 1,250,744.42  | 2,745,437.45        | 🔴 -54.4% |
| PluginProvider > new PluginProvider()                   | 956,410.37    | 1,834,880.12        | 🔴 -47.9% |
| PluginProvider > PluginProvider camelCase method        | 992,294.60    | 1,778,599.36        | 🔴 -44.2% |
| PluginProvider > PluginProvider.getPlugin() — found     | 1,043,831.85  | 1,835,791.50        | 🔴 -43.1% |
| PluginProvider > PluginProvider.getPlugin() — not found | 1,094,581.03  | 1,858,710.38        | 🔴 -41.1% |

### Plugins (Pipeline Composition)

| Benchmark                                                     | Ops/sec      | Prev Minor (v0.6.1) | Change    |
| ------------------------------------------------------------- | ------------ | ------------------- | --------- |
| runPipeline > 7 async stages (like real pipeline)             | 120.90       | 116.67              | 🟢 +3.6%  |
| runPipeline > 7 stages with half skipped (when returns false) | 208.33       | 210.79              | 🔴 -1.2%  |
| runPipeline > stage error → onError fallback                  | 280.43       | 281.38              | 🔴 -0.3%  |
| runPipeline > stage error → onError skip                      | 281.20       | 285.67              | 🔴 -1.6%  |
| pipeline control flow > skipGroup                             | 1,013,235.79 | 1,558,728.61        | 🔴 -35.0% |
| pipeline control flow > skipRemaining                         | 1,223,072.71 | 2,393,762.76        | 🔴 -48.9% |
| pipeline control flow > removeFromQueue                       | 1,165,820.90 | 2,353,498.59        | 🔴 -50.5% |
| parallel stages > 3 parallel stages                           | 513,888.65   | 884,245.03          | 🔴 -41.9% |
| dependsOn > 2 stages with dependsOn                           | 616,004.65   | 1,322,033.43        | 🔴 -53.4% |

<!-- benchmarks:end -->
