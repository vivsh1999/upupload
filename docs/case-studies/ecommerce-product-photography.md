# E-Commerce Product Photography Uploader

A case study for building a multi-vendor e-commerce uploader with UpUpload. Sellers upload product photos from phones, DSLRs, or studios; the library normalizes everything into consistent display variants with automated watermarking. Upload transport is fully user-managed.

## Scenario

- **Who**: Multi-vendor marketplace where sellers submit product photos.
- **Input**: Phone photos (HEIC), DSLR RAWs (CR3, DNG), studio JPEGs, PNG cutouts — any format the seller shoots with.
- **Output**: Three consistent product variants — display, thumbnail, zoom — each watermarked with the marketplace brand.
- **Key constraint**: Every product image must be visually consistent (same quality, same max dimensions, same watermark) regardless of what the seller uploaded. Sellers must not be able to skip the watermark.

## Architecture

```
Browser Input (RAW / HEIC / JPEG / PNG from any device)
       │
       ▼
┌────────────────────────────────────────────────┐
│  UpUpload Pipeline                             │
│                                                │
│  1. validate-allowlist  (reject unsupported)     │
│  2. original            (always present)       │
│  3. raw-to-jpeg plugin  (decode RAW/HEIC/TIFF) │
│  4. brand-watermark     (custom plugin)        │
│  5. jpeg-compressor × 3 (3 output variants)    │
└────────────────────────────────────────────────┘
       │
       ▼
  Watermarked, compressed blobs
  Queue items have status "complete"
  Original is always present (variant: "original")
       │
       ▼
  You upload via signed URL / fetch / your transport
```

## Installation

```bash
npm install @vivsh1999/upupload
npm install browser-image-compression  # for jpeg-compressor
npm install libraw-wasm                # for raw-to-jpeg
npm install heic-decode utif           # optional HEIC/TIFF
```

## Complete Implementation

### 1. Custom Watermark Plugin

The watermark plugin uses the `Plugin` class — the single canonical way to create plugins. No factory wrapper needed, no `definePlugin` call.

```ts
import { Plugin } from "@vivsh1999/upupload/plugins";
import type { PipelineResult, PipelineSource } from "@vivsh1999/upupload/core";

export interface BrandWatermarkOptions {
  /** Watermark text or logo label. */
  brand: string;
  /** Opacity 0–1. Default: 0.3. */
  opacity?: number;
  /** Position. Default: "bottom-right". */
  position?: "bottom-right" | "center" | "tile";
  /** Enable debug logging. */
  debug?: boolean;
}

/**
 * Watermark plugin that overlays a brand label on product images.
 *
 * Reads the current working file from the pipeline's generic
 * `pipeline:current` shared key — no coupling to any specific upstream plugin.
 */
export const brandWatermarkPlugin = new Plugin<BrandWatermarkOptions>({
  id: "brand-watermark",
  name: "Brand Watermark Plugin",
  options: { brand: "" },
  supports: (file) => (file.type ?? "").startsWith("image/"),
  sharedKeys: { output: "brand-watermark:output" },
  createStages: (input, opts, classif, ctx) => [
    {
      id: "apply-watermark",
      run: async () => {
        // Read the current working file from the pipeline's generic key.
        // Every upstream stage writes its output here — no coupling needed.
        const sourceFile =
          (ctx.shared.get("pipeline:current") as File | undefined) ?? (input.file as File);

        const img = new Image();
        const url = URL.createObjectURL(sourceFile);
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error("Image load failed"));
          img.src = url;
        });
        URL.revokeObjectURL(url);

        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const cctx = canvas.getContext("2d")!;
        cctx.drawImage(img, 0, 0);

        const opacity = opts.opacity ?? 0.3;
        cctx.globalAlpha = opacity;
        cctx.fillStyle = "#ffffff";
        cctx.font = `${Math.max(16, Math.round(canvas.width / 40))}px sans-serif`;
        cctx.textAlign = "right";
        cctx.textBaseline = "bottom";

        const pos = opts.position ?? "bottom-right";
        if (pos === "bottom-right") {
          cctx.fillText(opts.brand, canvas.width - 20, canvas.height - 20);
        } else if (pos === "center") {
          cctx.textAlign = "center";
          cctx.textBaseline = "middle";
          cctx.fillText(opts.brand, canvas.width / 2, canvas.height / 2);
        } else if (pos === "tile") {
          const stepY = Math.max(80, Math.round(canvas.height / 6));
          const stepX = Math.max(120, Math.round(canvas.width / 4));
          cctx.textAlign = "center";
          cctx.textBaseline = "middle";
          for (let y = stepY; y < canvas.height; y += stepY) {
            for (let x = stepX; x < canvas.width; x += stepX) {
              cctx.fillText(opts.brand, x, y);
            }
          }
        }

        cctx.globalAlpha = 1;

        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob((b) => resolve(b), "image/jpeg", 0.98),
        );
        if (!blob) {
          return {
            artifacts: [],
            info: [
              {
                level: "warn",
                message: `Watermark failed for "${input.name}".`,
                code: "watermark_failed",
              },
            ],
            removeFromQueue: false,
          };
        }

        const watermarked = new File([blob], `${classif.stemName}.watermarked.jpg`, {
          type: "image/jpeg",
          lastModified: Date.now(),
        });
        // Write back to pipeline:current so downstream compressors pick it up
        ctx.shared.set("pipeline:current", watermarked);
        ctx.shared.set("brand-watermark:output", watermarked);

        return { artifacts: [], info: [], removeFromQueue: false };
      },
    },
  ],
});
```

**How it works in the pipeline:**

1. `original` stage writes the source file to generic `pipeline:current` shared key
2. `raw-to-jpeg` decodes RAW/HEIC/TIFF → replaces `pipeline:current` with the decoded JPEG
3. `brand-watermark` reads from `pipeline:current` (gets decoded JPEG, or original for plain images), draws the watermark, writes the result back to `pipeline:current`
4. Each `jpeg-compressor` instance reads from `pipeline:current` (gets the watermarked image) and compresses it

### 2. Plugin Registry + Pipeline Definitions

```tsx
import { useMemo, useState } from "react";
import { useFileUpload, PluginProvider } from "@vivsh1999/upupload/react";
import { rawToJpeg, jpegCompressor } from "@vivsh1999/upupload/plugins";

const pp = new PluginProvider([
  rawToJpeg,
  brandWatermarkPlugin.with({ brand: "© Marketplace" }),
  jpegCompressor.with({ variant: "display", quality: 85, maxLongEdge: 1920, maxSizeMB: 1 }),
]);

function ProductUploader() {
  const [category, setCategory] = useState<"clothing" | "electronics" | "default">("default");

  const pipelines = useMemo(() => {
    const base = {
      id: "products",
      pipelines: [
        {
          id: "clothing",
          supports: () => category === "clothing",
          plugins: [
            pp.rawToJpeg(),
            pp.brandWatermark({ brand: "© Marketplace" }),
            pp.jpegCompressor({ variant: "display", maxLongEdge: 1200 }),
            pp.jpegCompressor({
              variant: "thumbnail",
              quality: 78,
              maxLongEdge: 400,
              maxSizeMB: 0.2,
            }),
          ],
        },
        {
          id: "electronics",
          supports: () => category === "electronics",
          plugins: [
            pp.rawToJpeg(),
            pp.brandWatermark({ brand: "© Marketplace", opacity: 0.25, position: "center" }),
            pp.jpegCompressor({ variant: "display", maxLongEdge: 1600 }),
            pp.jpegCompressor({ variant: "zoom", quality: 92, maxLongEdge: 2400, maxSizeMB: 2 }),
            pp.jpegCompressor({
              variant: "thumbnail",
              quality: 78,
              maxLongEdge: 400,
              maxSizeMB: 0.2,
            }),
          ],
        },
        {
          id: "other",
          plugins: [
            pp.rawToJpeg(),
            pp.brandWatermark({ brand: "© Marketplace" }),
            pp.jpegCompressor({ variant: "display", maxLongEdge: 1200 }),
            pp.jpegCompressor({
              variant: "thumbnail",
              quality: 78,
              maxLongEdge: 400,
              maxSizeMB: 0.2,
            }),
          ],
        },
      ],
    };
    return [base];
  }, [category]);

  const {
    queue,
    startUpload,
    clear,
    retry,
    cancelUpload,
    isBusy,
    getDropTargetProps,
    getFileInputProps,
  } = useFileUpload({
    plugins: pp.plugins,
    pipeline: pipelines,
    maxNumberOfFiles: 50,
    tuning: { maxConcurrency: 3 },
    getMeta: (file) => ({ category }),
    onWarning: (msg) => console.warn("[uploader]", msg),
    onError: (err, ctx) => console.error(`Failed: ${ctx?.fileName}`, err),
    onFileComplete: (item) => {
      const uploadables = item.artifacts?.filter((a) => a.variant !== "original") ?? [];
      for (const art of uploadables) {
        // Upload each variant to your product media service
        const form = new FormData();
        form.append("file", art.blob, art.filename);
        form.append("variant", art.variant);
        form.append("productId", /* from your state */ "");
        fetch("/api/products/media", { method: "POST", body: form }).catch((err) =>
          console.error(`Upload failed for ${art.filename}`, err),
        );
      }
    },
  });

  return (
    <div className="product-uploader">
      <select value={category} onChange={(e) => setCategory(e.target.value as any)}>
        <option value="clothing">Clothing</option>
        <option value="electronics">Electronics</option>
        <option value="default">Other</option>
      </select>

      <div {...getDropTargetProps()} className="drop-zone">
        <input {...getFileInputProps()} accept="image/*" />
        <p>Drop product photos here</p>
      </div>

      <ul className="file-list">
        {queue.map((item) => (
          <li key={item.id}>
            {item.previewUrl && <img src={item.previewUrl} width={60} />}
            <span>
              {item.name} — {item.status}
            </span>
            {item.status === "error" && <button onClick={() => retry(item.id)}>Retry</button>}
          </li>
        ))}
      </ul>

      <button onClick={() => startUpload()} disabled={isBusy}>
        {isBusy ? "Processing..." : "Process & Upload"}
      </button>
      <button onClick={clear}>Clear</button>
    </div>
  );
}
```

### 3. Server-Side Handler (Minimal)

```ts
// server/routes/products/media.ts
import { createWriteStream } from "node:fs";
import { resolve, dirname } from "node:path";
import { mkdir } from "node:fs/promises";

export async function handleProductMediaUpload(request: Request) {
  const form = await request.formData();
  const file = form.get("file") as File;
  const variant = form.get("variant") as string;
  const productId = form.get("productId") as string;

  const dir = resolve("./media", productId, variant);
  await mkdir(dir, { recursive: true });
  const stream = createWriteStream(resolve(dir, file.name));
  // pipe file stream to disk
  // ... store URL reference in your product DB
}
```

## What the Marketplace Receives

| Seller's file                | Stored variants (all watermarked)                 |
| ---------------------------- | ------------------------------------------------- |
| `IMG_1234.HEIC` (3 MB phone) | `display.jpg` (500 KB) + `thumbnail.jpg` (120 KB) |
| `DSC_0001.CR3` (28 MB RAW)   | `display.jpg` (700 KB) + `thumbnail.jpg` (150 KB) |
| `product-v2.jpeg` (8 MB)     | `display.jpg` (600 KB) + `thumbnail.jpg` (130 KB) |
| `front-view.png` (12 MB)     | `display.jpg` (650 KB) + `thumbnail.jpg` (140 KB) |

For electronics: also `zoom.jpg` (2 MB, 2400px, 92% quality, watermarked).

## Custom Plugin Details

### How `brand-watermark` Integrates

1. **Uses `pipeline:current` key**: reads from the generic pipeline-current shared key. Every stage writes its output there — `original` stage sets it to the source file, `raw-to-jpeg` replaces it with decoded JPEG. No plugin-specific keys needed.
2. **Virtual stage**: produces no artifact — mutates shared state. Downstream stages consume the result.
3. **`.with()` variants**: `brandWatermarkPlugin.with({ opacity: 0.5 })` creates a derived instance with merged options. No factory needed.
4. **Per-category overrides**: `PluginProvider` auto-generates `pp.brandWatermark({...})` from the plugin's id.
5. **Fallback**: if watermark canvas rendering fails, the stage returns `{ artifacts: [], info: [warn] }` — pipeline continues, compressors fall back to the unwatermarked original.

### Why `Plugin` Class Over Raw `ProcessingPlugin`

| `new Plugin({...})`                            | Raw `ProcessingPlugin` object         |
| ---------------------------------------------- | ------------------------------------- |
| Single canonical API — class, not ad-hoc       | Must manually match the interface     |
| `options` and `sharedKeys` are readonly        | Must declare `readonly` yourself      |
| `.with()` for option overrides                 | Must write a factory function         |
| Self-documenting — intellisense in constructor | No constructor, all properties manual |

## Publishing to npm

The watermark plugin is self-contained — it doesn't depend on a specific upstream plugin instance. The developer can publish it as a standalone npm package that anyone can install and use.

### Package Structure

```
brand-watermark/
├── package.json
├── tsconfig.json
├── README.md
├── src/
│   └── index.ts        # ← the plugin code
└── node_modules/
```

### `package.json`

```json
{
  "name": "brand-watermark",
  "version": "1.0.0",
  "type": "module",
  "files": ["dist"],
  "exports": {
    ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" }
  },
  "scripts": {
    "build": "tsc",
    "prepublishOnly": "npm run build"
  },
  "peerDependencies": {
    "@vivsh1999/upupload": "^0.0.4"
  },
  "devDependencies": {
    "@vivsh1999/upupload": "^0.0.4",
    "typescript": "^5.0.0"
  }
}
```

### Published Entry Point (`src/index.ts`)

````ts
import { Plugin } from "@vivsh1999/upupload/plugins";

export interface BrandWatermarkOptions {
  brand: string;
  opacity?: number;
  position?: "bottom-right" | "center" | "tile";
  debug?: boolean;
}

/**
 * Watermark plugin that overlays a brand label on images.
 *
 * Reads from the pipeline's generic `pipeline:current` shared key — works
 * with any upstream plugin that writes to it (raw-to-jpeg, custom decoders, etc.).
 *
 * @example
 * ```ts
 * import { brandWatermarkPlugin } from "brand-watermark";
 *
 * const pp = new PluginProvider([
 *   rawToJpeg,
 *   brandWatermarkPlugin.with({ brand: "© Acme" }),
 * ]);
 * ```
 */
export const brandWatermarkPlugin = new Plugin<BrandWatermarkOptions>({
  id: "brand-watermark",
  name: "Brand Watermark Plugin",
  options: { brand: "" },
  supports: (file) => (file.type ?? "").startsWith("image/"),
  sharedKeys: { output: "brand-watermark:output" },
  createStages: (input, opts, classif, ctx) => [
    {
      id: "apply-watermark",
      run: async () => {
        // Read from the pipeline's generic current-file key.
        // Upstream stages (raw-to-jpeg, custom decoders) write here.
        const sourceFile =
          (ctx.shared.get("pipeline:current") as File | undefined) ?? (input.file as File);

        const img = new Image();
        const url = URL.createObjectURL(sourceFile);
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error("Image load failed"));
          img.src = url;
        });
        URL.revokeObjectURL(url);

        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const cctx = canvas.getContext("2d")!;
        cctx.drawImage(img, 0, 0);

        const opacity = opts.opacity ?? 0.3;
        cctx.globalAlpha = opacity;
        cctx.fillStyle = "#ffffff";
        cctx.font = `${Math.max(16, Math.round(canvas.width / 40))}px sans-serif`;
        cctx.textAlign = "right";
        cctx.textBaseline = "bottom";

        const pos = opts.position ?? "bottom-right";
        if (pos === "bottom-right") {
          cctx.fillText(opts.brand, canvas.width - 20, canvas.height - 20);
        } else if (pos === "center") {
          cctx.textAlign = "center";
          cctx.textBaseline = "middle";
          cctx.fillText(opts.brand, canvas.width / 2, canvas.height / 2);
        } else if (pos === "tile") {
          const stepY = Math.max(80, Math.round(canvas.height / 6));
          const stepX = Math.max(120, Math.round(canvas.width / 4));
          cctx.textAlign = "center";
          cctx.textBaseline = "middle";
          for (let y = stepY; y < canvas.height; y += stepY) {
            for (let x = stepX; x < canvas.width; x += stepX) {
              cctx.fillText(opts.brand, x, y);
            }
          }
        }

        cctx.globalAlpha = 1;

        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob((b) => resolve(b), "image/jpeg", 0.98),
        );
        if (!blob) {
          return {
            artifacts: [],
            info: [
              {
                level: "warn",
                message: `Watermark failed for "${input.name}".`,
                code: "watermark_failed",
              },
            ],
            removeFromQueue: false,
          };
        }

        const watermarked = new File([blob], `${classif.stemName}.watermarked.jpg`, {
          type: "image/jpeg",
          lastModified: Date.now(),
        });
        // Write back to pipeline:current so downstream compressors pick it up
        ctx.shared.set("pipeline:current", watermarked);
        ctx.shared.set("brand-watermark:output", watermarked);

        return { artifacts: [], info: [], removeFromQueue: false };
      },
    },
  ],
});
````

### Consumer Usage

After publishing to npm, a consumer installs and uses it:

```bash
npm install brand-watermark
```

```ts
import { brandWatermarkPlugin } from "brand-watermark";
import { rawToJpeg, jpegCompressor } from "@vivsh1999/upupload/plugins";
import { PluginProvider } from "@vivsh1999/upupload/react";

// Everything uses `.with()` — same pattern, same Plugin class
const pp = new PluginProvider([
  rawToJpeg,
  brandWatermarkPlugin.with({ brand: "© Acme Marketplace" }),
  jpegCompressor.with({ quality: 85, maxLongEdge: 1920, maxSizeMB: 1 }),
]);

// In pipeline definitions (PluginProvider auto-generates typed methods):
pp.brandWatermark({ opacity: 0.25 });
pp.jpegCompressor({ variant: "thumbnail", quality: 78 });
```

### Why No `inputSharedKey` Option

The plugin reads from `pipeline:current` — a well-known shared key that every pipeline stage writes its output to. The built-in `original` stage always sets it to the source file. Upstream plugins like `raw-to-jpeg` replace it with their decoded output. Downstream plugins like `jpeg-compressor` read from it.

No configuration needed. No magic strings. No coupling to any specific upstream plugin.

The `.with()` pattern means consumers never write a factory. The base `Plugin` instance is the template; `.with({...})` spawns a derived instance with merged options — clean, typed, chainable.

## Security Notes

- **Watermark is unavoidable**: the brand-watermark plugin runs before compressors in every pipeline. There's no code path where a compressed variant reaches storage without going through the watermark stage.
- **`maxNumberOfFiles: 50`** — prevents abuse from bulk uploads.
- **Validate on server**: even though the client watermarks and compresses, validate file dimensions, max file size, and content type on receipt.
- **Authenticate upload endpoints**: attach a session token or API key to the upload request.
- **Serve watermarked images over CDN**: set `Cache-Control: public, max-age=31536000, immutable` for performance.

## Pipeline Variant Reference

| Variant     | Category    | Quality | Max Edge | Max Size | Watermark          |
| ----------- | ----------- | ------- | -------- | -------- | ------------------ |
| `display`   | All         | 85%     | 1200px   | 1 MB     | bottom-right, 30%  |
| `thumbnail` | All         | 78%     | 400px    | 200 KB   | bottom-right, 30%  |
| `zoom`      | Electronics | 92%     | 2400px   | 2 MB     | center, 25%        |
| `original`  | All         | —       | —        | —        | raw (no watermark) |

The original file passes through unmodified. Filter it out unless your product detail page needs it for zoom: `artifacts.filter(a => a.variant !== "original")`.
