---
name: upupload-publish-plugin
description: Publish a standalone @vivsh1999/upupload plugin to npm/JSR. Use when creating a reusable plugin for the community — covers plugin contract, tree-shaking, testing, sharedKeys, and publishing.
---

# Publishing an UpUpload Plugin

Guide for creating and publishing a standalone plugin for `@vivsh1999/upupload`.

## Plugin Contract

A plugin must satisfy the `ProcessingPlugin<TOpts>` interface. The canonical way is via the `Plugin` class:

```ts
import { Plugin } from "@vivsh1999/upupload/plugins";
import { emptyResult } from "@vivsh1999/upupload/core";

export interface MyPluginOptions {
  quality?: number;
  format?: "jpeg" | "png";
}

const myPlugin = new Plugin<MyPluginOptions>({
  id: "my-plugin", // kebab-case unique ID
  name: "My Plugin", // human-readable
  options: { quality: 80, format: "jpeg" }, // defaults
  supports: (file) => file.type?.startsWith("image/") ?? false,
  run: async (input, opts, classif, ctx) => {
    // input   — { file: File|Blob, name, type, relativePath? }
    // opts    — typed as MyPluginOptions (defaults + user overrides)
    // classif — { ext, mime, stemName, isVideo, isAudio, isSvg, size, lastModified, meta? }
    // ctx     — { log, shared: Map, signal?: AbortSignal }
    return emptyResult();
  },
  sharedKeys: { output: "my-plugin:processed" },
});
```

### Required Fields

| Field                   | Description                                                                                           |
| ----------------------- | ----------------------------------------------------------------------------------------------------- |
| `id`                    | Unique kebab-case string (e.g. `"jpeg-compressor"`)                                                   |
| `name`                  | Human-readable name for logs                                                                          |
| `options`               | Default options (typed as `TOpts`)                                                                    |
| `supports(file)`        | Return `true` if the plugin handles this file — called with `{ name: string, type?: string \| null }` |
| `createStages` or `run` | At least one processing function (see below)                                                          |

### Processing: `run` vs `createStages`

**`run` shorthand** — single-stage plugin (most common):

```ts
run: async (input, opts, classif, ctx) => {
  return artifact("output", processedFile, filename, "image/jpeg");
};
```

**`createStages`** — multi-stage plugin for complex pipelines:

```ts
createStages: (input, opts, classif, ctx) => [
  { id: "stage1", run: async () => { /* ... */ } },
  { id: "stage2", run: async () => { /* ... */ } },
],
```

### Optional Fields

| Field        | Description                                                       |
| ------------ | ----------------------------------------------------------------- |
| `sharedKeys` | Declare shared context keys for inter-plugin communication        |
| `after`      | IDs of plugins that must run before this one                      |
| `before`     | IDs of plugins that must run after this one                       |
| `preload()`  | Pre-warm decoders/WASM — called once before any file is processed |

## sharedKeys Pattern

Declare shared context key names on the plugin so downstream plugins can reference them without hardcoded strings:

```ts
const myPlugin = new Plugin<MyPluginOptions>({
  id: "my-plugin",
  options: { quality: 80 },
  supports: (file) => file.type?.startsWith("image/") ?? false,
  run: async (input, opts, classif, ctx) => {
    ctx.shared.set("my-plugin:output", processedFile);
    ctx.shared.set("pipeline:current", processedFile); // PIPELINE_CURRENT_KEY convention
    return emptyResult();
  },
  sharedKeys: { output: "my-plugin:output" },
});
```

Consumers reference keys via `plugin.sharedKeys.output` instead of hardcoded strings.

Follow the `PIPELINE_CURRENT_KEY` (`"pipeline:current"`) convention — upstream stages write the current file to it, downstream stages read from it. Import the constant:

```ts
import { PIPELINE_CURRENT_KEY } from "@vivsh1999/upupload/core";
ctx.shared.set(PIPELINE_CURRENT_KEY, processedFile);
const current = (ctx.shared.get(PIPELINE_CURRENT_KEY) as File | undefined) ?? input.file;
```

## Result Helpers

Import from `@vivsh1999/upupload/core`:

```ts
import { emptyResult, artifact, warning, infoMessage } from "@vivsh1999/upupload/core";

// Return no artifacts (e.g. for pure decoders):
return emptyResult();

// Return a processing artifact:
return artifact("optimized", file, filename, "image/jpeg");

// Attach extra options:
return artifact("optimized", file, filename, "image/jpeg", {
  relativePath: "photos/",
  skip: true, // filtered from final result
});

// Emit warnings:
return { artifacts: [], info: [warning("Could not process", "processing_failed")] };

// Remove file from queue:
return { artifacts: [], info: [], removeFromQueue: true };

// Skip remaining stages:
return { ...emptyResult(), skipRemaining: true };

// Skip named groups:
return { ...emptyResult(), skipGroup: "thumbnail" };
```

## File Extensions & Classification

Import from `@vivsh1999/upupload/browser`:

```ts
import {
  RAW_EXTENSIONS, // Set of ".cr3", ".dng", ".nef", ".arw", etc.
  VIDEO_EXTENSIONS, // Set of ".mp4", ".mov", ".mkv", etc.
  AUDIO_EXTENSIONS, // Set of ".mp3", ".wav", ".flac", etc.
  RASTER_IMAGE_EXTENSIONS, // Set of ".jpg", ".png", ".webp", ".heic", etc.
  VECTOR_IMAGE_EXTENSIONS, // Set of ".svg"
  fileExtensionLower, // "photo.JPG" → ".jpg"
} from "@vivsh1999/upupload/browser";
```

The `FileClassification` object passed to `run`/`createStages`:

```ts
{
  ext: ".cr3",         // lowercase extension
  mime: "image/jpeg",  // lowercase MIME type
  stemName: "photo",   // filename without extension
  isVideo: false,
  isAudio: false,
  isSvg: false,
  size: 1024000,       // bytes
  lastModified: 1700000000000,  // epoch ms
  meta: undefined,     // optional custom bag from pipeline config
}
```

## Testing

Use test utilities from `@vivsh1999/upupload/plugins/testing`:

```ts
import { describe, it, expect } from "vitest";
import {
  mockPipelineSource,
  mockPipelineContext,
  mockFileClassification,
} from "@vivsh1999/upupload/plugins/testing";
import { myPlugin } from "./my-plugin";

describe("my-plugin", () => {
  it("produces an artifact for supported files", async () => {
    const source = mockPipelineSource({ name: "test.png", type: "image/png" });
    const ctx = mockPipelineContext();
    const classif = mockFileClassification({ ext: ".png", mime: "image/png" });

    const stages = myPlugin.createStages(source, myPlugin.options, classif, ctx);
    const result = await stages[0]!.run(source, ctx);

    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts[0]!.variant).toBe("output");
  });

  it("does not match unsupported files", () => {
    expect(myPlugin.supports({ name: "file.txt", type: "text/plain" })).toBe(false);
  });
});
```

Integration test with the browser pipeline:

```ts
import { runDefaultBrowserPipeline } from "@vivsh1999/upupload/browser";

it("processes a file end-to-end", async () => {
  const file = new File(["fake-image-data"], "test.png", { type: "image/png" });
  const result = await runDefaultBrowserPipeline(
    { file, name: "test.png", type: "image/png" },
    {},
    { plugins: [myPlugin.with({ quality: 80 })] },
  );
  expect(result.artifacts.length).toBeGreaterThan(0);
});
```

## Plugin Dependencies

- Keep core dependencies lightweight
- Heavy decoders should be imported dynamically at runtime (see `jpeg-compressor.ts` for the pattern)
- Document required peer/optional deps in the plugin's JSDoc and README

Example dynamic import pattern:

```ts
let modulePromise: Promise<ModuleType> | null = null;
async function loadModule(): Promise<ModuleType> {
  if (!modulePromise) {
    modulePromise = import("heavy-dep").then((m) => m.default);
  }
  return modulePromise;
}
```

## Package Structure

```
my-upupload-plugin/
├── src/
│   └── index.ts         # Plugin export (default or named)
├── package.json         # name: "upupload-plugin-<name>"
├── tsconfig.json
├── jsr.json            # optional, for JSR publishing
└── README.md           # usage docs
```

### package.json

```json
{
  "name": "upupload-plugin-watermark",
  "type": "module",
  "files": ["dist"],
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "default": "./dist/index.js"
    }
  },
  "sideEffects": false,
  "peerDependencies": {
    "@vivsh1999/upupload": "^0.1.0"
  }
}
```

## Publishing

### npm

```sh
npm publish
```

### JSR

```sh
npx jsr publish
```

### JSDoc Requirements (JSR)

JSR requires:

1. **Module docs** — `/** @module */` at the top of every entrypoint file
2. **Symbol docs** — JSDoc on at least 80% of exported symbols

````ts
/** @module my-plugin */
import { Plugin } from "@vivsh1999/upupload/plugins";

/**
 * Watermark plugin for UpUpload.
 * Adds a text watermark to processed images.
 *
 * @example
 * ```ts
 * import { watermark } from "upupload-plugin-watermark";
 * import { useFileUpload } from "@vivsh1999/upupload/react";
 *
 * useFileUpload({ plugins: [watermark.with({ text: "© 2025" })] });
 * ```
 */
export const watermark = new Plugin<WatermarkOptions>({ ... });
````

## Naming Conventions

- Package name: `upupload-plugin-<name>` (e.g. `upupload-plugin-watermark`)
- Plugin ID: kebab-case (e.g. `"watermark"`)
- Plugin `name` field: Human-readable (e.g. `"Watermark Plugin"`)
- Shared keys namespace: `<plugin-id>:<key>` (e.g. `"watermark:output"`)
