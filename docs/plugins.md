# Plugin Architecture

## `ProcessingPlugin` Interface

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

  // Ordering constraints — plugins are topologically sorted
  after?: string[]; // Must run after these plugin IDs
  before?: string[]; // Must run before these plugin IDs

  preload?(): void;
}
```

- `supports()` — quick classifier, determines if this plugin handles a file
- `createStages()` — returns pipeline stages for a matched file. The `opts` parameter is fully typed via the generic. `ctx.shared` enables inter-stage communication. `ctx.log` provides structured logging. `ctx.signal` enables cancellation.
- `after` / `before` — declare ordering constraints relative to other plugins. The pipeline topologically sorts plugins before inserting their stages.
- `preload()` — optional, pre-warms decoders/WASM modules. Called at most once per plugin per `preloadBrowserPipelineForFiles` call

## `FileClassification`

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

## Import Patterns

```ts
// Barrel — imports both plugins
import { createJpegCompressorPlugin, createRawToJpegPlugin } from "@vivsh1999/upupload/plugins";

// Individual — only what you use (tree-shaking)
import { createJpegCompressorPlugin } from "@vivsh1999/upupload/plugins/jpeg-compressor";
```

## Usage Patterns

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

Create an object matching `ProcessingPlugin<TOpts>`. Use `definePlugin()` for less boilerplate:

```ts
import { definePlugin } from "@vivsh1999/upupload";
import { stage } from "@vivsh1999/upupload/core";

const watermark = definePlugin("watermark", {
  name: "Watermark Plugin",
  supports: (file) => file.type?.startsWith("image/") ?? false,
  stages: (input, opts, classif, ctx) => [
    stage("apply-watermark", async () => {
      const img = new Image();
      const url = URL.createObjectURL(input.file);
      // ... apply watermark ...
      URL.revokeObjectURL(url);
      return {
        artifacts: [
          {
            variant: "watermarked",
            file: outputFile,
            filename: outputFile.name,
            filetype: "image/jpeg",
          },
        ],
        info: [],
        removeFromQueue: false,
      };
    }),
  ],
});
```

Or write the full interface directly:

```ts
import type { ProcessingPlugin } from "@vivsh1999/upupload";
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
          ctx.log("info", `${input.name}: ${classif.ext}`);
          ctx.shared.set("detected-type", classif.mime);
          return {
            artifacts: [],
            info: [{ level: "info", message: classif.mime, code: "mime" }],
            removeFromQueue: false,
          };
        },
      },
    ];
  },
};
```

See `examples/vanilla-html/custom-pipeline.js` for a complete working example.

## `preloadBrowserPipelineForFiles`

```ts
import { preloadBrowserPipelineForFiles } from "@vivsh1999/upupload/browser";

preloadBrowserPipelineForFiles(
  fileList,
  { saveOptimized: true, saveThumbnails: true },
  { plugins: [createJpegCompressorPlugin()] },
);
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
