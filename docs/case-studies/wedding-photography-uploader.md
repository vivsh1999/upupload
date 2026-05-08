# Wedding Photography Client Proofing Uploader

A case study for building a wedding photography uploader with UpUpload. Photographers drag-and-drop RAW, HEIC, TIFF, and JPEG files from their cameras; the library converts everything to client-friendly JPEGs using browser-side plugins. Upload is fully user-managed — you choose the transport.

## Scenario

- **Who**: Wedding photographers managing client galleries.
- **Input**: RAW camera files (CR3, DNG, NEF, ARW, etc.), HEIC/HEIF from iPhones, TIFF scans, JPEGs, PNGs — any format the photographer shoots with.
- **Output**: Lightweight, optimized JPEGs and thumbnails ready for upload to your server. The original file is always available as an artifact — filter it out if you don't want to store it.
- **Key constraint**: Clients browse on mobile and desktop. Files must be small enough to load quickly in a gallery, yet sharp enough for proofing decisions.

## Architecture

```
Browser Input (RAW / HEIC / TIFF / JPEG / PNG)
       │
       ▼
┌─────────────────────────────────────────────┐
│  UpUpload Pipeline                          │
│                                             │
│  1. validate-allowlist   (reject non-media) │
│  2. original             (always included)  │
│  3. raw-to-jpeg plugin   (decode RAW/HEIC)  │
│  4. jpeg-compressor × 2  (2 output variants)│
│  5. video-poster          (poster frames)    │
└─────────────────────────────────────────────┘
       │
       ▼
  Processed Blobs (with blob: URLs)
  Queue items have status "complete"
  Original is always present (variant: "original")
       │
       ▼
  You upload via TUS / fetch / custom handler
```

## Package Installation

```bash
npm install @vivsh1999/upupload
```

## Complete Implementation

### 1. React Hook — `useMediaUpload`

```tsx
import { useMemo, useState } from "react";
import {
  useMediaUpload,
  type UseMediaUploadOptions,
  type MediaUploadQueueItem,
} from "@vivsh1999/upupload/react";
import { createRawToJpegPlugin } from "@vivsh1999/upupload/plugins/raw-to-jpeg";
import { createJpegCompressorPlugin } from "@vivsh1999/upupload/plugins/jpeg-compressor";
import { createVideoPosterPlugin } from "@vivsh1999/upupload/plugins/video-poster";

// Optional: implement TUS upload yourself
// npm install tus-js-client
import * as tus from "tus-js-client";

async function uploadBlob(blob: Blob, meta: { variant: string; filename: string }) {
  return new Promise<void>((resolve, reject) => {
    const upload = new tus.Upload(blob, {
      endpoint: "https://uploads.example.com/files/",
      chunkSize: 5 * 1024 * 1024,
      metadata: meta,
      onError: reject,
      onSuccess: resolve,
    });
    upload.start();
  });
}

function WeddingUploader() {
  // ── Plugin registry (just initiation with defaults) ──
  const registry = useMemo(
    () => [
      createRawToJpegPlugin(),
      createJpegCompressorPlugin({ quality: 80, maxLongEdge: 1920, maxSizeMB: 1 }),
      createVideoPosterPlugin({ variant: "poster", maxEdge: 640 }),
    ],
    [],
  );

  // ── Reactive config for pipeline overrides ──
  const [quality, setQuality] = useState(85);
  const [maxLongEdge, setMaxLongEdge] = useState<number | "original">(2560);

  // ── Pipeline definitions reference plugins by ID with overrides ──
  const pipelines = useMemo(
    () => [
      {
        id: "media",
        supports: () => true,
        pipelines: [
          {
            id: "raw-and-raster",
            supports: (f: any) => !f.type?.startsWith("video/"),
            plugins: [
              { id: "raw-to-jpeg" },
              { id: "jpeg-compressor", opts: { variant: "client-proof", quality, maxLongEdge } },
              {
                id: "jpeg-compressor",
                opts: { variant: "gallery-thumb", quality: 78, maxLongEdge: 640, maxSizeMB: 0.25 },
              },
            ],
          },
          {
            id: "video",
            supports: (f: any) => f.type?.startsWith("video/"),
            plugins: [{ id: "video-poster" }],
          },
        ],
      },
    ],
    [quality, maxLongEdge],
  );

  const {
    queue,
    startUpload,
    clear,
    retry,
    cancelUpload,
    isBusy,
    isDragOver,
    getDropTargetProps,
    getFileInputProps,
    getFolderInputProps,
  } = useMediaUpload({
    plugins: registry, // ← plugin registry
    pipeline: pipelines, // ← pipeline defs with plugin refs and overrides
    pipelineConfig: {
      debug: false,
    },
    tuning: {
      maxConcurrency: 3,
    },
    maxNumberOfFiles: 200,
    tuning: {
      maxConcurrency: 3, // Limit simultaneous processing (auto-detected by default)
    },
    maxNumberOfFiles: 200,
    onInfo: (msg) => console.log("[upupload]", msg),
    onWarning: (msg) => showToast(msg, "warning"),
    onError: (err, ctx) => {
      console.error("Processing failed:", ctx?.fileName, err);
      showToast(`Failed to process ${ctx?.fileName ?? "file"}`, "error");
    },
    onFileComplete: (item) => {
      // Original is always included (variant: "original").
      // Filter it out if you don't want to upload it:
      const uploadables = item.artifacts?.filter((a) => a.variant !== "original") ?? [];
      const variantNames = uploadables.map((a) => a.variant).join(", ") ?? "none";
      showToast(`${item.name} ready (${variantNames})`, "success");

      // Upload the processed blobs with TUS
      for (const artifact of uploadables) {
        uploadBlob(artifact.blob, { variant: artifact.variant, filename: artifact.filename })
          .then(() => console.log(`Uploaded ${artifact.filename}`))
          .catch((err) => console.error(`Upload failed for ${artifact.filename}`, err));
      }
    },
  });

  return (
    <div className="uploader">
      <div
        {...getDropTargetProps<HTMLDivElement>()}
        className={`drop-zone ${isDragOver ? "drag-over" : ""}`}
      >
        <p>Drop wedding photos here</p>
        <button {...getFileInputProps<HTMLButtonElement>()}>Select Files</button>
        <button {...getFolderInputProps<HTMLButtonElement>()}>Select Folder</button>
        <p className="hint">Supports RAW, HEIC, TIFF, JPEG, PNG — optimized for client proofing</p>
      </div>

      {/* Quality control — changes trigger plugin recreation via useMemo */}
      <div className="controls">
        <label>
          Quality: {quality}%
          <input
            type="range"
            min={50}
            max={100}
            value={quality}
            onChange={(e) => setQuality(Number(e.target.value))}
          />
        </label>
        <label>
          Max resolution:
          <select
            value={String(maxLongEdge)}
            onChange={(e) => {
              const v = e.target.value;
              setMaxLongEdge(v === "original" ? "original" : Number(v));
            }}
          >
            <option value={1920}>1920px (HD)</option>
            <option value={2560}>2560px (QHD)</option>
            <option value={3840}>3840px (4K)</option>
            <option value="original">Original size</option>
          </select>
        </label>
      </div>

      {/* File list */}
      <ul className="file-list">
        {queue.map((item) => (
          <li key={item.id} className={`item status-${item.status}`}>
            {item.previewUrl && <img src={item.previewUrl} alt={item.name} className="thumb" />}
            <div className="info">
              <span className="name">{item.name}</span>
              <span className="status">
                {item.status === "processing" && `Processing ${item.progress}%`}
                {item.status === "complete" &&
                  item.artifacts?.map((a) => <span key={a.variant}>{a.variant}: done</span>)}
                {item.status === "error" && <span className="error">{item.error}</span>}
              </span>
            </div>
            <div className="actions">
              {item.status === "error" && <button onClick={() => retry(item.id)}>Retry</button>}
              {(item.status === "idle" || item.status === "processing") && (
                <button onClick={() => cancelUpload(item.id)}>Cancel</button>
              )}
            </div>
          </li>
        ))}
      </ul>

      <div className="actions-bar">
        <button onClick={() => startUpload()} disabled={isBusy || queue.length === 0}>
          {isBusy ? "Processing..." : "Start Processing"}
        </button>
        <button onClick={clear} disabled={isBusy}>
          Clear All
        </button>
      </div>
    </div>
  );
}
```

### 2. Server-Side TUS Handler (Minimal Example)

```ts
// server/tus-handler.ts
import { createWriteStream } from "node:fs";
import { resolve } from "node:path";

const UPLOAD_DIR = resolve("./uploads/client-galleries");

// TUS metadata extracted from upload headers:
//   Upload-Metadata: variant Y2xpZW50LXByb29mLCBmaWxlbmFtZSBwaG90by5qcGc=
//
// Use the metadata to organize files:
//   ./uploads/client-galleries/{job-id}/client-proof/photo.jpg
//   ./uploads/client-galleries/{job-id}/gallery-thumb/photo.thumb.jpg
```

### 3. What the Client Sees

After processing and upload, the client gallery receives files like:

| Photographer's file            | Client receives                                                                    |
| ------------------------------ | ---------------------------------------------------------------------------------- |
| `DSC_0001.NEF` (25 MB RAW)     | `DSC_0001.client-proof.jpg` (900 KB) + `DSC_0001.gallery-thumb.jpg` (180 KB)       |
| `IMG_4567.HEIC` (4 MB HEIC)    | `IMG_4567.client-proof.jpg` (600 KB) + `IMG_4567.gallery-thumb.jpg` (150 KB)       |
| `wedding-001.jpeg` (8 MB JPEG) | `wedding-001.client-proof.jpg` (800 KB) + `wedding-001.gallery-thumb.jpg` (200 KB) |

No original files are stored — the server never sees the RAW/HEIC originals.

## Pipeline Internals

### How RAW Decoding Works (Client-Side)

The `createRawToJpegPlugin()` acts as a **pure decoder** — it uses **LibRaw compiled to WebAssembly** running in the photographer's browser:

1. The RAW file (e.g., `photo.cr3`) is read as an `ArrayBuffer`.
2. LibRaw WASM decodes it to an in-memory JPEG at the camera's full resolution.
3. That decoded JPEG is placed in the **shared pipeline context** under a well-known key.

HEIC and TIFF files follow a similar path using `heic-decode`/`heic2any` and `utif` respectively.

Each `{ id: "jpeg-compressor", opts }` reference in the pipeline reads the decoded JPEG from the shared context and applies the configured compression. Multiple compressor refs share the same single decode:

```ts
{ id: "raw-to-jpeg" },
{ id: "jpeg-compressor", opts: { variant: "client-proof", quality, ... } },
{ id: "jpeg-compressor", opts: { variant: "gallery-thumb", quality, ... } },
```

### Plugin Preloading

Decoders are pre-warmed automatically when `useMediaUpload` mounts — no manual `preloadBrowserPipelineForFiles` call needed. Each plugin's `.preload()` method dynamically imports the required WASM/JS decoders in the background.

### Fallback Behavior

| Failure                | Result                                                                 |
| ---------------------- | ---------------------------------------------------------------------- |
| RAW decode fails       | Original artifact remains; compressors fall back to original bytes     |
| JPEG compression fails | Variant is skipped with a warning; other variants continue             |
| File not in allowlist  | Removed from queue (no processing, no error)                           |
| Processing cancelled   | `cancelUpload(fileId)` aborts via AbortSignal; item removed from queue |

The original file is **always included** as artifact variant `"original"`. If you don't want to store it upstream, filter it from the result: `artifacts.filter(a => a.variant !== "original")`.

## Security Notes for Production

- **Set a `maxNumberOfFiles`** to prevent abuse (200 is reasonable for a wedding gallery).
- **Authenticate the TUS endpoint** — UpUpload doesn't handle auth; add a token to your `tus.Upload` options or use `fetch` directly.
- **Rate-limit on the server** — client-side decoding is CPU-intensive but server uploads should also be throttled.
- **Validate file sizes on the server** — even though the client compresses to ≤ 1 MB, validate on receipt.
- **Run the TUS server behind a reverse proxy** (nginx, Caddy) for HTTPS and connection pooling.

## One Decoder, Multiple Compressors

RAW/HEIC/TIFF files are decoded **once** by `createRawToJpegPlugin()`, which places the result in the shared pipeline context. Each `{ id: "jpeg-compressor", opts }` reference in the pipeline produces one compressed variant from that shared decode.

```ts
const registry = [createRawToJpegPlugin(), createJpegCompressorPlugin({ quality: 80, ... })];

const pipelines: PipelineDef[] = [{
  id: "media",
  supports: () => true,
  plugins: [
    { id: "raw-to-jpeg" },
    { id: "jpeg-compressor", opts: { variant: "web-gallery", quality: 85, ... } },
    { id: "jpeg-compressor", opts: { variant: "4k-archive", quality: 92, ... } },
    { id: "jpeg-compressor", opts: { variant: "thumbnail", quality: 78, ... } },
  ],
}];
```

Each compressor reference can override `quality`, `maxLongEdge`, and `maxSizeMB` independently.

## Per-Type Pipeline Definitions

For larger applications you can define **multiple pipeline definitions** — each handling a specific file type — via the `pipeline` option. Each definition pairs a `supports()` classifier with its own set of plugins. Pipelines are **recursive**: a parent pipeline can contain sub-pipelines, forming a routing tree.

```ts
import {
  isCameraRawImage,
  isVideoLike,
  isAudioLike,
  type PipelineDef,
} from "@vivsh1999/upupload/browser";

// Plugin registry — factories define defaults only
const registry = [
  createRawToJpegPlugin(),
  createJpegCompressorPlugin({ quality: 80, maxLongEdge: 1920, maxSizeMB: 1 }),
  createVideoPosterPlugin({ variant: "poster" }),
];

// Pipeline definitions — reference plugins by ID with overrides
const pipelines: PipelineDef[] = [
  {
    id: "media",
    supports: () => true,
    pipelines: [
      {
        id: "raw-photo",
        supports: (f) => isCameraRawImage(f),
        plugins: [
          { id: "raw-to-jpeg" },
          { id: "jpeg-compressor", opts: { variant: "client-proof", quality: 85, maxLongEdge: 2560 } },
        ],
      },
      {
        id: "raster-photo",
        supports: (f) => !isCameraRawImage(f) && !isVideoLike(f) && !isAudioLike(f),
        plugins: [
          { id: "jpeg-compressor", opts: { variant: "client-proof", quality: 85, maxLongEdge: 2560 } },
        ],
      },
      {
        id: "video",
        supports: (f) => isVideoLike(f),
        plugins: [{ id: "video-poster" }],
      },
    ],
  },
];

// Pass both:
useMediaUpload({ plugins: registry, pipeline: pipelines, ... });
```

The router descends recursively. When a pipeline references `{ id: "jpeg-compressor", opts: {...} }`, the plugin is looked up in the registry and its options are merged with the overrides. Common stages (`validate-allowlist`, `original`) are always included automatically.

## Nestable Pipeline Factory

For full control, use `Pipeline()` — a callback-based factory that receives the pipeline context and the source input, and returns stages. Pipelines are **nestable**: sub-pipelines are inlined at runtime, sharing the same context.

For full control, use `Pipeline()` from `@vivsh1999/upupload/core` — a callback-based factory that receives pipeline context and the source input, and returns stages or nested sub-pipelines. Run it with `runPipelineFrom`.

```ts
import { Pipeline, runPipelineFrom } from "@vivsh1999/upupload/core";

const pipeline = Pipeline((ctx, source) => [
  {
    id: "classify",
    when: () => ({ run: true }) as const,
    run: async (input, ctx) => {
      const isVideo = input.type?.startsWith("video/");
      ctx.shared.set("isVideo", isVideo);
      return { artifacts: [], info: [], removeFromQueue: false };
    },
  },
]);

const result = await runPipelineFrom(input, pipeline);
```

This is an advanced escape hatch — the `plugins` or `pipeline` options on `useMediaUpload` cover most needs.
