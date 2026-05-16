# @vivsh1999/upupload

Client-first, multi-stage file uploader/processor with a **plugin architecture** for custom processing.

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

| Path                                          | Environment | Contents                                          | Bundle cost |
| --------------------------------------------- | ----------- | ------------------------------------------------- | ----------- |
| `@vivsh1999/upupload`                         | Browser     | Re-exports core + browser                         | —           |
| `@vivsh1999/upupload/browser`                 | Browser     | Pipeline, allowlist, audio/canvas utils, plugins  | 8 kB        |
| `@vivsh1999/upupload/core`                    | Universal   | Generic pipeline engine, types, result helpers    | 1 kB        |
| `@vivsh1999/upupload/react`                   | Browser     | `useFileUpload` React hook                        | 60 kB       |
| `@vivsh1999/upupload/server`                  | Node        | Server entry (minimal)                            | < 1 kB      |
| `@vivsh1999/upupload/plugins`                 | Browser     | Barrel re-export of all plugins                   | N/A         |
| `@vivsh1999/upupload/plugins/jpeg-compressor` | Browser     | JPEG/PNG/WebP compressor plugin                   | +4 kB       |
| `@vivsh1999/upupload/plugins/raw-to-jpeg`     | Browser     | RAW/HEIC/TIFF decoder plugin                      | +12 kB      |
| `@vivsh1999/upupload/plugins/video-poster`    | Browser     | Video poster frame plugin                         | +6 kB       |
| `@vivsh1999/upupload/plugins/testing`         | Browser     | Plugin test utilities                             | +1 kB       |
| `@vivsh1999/upupload/preset`                  | Browser     | Zero-config `upload()` with auto-detected plugins | +13 kB      |

Only the specific plugin path you import is added to your bundle.

---

## Quick Start

### React (with built-in plugins)

```tsx
import { useFileUpload } from "@vivsh1999/upupload/react";
import { jpegCompressor } from "@vivsh1999/upupload/plugins";

function Uploader() {
  const { getDropTargetProps, getFileInputProps, queue, startUpload } = useFileUpload({
    plugins: [jpegCompressor.with({ quality: 80, maxSizeMB: 1 })],
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

### Handling Results (uploading artifacts)

After processing, iterate over `result.artifacts` and upload each one:

```ts
for (const artifact of result.artifacts) {
  await fetch("/api/upload", {
    method: "POST",
    body: artifact.file,
    headers: { "Content-Type": artifact.filetype },
  });
}
```

With the React hook, use the `onFileComplete` callback:

```tsx
useFileUpload({
  plugins: [jpegCompressor.with({ quality: 80 })],
  onFileComplete: async (item) => {
    for (const a of item.artifacts ?? []) {
      await fetch("/api/upload", { method: "POST", body: a.blob });
    }
  },
});
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
│    • Each file acquires a semaphore slot │     (0 – 90% progress)
│    • Multiple files processed in parallel│
│    • Plugins run sequentially per file   │
└──────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────┐
│ 2. Upload Adapter (per file, sequential) │  ← your adapter sends artifacts
│    • Called once per artifact            │     (90 – 100% progress)
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
    // ctx.log — structured logging
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

Autogenerated from `vitest bench` (via pre-commit hook).

### Internal Components

| Benchmark                                                            | Ops/sec       |
| -------------------------------------------------------------------- | ------------- |
| isSupportedMediaUpload > video (MIME match)                          | 15,073,296.07 |
| isSupportedMediaUpload > RAW octet-stream (extension match)          | 11,955,470.11 |
| isSupportedMediaUpload > SVG (MIME match)                            | 14,532,527.59 |
| isSupportedMediaUpload > raster image (MIME match)                   | 11,708,006.27 |
| isSupportedMediaUpload > audio (MIME match)                          | 16,024,497.56 |
| isSupportedMediaUpload > reject (text/plain)                         | 19,281,363.96 |
| isVideoLike > by MIME                                                | 11,111,595.24 |
| isVideoLike > by extension                                           | 13,857,924.28 |
| isVideoLike > false (image)                                          | 15,813,134.67 |
| isAudioLike > by MIME                                                | 11,152,169.33 |
| isAudioLike > by extension                                           | 13,420,693.30 |
| isAudioLike > false (image)                                          | 15,282,835.69 |
| isCameraRawImage > RAW extension — true                              | 2,667,052.69  |
| isCameraRawImage > non-RAW extension — false                         | 18,112,437.78 |
| isHeicLike > .heic extension — true                                  | 13,757,269.48 |
| isHeicLike > image/heif MIME — true                                  | 12,352,610.32 |
| isHeicLike > false (PNG)                                             | 12,302,667.58 |
| isTiffLike > .tif extension — true                                   | 13,906,517.89 |
| isTiffLike > .tiff extension — true                                  | 13,804,937.67 |
| isTiffLike > image/tiff MIME — true                                  | 10,693,511.85 |
| isTiffLike > false (JPEG)                                            | 12,393,327.83 |
| shouldUploadWithoutTranscode > video — true                          | 11,087,666.82 |
| shouldUploadWithoutTranscode > audio — true                          | 10,884,814.78 |
| shouldUploadWithoutTranscode > SVG — true                            | 9,246,114.17  |
| shouldUploadWithoutTranscode > raster PNG — false                    | 9,058,613.87  |
| shouldCompressToJpeg > RAW extension — true                          | 7,122,869.49  |
| shouldCompressToJpeg > raster PNG — true                             | 8,111,717.72  |
| shouldCompressToJpeg > SVG — false                                   | 9,354,001.01  |
| shouldCompressToJpeg > audio — false                                 | 10,502,126.05 |
| fileExtensionLower > .JPG → .jpg                                     | 17,238,983.24 |
| fileExtensionLower > .Tar.Gz → .gz                                   | 18,020,920.88 |
| fileExtensionLower > no extension → empty                            | 17,972,534.20 |
| stem > photo.jpg → photo                                             | 17,928,724.71 |
| stem > archive.tar.gz → archive.tar                                  | 17,991,650.67 |
| stem > noext → noext                                                 | 16,177,753.58 |
| toJpegName > photo.png → photo.jpg                                   | 15,366,197.62 |
| toJpegName > img.heic → img.jpg                                      | 16,447,879.24 |
| toThumbName > photo.png → photo.thumb.jpg                            | 16,387,479.64 |
| toThumbName > img.heic → img.thumb.jpg                               | 16,532,807.01 |
| info helper > level + message                                        | 23,951,594.80 |
| info helper > level + message + code                                 | 23,973,463.33 |
| result helpers > emptyResult                                         | 25,220,863.04 |
| result helpers > artifact                                            | 93,058.37     |
| result helpers > warning                                             | 24,504,789.56 |
| result helpers > infoMessage                                         | 23,800,453.33 |
| Semaphore > new Semaphore(4)                                         | 24,138,773.28 |
| Semaphore > acquire + release — uncontended (concurrency=10, 1 task) | 6,758,443.49  |
| Semaphore > acquire — contended (concurrency=1, 2 tasks)             | 3,889,893.96  |
| Semaphore > run() — 10 concurrent resolved promises                  | 402,950.01    |
| audioBufferToWav > empty buffer (no samples, mono @ 44100)           | 805,351.33    |
| audioBufferToWav > 1 sec mono @ 44100                                | 2,660.70      |
| audioBufferToWav > 5 sec stereo @ 48000                              | 251.15        |
| audioBufferToWav > 30 sec stereo @ 44100                             | 45.3501       |

### Internal Composition

| Benchmark                                                           | Ops/sec       |
| ------------------------------------------------------------------- | ------------- |
| resolvePluginRefs > 5 bare Plugin instances (identity pass-through) | 17,667,837.72 |
| resolvePluginRefs > 5 PluginRef with opts + .with() merging         | 3,576,738.76  |
| resolvePluginRefs > 5 PluginRef with defaults (no registry lookup)  | 12,297,027.48 |
| resolvePipeline > first match (image → photos)                      | 9,767,403.92  |
| resolvePipeline > nested match (video → media → videos)             | 11,194,994.59 |
| resolvePipeline > no match (text → null)                            | 14,504,259.50 |
| validatePipeline > validatePipeline (valid)                         | 2,578,393.56  |
| validatePipeline > validatePipeline (nested, depth 4)               | 1,952,123.77  |
| compose / stage > stage() by id+run                                 | 25,084,718.00 |
| compose / stage > compose() 3 defs                                  | 10,150,873.63 |
| sharedGet / sharedSet > sharedSet + sharedGet                       | 17,049,411.86 |
| createTimingMiddleware > wrap and run — no callback                 | 2,780,357.95  |
| createTimingMiddleware > wrap and run — with callback               | 2,804,639.10  |
| Pipeline factory > Pipeline() — 3 stages                            | 23,113,901.77 |
| flattenPipeline > 10 flat stages                                    | 5,349,470.22  |
| flattenPipeline > 3 nested sub-pipelines (depth 3)                  | 5,235,592.02  |
| runPipelineFrom > 3 stages via factory                              | 811,245.66    |

### Plugins (Individual)

| Benchmark                                               | Ops/sec       |
| ------------------------------------------------------- | ------------- |
| Plugin class > new Plugin() with run shorthand          | 25,463,548.73 |
| Plugin class > Plugin.supports()                        | 33,299,581.20 |
| Plugin class > Plugin.with()                            | 14,702,915.94 |
| Plugin class > Plugin.with() with instanceId            | 10,239,614.87 |
| Plugin class > Plugin.createStages()                    | 2,745,437.45  |
| PluginProvider > new PluginProvider()                   | 1,834,880.12  |
| PluginProvider > PluginProvider camelCase method        | 1,778,599.36  |
| PluginProvider > PluginProvider.getPlugin() — found     | 1,835,791.50  |
| PluginProvider > PluginProvider.getPlugin() — not found | 1,858,710.38  |

### Plugins (Pipeline Composition)

| Benchmark                                                     | Ops/sec      |
| ------------------------------------------------------------- | ------------ |
| runPipeline > 7 async stages (like real pipeline)             | 116.67       |
| runPipeline > 7 stages with half skipped (when returns false) | 210.79       |
| runPipeline > stage error → onError fallback                  | 281.38       |
| runPipeline > stage error → onError skip                      | 285.67       |
| pipeline control flow > skipGroup                             | 1,558,728.61 |
| pipeline control flow > skipRemaining                         | 2,393,762.76 |
| pipeline control flow > removeFromQueue                       | 2,353,498.59 |
| parallel stages > 3 parallel stages                           | 884,245.03   |
| dependsOn > 2 stages with dependsOn                           | 1,322,033.43 |

<!-- benchmarks:end -->
