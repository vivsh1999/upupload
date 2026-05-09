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

## Testing Custom Plugins

Use the test utilities to unit-test your plugin without running a full pipeline:

```ts
import { Plugin } from "@vivsh1999/upupload/plugins";
import { artifact, emptyResult } from "@vivsh1999/upupload/core";
import {
  mockPipelineSource,
  mockPipelineContext,
  mockFileClassification,
} from "@vivsh1999/upupload/plugins/testing";

// Mock the inputs your plugin receives
const source = mockPipelineSource({ name: "photo.cr3" });
const ctx = mockPipelineContext();
const classif = mockFileClassification({ ext: ".cr3", mime: "image/x-canon-cr3" });

// Invoke createStages directly
const stages = myPlugin.createStages(source, myPlugin.options, classif, ctx);
const result = await stages[0]!.run(source, ctx);

expect(result.artifacts).toHaveLength(1);
expect(result.artifacts[0]!.variant).toBe("output");
```

- `mockPipelineSource(overrides?)` — creates a `PipelineSource` with sensible defaults
- `mockPipelineContext(overrides?)` — creates a `PipelineContext` with a fresh `Map` for `shared`
- `mockFileClassification(overrides?)` — creates a `FileClassification` with defaults

For integration tests, use `runDefaultBrowserPipeline` with your plugin registered:

```ts
import { runDefaultBrowserPipeline } from "@vivsh1999/upupload/browser";

const result = await runDefaultBrowserPipeline(
  { file, name: "test.png", type: "image/png" },
  {},
  { plugins: [myPlugin.with({ quality: 80 })] },
);
expect(result.artifacts.length).toBeGreaterThan(1); // original + your artifact
```

## Error Handling in Plugins

A plugin stage can provide an `onError` handler by overriding `createStages`:

```ts
new Plugin({
  id: "fragile-processor",
  options: { timeout: 5000 },
  supports: (file) => file.type === "image/webp",
  createStages: (input, opts, classif, ctx) => [
    {
      id: "fragile-processor",
      run: async () => {
        // may throw
      },
      onError: async (error, input, ctx) => {
        // Log the error
        ctx.log("error", `Processing failed: ${error}`);

        // Option A: Skip the stage gracefully
        return { action: "skip", info: { level: "warn", message: "Skipped", code: "SKIP" } };

        // Option B: Fall back to original input
        return { action: "fallback", value: { artifacts: [], info: [], removeFromQueue: false } };

        // Option C: Retry up to 3 times with 1s delay
        return { action: "retry", maxRetries: 3, delayMs: 1000 };

        // Option D: Re-throw (pipeline fails)
        return { action: "throw" };
      },
    },
  ],
});
```

## Publishing a Plugin

If you've built a reusable plugin, publish it as a standalone npm package so others can install it.

### Package Structure

```
my-plugin/
├── src/
│   ├── index.ts        # @module + export Plugin instance
│   └── index.test.ts   # tests
├── package.json        # name like "upupload-plugin-watermark"
├── jsr.json            # (optional) for JSR publishing
├── tsconfig.json
└── README.md
```

### Checklist

1. **Name your plugin** with a recognizable prefix (e.g. `upupload-plugin-*` for npm)
2. **Export a `Plugin` instance** using the `Plugin` class — consumers configure it via `.with()`
3. **Declare `sharedKeys`** so downstream plugins can reference your context keys without string literals
4. **Document `supports()` behavior** — what file types/names/MIME types your plugin handles
5. **Add `@module` JSDoc** to your entrypoint file for JSR compatibility
6. **Tree-shakeable imports** — add conditional `exports` in `package.json` so consumers can import only your plugin
7. **Write tests** using the [test utilities](#testing-custom-plugins) above
8. **Document peer dependencies** — list any runtime deps users must install (e.g. `heic-decode`)
9. **Open-source it** — attach a license (MIT recommended), add a README, and publish to npm

### Plugin Contract for Published Plugins

| Aspect                     | Requirement                                                                |
| -------------------------- | -------------------------------------------------------------------------- |
| `id`                       | Globally unique, kebab-case (e.g. `"awesome-filter"`)                      |
| `name`                     | Human-readable (e.g. `"Awesome Filter Plugin"`)                            |
| `supports()`               | Accurate classifier — prefer MIME checks over extension checks             |
| `run()` / `createStages()` | Must return `PipelineResult` — use `emptyResult()` / `artifact()` helpers  |
| `sharedKeys`               | Declare every key the plugin writes to shared context                      |
| `after` / `before`         | Declare ordering constraints relative to other known plugin IDs            |
| `options`                  | Sensible defaults — the plugin should work with `.with({})` (no overrides) |
| `preload()`                | Pre-warm WASM decoders or other expensive async setup                      |

### Submission to This Repo

To include your plugin in this repo's built-in set:

1. Create the file in `src/plugin/` (e.g. `src/plugin/my-plugin.ts`)
2. Export a `Plugin` instance
3. Add the export to `src/plugin/index.ts`
4. Add the import path to `package.json` `exports` and `jsr.json` `exports`
5. Write tests in `src/plugin/my-plugin.test.ts`
6. Add JSDoc `@module` at the top and JSDoc on all exported symbols

See [CONTRIBUTING.md](../CONTRIBUTING.md) for the full contribution process.

## Best Practices

- **Prefer the `run` shorthand** — it's less boilerplate than `createStages` for single-stage plugins
- **Use `with()` not factories** — consumers expect the `.with()` pattern for configuring plugins
- **Always provide `sharedKeys`** — even if no downstream plugin uses them yet, it documents your shared context contract
- **Use `emptyResult()`** for virtual/side-effect-only stages (like decoders that write to shared context without producing an artifact)
- **Use `artifact()` helper** — ensures the shape is correct and `filetype` is auto-filled from the blob
- **Don't mutate the input file** — produce a new `Blob` or `File` for each artifact
- **Handle cancellation** — check `ctx.signal?.aborted` in long-running operations
- **Prefer MIME checks** in `supports()` — they're more reliable than extension checks
- **Use `_` prefix** for internal helper files (not exported from the plugin barrel)
- **Install heavy deps lazily** — use dynamic `import()` at runtime rather than static imports
