# Plugin Architecture

## `Plugin` Class

Use the `Plugin` class — the single canonical way to create plugins:

```ts
import { Plugin } from "@vivsh1999/upupload/plugins";
import { emptyResult, artifact } from "@vivsh1999/upupload/core";

const watermark = new Plugin<{ opacity: number }>({
  id: "watermark",
  name: "Watermark Plugin",
  options: { opacity: 0.5 },
  supports: (file) => file.type?.startsWith("image/") ?? false,

  // run shorthand — no need for createStages/array wrapping:
  run: async (input, opts, classif, ctx) => {
    // opts.opacity is typed
    // classif.stemName, classif.ext, etc. available directly
    // ctx.shared.get/set for inter-stage communication
    // ctx.log for structured logging
    // ctx.signal for cancellation
    return emptyResult();
  },

  // Declare keys this plugin writes to shared context
  sharedKeys: { output: "watermark:output" },

  // Ordering constraints — plugins are topologically sorted
  after: ["raw-to-jpeg"], // Must run after these plugin IDs
  before: [], // Must run before these plugin IDs
});
```

When you need to embed multiple stages per plugin, use the `createStages` config (the `run` shorthand is an auto-wrap around `createStages` returning a single-element array):

```ts
new Plugin({
  createStages: (input, opts, classif, ctx) => [
    { id: "stage-1", run: async () => { ... } },
    { id: "stage-2", run: async () => { ... } },
  ],
});
```

## Result Helpers

To eliminate boilerplate, use the built-in result builders from `@vivsh1999/upupload/core`:

```ts
import { emptyResult, artifact, warning, infoMessage } from "@vivsh1999/upupload/core";

// Instead of: { artifacts: [], info: [], removeFromQueue: false }
return emptyResult();

// Instead of: { variant: "thumb", file: blob, filename: "x.jpg", filetype: "image/jpeg" }
return artifact("thumb", blob, "x.jpg", "image/jpeg");

// Instead of: { level: "warn", message: "Failed", code: "err" }
return warning("Failed", "err");

// Instead of: { level: "info", message: "Done", code: "ok" }
return infoMessage("Done", "ok");
```

## Built-in Plugins

### `jpegCompressor`

**Import:** `@vivsh1999/upupload/plugins` or `@vivsh1999/upupload/plugins/jpeg-compressor`

Handles standard raster images (JPEG, PNG, WebP, BMP, GIF, AVIF).

- Each `.with()` instance produces **one output variant** (configured by `variant`). Add multiple instances for multiple sizes:
  ```ts
  jpegCompressor.with(
    { variant: "optimized", quality: 80, maxLongEdge: 2560, maxSizeMB: 1 },
    { instanceId: "opt" },
  );
  jpegCompressor.with(
    { variant: "thumbnail", quality: 78, maxLongEdge: 320, maxSizeMB: 0.25 },
    { instanceId: "thumb" },
  );
  ```
- If a previous plugin placed a decoded file in shared context (`pipeline:current`), the compressor operates on that instead of the original.
- `quality` and `maxSizeMB` are required; `variant` defaults to `"outputFile"`, `maxLongEdge` defaults to `-1` (original size).
- Does NOT handle RAW/HEIC/TIFF — use `rawToJpeg` for those
- **Dep:** `browser-image-compression` (install separately)

### `rawToJpeg`

**Import:** `@vivsh1999/upupload/plugins` or `@vivsh1999/upupload/plugins/raw-to-jpeg`

Handles camera RAW (CR3, DNG, NEF, ARW, etc.), HEIC/HEIF, and TIFF files.

- Pure decoder — produces no artifact. Places the decoded JPEG in the shared pipeline context.
- Downstream `jpegCompressor.with()` instances read the decoded file from shared context.
- Shares single decode across multiple compressor variants.
- **Deps:** `libraw-wasm` (required), `heic-decode`/`heic2any`/`utif` (optional)

### `videoPoster`

**Import:** `@vivsh1999/upupload/plugins` or `@vivsh1999/upupload/plugins/video-poster`

Extracts a JPEG poster frame from video files.

- Also updates `pipeline:current` for downstream plugins that chain on it.
- **No external deps.**

### Tree-shaking

Neither plugin is included in your bundle unless you explicitly import its sub-path:

```ts
// ✗ Zero cost — no plugin code imported
import { runDefaultBrowserPipeline } from "@vivsh1999/upupload/browser";

// ✓ 4 kB added — only jpeg-compressor code
import { jpegCompressor } from "@vivsh1999/upupload/plugins/jpeg-compressor";

// ✓ 12 kB added — only raw-to-jpeg code
import { rawToJpeg } from "@vivsh1999/upupload/plugins/raw-to-jpeg";
```

## Import Patterns

```ts
// Barrel — imports everything
import { jpegCompressor, rawToJpeg, videoPoster } from "@vivsh1999/upupload/plugins";

// Individual — only what you use (tree-shaking)
import { jpegCompressor } from "@vivsh1999/upupload/plugins/jpeg-compressor";
import { rawToJpeg } from "@vivsh1999/upupload/plugins/raw-to-jpeg";
import { videoPoster } from "@vivsh1999/upupload/plugins/video-poster";
```

## Usage Patterns

```ts
// .with() pattern — every plugin uses it:
jpegCompressor.with({ quality: 80, maxSizeMB: 1 });

// Multi-instance with unique IDs (no duplicate warnings):
jpegCompressor.with({ variant: "optimized" }, { instanceId: "opt" });
jpegCompressor.with({ variant: "thumbnail" }, { instanceId: "thumb" });

// No plugins — only built-in stages
runDefaultBrowserPipeline(source, opts);

// Only JPEG/PNG/WebP compression:
runDefaultBrowserPipeline(source, opts, {
  plugins: [jpegCompressor.with({ quality: 80, maxSizeMB: 1 })],
});

// With pipeline definitions (per-type routing):
runDefaultBrowserPipeline(source, opts, {
  pipeline: [
    {
      id: "photos",
      plugins: [jpegCompressor.with({ variant: "optimized", quality: 80, maxSizeMB: 1 })],
    },
  ],
});

// With cancellation signal:
const controller = new AbortController();
runDefaultBrowserPipeline(source, opts, {
  plugins: [jpegCompressor.with({ quality: 80, maxSizeMB: 1 })],
  signal: controller.signal,
});

// React hook:
useMediaUpload({ plugins: [jpegCompressor.with({ quality: 80, maxSizeMB: 1 })] });

// React hook with pipeline definitions and typed PluginProvider:
const pp = new PluginProvider([rawToJpeg, jpegCompressor.with({ quality: 80, maxSizeMB: 1 })]);
useMediaUpload({
  plugins: pp.plugins,
  pipeline: [
    {
      id: "photos",
      plugins: [pp.jpegCompressor({ variant: "client-proof", quality: 85 })],
    },
  ],
});
```

## Writing a Custom Plugin

### Using the `run` Shorthand (Recommended)

```ts
import { Plugin } from "@vivsh1999/upupload/plugins";
import { emptyResult, artifact, warning } from "@vivsh1999/upupload/core";
import { PIPELINE_CURRENT_KEY } from "@vivsh1999/upupload/browser";

const myPlugin = new Plugin<{ quality: number }>({
  id: "my-plugin",
  name: "My Plugin",
  options: { quality: 80 },
  supports: (file) => (file.type ?? "").startsWith("image/"),
  run: async (input, opts, classif, ctx) => {
    const sourceFile = (ctx.shared.get(PIPELINE_CURRENT_KEY) as File | undefined) ?? input.file;
    // opts.quality is typed as number
    // classif.stemName, classif.ext, etc. available without closure
    return artifact("output", sourceFile, `${classif.stemName}.out.jpg`, "image/jpeg");
  },
  sharedKeys: { output: "my-plugin:processed" },
});
```

### Using `createStages` (Multi-Stage)

```ts
new Plugin({
  id: "my-plugin",
  run: ..., // single stage
  // OR
  createStages: (input, opts, classif, ctx) => [
    { id: "stage-1", run: async () => { ... } },
    { id: "stage-2", run: async () => { ... } },
  ],
});
```

### Using `instanceId` for Multi-Instance

When you `.with()` the same plugin multiple times, give each instance a unique ID to avoid duplicate warnings:

```ts
const highQuality = myPlugin.with({ quality: 95 }, { instanceId: "hq" });
const lowQuality = myPlugin.with({ quality: 60 }, { instanceId: "lq" });
```

### Browser Utilities

For audio plugins, use the shared `AudioContext` pool and built-in WAV conversion:

```ts
import { acquireAudioContext, audioBufferToWav } from "@vivsh1999/upupload/browser";

const { ctx: audioCtx, release } = acquireAudioContext();
try {
  const audioBuf = await audioCtx.decodeAudioData(arrayBuf);
  // ... process audioBuf ...
  const wavBlob = audioBufferToWav(rendered);
} finally {
  release();
}
```

For canvas rendering with cross-browser support:

```ts
import { createCanvas } from "@vivsh1999/upupload/browser";

const { getContext, toBlob } = createCanvas(1200, 320);
const cctx = getContext()!;
// ... draw ...
const blob = await toBlob("image/png");
```

### Shared Context Keys

Plugins communicate via `ctx.shared`. The `pipeline:current` key holds the current working file:

```ts
import { PIPELINE_CURRENT_KEY, PIPELINE_CLASSIF_KEY } from "@vivsh1999/upupload/browser";

// Read current file:
const file = (ctx.shared.get(PIPELINE_CURRENT_KEY) as File | undefined) ?? input.file;

// Read file classification (also available via `classif` parameter):
const classif = ctx.shared.get(PIPELINE_CLASSIF_KEY) as FileClassification;

// Write processed file:
ctx.shared.set(PIPELINE_CURRENT_KEY, processedFile);
```

## Plugin Test Utilities

```ts
import {
  mockPipelineSource,
  mockPipelineContext,
  mockFileClassification,
} from "@vivsh1999/upupload/plugins/testing";

const source = mockPipelineSource({ name: "photo.cr3" });
const ctx = mockPipelineContext();
const classif = mockFileClassification({ ext: ".cr3", mime: "image/x-canon-cr3" });
```
