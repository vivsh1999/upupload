# Configuration

## `BrowserPipelineOptions`

```ts
type BrowserPipelineOptions = {
  /** Log verbosity level ("silent" | "error" | "warn" | "info" | "debug") */
  logLevel?: "silent" | "error" | "warn" | "info" | "debug";
  /** Offload image processing (resizing, JPEG compression) to a background Web Worker */
  useWorker?: boolean;
};
```

The pipeline-level options configure global logging (`logLevel`) and background thread offloading (`useWorker`). All processing tuning (quality, resolution, size) is configured per-plugin via each plugin's typed options.

When `useWorker` is `true`, compression is dispatched one job per source file across a pool of up to `min(4, hardwareConcurrency)` background workers. With the React hook, pass it through `pipelineConfig` (every field is forwarded):

```ts
useFileUpload({ pipelineConfig: { useWorker: true, logLevel: "warn" } });
```

## Plugin Options

Plugins use the `Plugin` class with the `.with()` pattern:

```ts
import { rawToJpeg, jpegCompressor, videoPoster } from "@vivsh1999/upupload/plugins";

// RAW/HEIC/TIFF decoder — accepts only `debug`:
rawToJpeg;
rawToJpeg.with({ debug: true });

// JPEG/PNG/WebP compressor — set base defaults:
jpegCompressor.with({ quality: 80, maxLongEdge: 1920, maxSizeMB: 1 });
// Defaults: `variant` → `"outputFile"`, `maxLongEdge` → `-1` (original size).

// ...or emit several sizes from a single decode:
jpegCompressor.with({
  variants: [
    { variant: "outputFile", quality: 80, maxLongEdge: 1920, maxSizeMB: 1 },
    { variant: "thumb", quality: 60, maxLongEdge: 400, maxSizeMB: 0.25 },
  ],
});

// Video poster frame:
videoPoster.with({ variant: "poster", maxEdge: 640 });
videoPoster.with({ produceArtifact: false }); // Set context only, no artifact
```

For multi-instance setups, use `instanceId` to disambiguate:

```ts
jpegCompressor.with({ variant: "optimized", quality: 80 }, { instanceId: "opt" });
jpegCompressor.with(
  { variant: "thumbnail", quality: 78, maxLongEdge: 320 },
  { instanceId: "thumb" },
);
```

## Preset `upload()`

```ts
import { upload } from "@vivsh1999/upupload/preset";

interface UploadOptions {
  quality?: number; // 1–100, default: 90
  maxLongEdge?: number | "original"; // default: 3840
  optimizedMaxSizeMB?: number; // default: 1
  saveOriginal?: boolean; // default: false
  onArtifact?: (result: PipelineResult) => void | Promise<void>;
  uploadArtifact?: (artifact: {
    variant: string;
    file: Blob;
    filename: string;
    filetype: string;
  }) => void | Promise<void>;
}

const result = await upload(file, {
  quality: 80,
  saveOriginal: true,
  uploadArtifact: async (artifact) => {
    await fetch("/api/upload", { method: "POST", body: artifact.file });
  },
});
```

Note: The preset is a convenience wrapper. For full control, use `runDefaultBrowserPipeline` directly with your own plugin configuration.

## React Hook Options

For the full option reference, see [React Hook](./react.md). Key new options in 0.2.0:

| Option                        | Type                      | Description                                      |
| ----------------------------- | ------------------------- | ------------------------------------------------ |
| `maxFileSize`                 | `number`                  | Maximum bytes per file.                          |
| `maxTotalBatchSize`           | `number`                  | Maximum total bytes across all queued files.     |
| `maxQueuedUploads`            | `number`                  | Backpressure limit for files in uploading state. |
| `autoPreventTabClose`         | `boolean`                 | Prevent tab close while busy.                    |
| `autoPauseOnOffline`          | `boolean`                 | Auto-pause on network disconnect.                |
| `autoWakeLock`                | `boolean`                 | Keep screen awake while busy.                    |
| `persistence`                 | `"memory" \| "indexeddb"` | Persist queue metadata across reloads.           |
| `tuning.maxUploadConcurrency` | `number`                  | Separate upload concurrency limit.               |
