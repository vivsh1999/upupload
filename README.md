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

| Benchmark                                                            | Ops/sec       |
| -------------------------------------------------------------------- | ------------- |
| fileExtensionLower > .JPG → .jpg                                     | 9,930,675.98  |
| fileExtensionLower > .Tar.Gz → .gz                                   | 11,858,103.24 |
| fileExtensionLower > no extension → empty                            | 10,459,969.29 |
| stem > photo.jpg → photo                                             | 7,356,858.79  |
| stem > archive.tar.gz → archive.tar                                  | 11,043,388.37 |
| stem > noext → noext                                                 | 10,824,715.26 |
| toJpegName > photo.png → photo.jpg                                   | 10,603,519.41 |
| toJpegName > img.heic → img.jpg                                      | 5,712,056.27  |
| toThumbName > photo.png → photo.thumb.jpg                            | 7,988,392.42  |
| toThumbName > img.heic → img.thumb.jpg                               | 8,725,795.74  |
| info helper > level + message                                        | 6,107,590.41  |
| info helper > level + message + code                                 | 5,617,563.96  |
| result helpers > emptyResult                                         | 16,587,198.87 |
| result helpers > artifact                                            | 63,465.60     |
| result helpers > warning                                             | 11,242,180.65 |
| result helpers > infoMessage                                         | 9,368,071.83  |
| Semaphore > new Semaphore(4)                                         | 13,043,587.78 |
| Semaphore > acquire + release — uncontended (concurrency=10, 1 task) | 4,030,598.93  |
| Semaphore > acquire — contended (concurrency=1, 2 tasks)             | 1,846,416.23  |
| Semaphore > run() — 10 concurrent resolved promises                  | 238,169.65    |
| audioBufferToWav > empty buffer (no samples, mono @ 44100)           | 395,689.63    |
| audioBufferToWav > 1 sec mono @ 44100                                | 1,591.76      |
| audioBufferToWav > 5 sec stereo @ 48000                              | 73.5247       |
| audioBufferToWav > 30 sec stereo @ 44100                             | 27.6690       |

### Internal Composition

| Benchmark                                                           | Ops/sec       |
| ------------------------------------------------------------------- | ------------- |
| resolvePluginRefs > 5 bare Plugin instances (identity pass-through) | 9,890,466.87  |
| resolvePluginRefs > 5 PluginRef with opts + .with() merging         | 1,021,426.57  |
| resolvePluginRefs > 5 PluginRef with defaults (no registry lookup)  | 4,904,658.88  |
| resolvePipeline > first match (image → photos)                      | 6,199,664.83  |
| resolvePipeline > nested match (video → media → videos)             | 4,556,456.60  |
| resolvePipeline > no match (text → null)                            | 6,890,922.46  |
| validatePipeline > validatePipeline (valid)                         | 1,815,805.85  |
| validatePipeline > validatePipeline (nested, depth 4)               | 1,718,865.54  |
| compose / stage > stage() by id+run                                 | 15,979,399.46 |
| compose / stage > compose() 3 defs                                  | 3,245,412.45  |
| sharedGet / sharedSet > sharedSet + sharedGet                       | 8,673,584.89  |
| createTimingMiddleware > wrap and run — no callback                 | 1,361,460.72  |
| createTimingMiddleware > wrap and run — with callback               | 1,240,997.93  |
| Pipeline factory > Pipeline() — 3 stages                            | 13,223,199.39 |
| flattenPipeline > 10 flat stages                                    | 2,569,413.35  |
| flattenPipeline > 3 nested sub-pipelines (depth 3)                  | 3,327,729.73  |
| runPipelineFrom > 3 stages via factory                              | 670,329.69    |

### Plugins (Individual)

| Benchmark                                               | Ops/sec       |
| ------------------------------------------------------- | ------------- |
| Plugin class > new Plugin() with run shorthand          | 16,291,747.09 |
| Plugin class > Plugin.supports()                        | 18,637,538.00 |
| Plugin class > Plugin.with()                            | 6,373,022.34  |
| Plugin class > Plugin.with() with instanceId            | 4,566,054.71  |
| Plugin class > Plugin.createStages()                    | 1,731,019.27  |
| PluginProvider > new PluginProvider()                   | 1,155,005.15  |
| PluginProvider > PluginProvider camelCase method        | 1,097,893.28  |
| PluginProvider > PluginProvider.getPlugin() — found     | 1,156,427.11  |
| PluginProvider > PluginProvider.getPlugin() — not found | 1,106,137.26  |

### Plugins (Pipeline Composition)

| Benchmark                                                     | Ops/sec      |
| ------------------------------------------------------------- | ------------ |
| runPipeline > 7 async stages (like real pipeline)             | 122.43       |
| runPipeline > 7 stages with half skipped (when returns false) | 209.56       |
| runPipeline > stage error → onError fallback                  | 285.67       |
| runPipeline > stage error → onError skip                      | 286.56       |
| pipeline control flow > skipGroup                             | 983,547.76   |
| pipeline control flow > skipRemaining                         | 1,073,761.60 |
| pipeline control flow > removeFromQueue                       | 1,353,930.46 |
| parallel stages > 3 parallel stages                           | 582,008.46   |
| dependsOn > 2 stages with dependsOn                           | 748,943.49   |

<!-- benchmarks:end -->
