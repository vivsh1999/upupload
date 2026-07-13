# React Hook

## `useFileUpload`

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
    getMeta: (file) => ({ uploadedAt: Date.now() }),
  });

  return (
    <div
      {...getDropTargetProps()}
      style={{ border: isDragOver ? "2px dashed blue" : "2px dashed gray" }}
    >
      <input {...getFileInputProps()} />
      {queue.map((item) => (
        <div key={item.id}>
          {item.name} — {item.status} ({item.progress}%)
          {item.previewUrl && <img src={item.previewUrl} alt="" width={80} />}
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

### Options

```ts
interface UseFileUploadOptions<TMeta = void, TPreload = undefined> {
  plugins?: ProcessingPlugin<any>[];
  pipeline?: PipelineDef[];
  pipelineConfig?: Partial<BrowserPipelineOptions>;
  maxNumberOfFiles?: number;
  maxFileSize?: number; // Bytes per file
  maxTotalBatchSize?: number; // Bytes total across queue
  maxQueuedUploads?: number; // Upload backlog limit
  pruneUploadedArtifacts?: boolean; // Progressively prune completed binaries to save memory
  autoPreventTabClose?: boolean;
  autoPauseOnOffline?: boolean;
  autoWakeLock?: boolean;
  persistence?: "memory" | "indexeddb";
  tuning?: {
    maxConcurrency?: number; // Pipeline concurrency (auto-detected)
    maxUploadConcurrency?: number; // Upload adapter concurrency
  };
  uploadAdapter?: UploadAdapter<TPreload>; // Generic upload function
  getMeta?: (file: File) => TMeta;
  getPipelineContextMeta?: () => Record<string, unknown>;
  onInfo?: (message: string) => void;
  onWarning?: (message: string) => void;
  onError?: (error: Error, context?: { fileName?: string }) => void;
  onFileProcessed?: (item: FileUploadQueueItem<TMeta>) => void;
  onFileComplete?: (item: FileUploadQueueItem<TMeta>) => void;
  onBatchComplete?: (stats: BatchCompleteStats) => void;
  onBatchProgress?: (stats: BatchProgressStats) => void; // Live batch progress during processing/uploads
  onBeforeStart?: (files: FileUploadQueueItem<TMeta>[]) => Promise<TPreload>; // Batch pre-processing hook
  retryMode?: "pipeline" | "adapter-only"; // Controls retry behavior
}
```

#### New in 0.2.0

| Option                   | Description                                                             |
| ------------------------ | ----------------------------------------------------------------------- |
| `maxFileSize`            | Rejects files exceeding this size (bytes).                              |
| `maxTotalBatchSize`      | Rejects files that would push total queue size over limit.              |
| `maxQueuedUploads`       | Backpressure: defers new processing when this many files are uploading. |
| `pruneUploadedArtifacts` | Progressively revokes object URLs and empties completed binary Blobs.   |
| `autoPreventTabClose`    | Registers `beforeunload` while busy.                                    |
| `autoPauseOnOffline`     | Auto-pauses processing on network disconnect, resumes on reconnect.     |
| `autoWakeLock`           | Acquires screen wake lock while busy.                                   |
| `persistence`            | `"indexeddb"` persists queue metadata across page reloads.              |
| `uploadAdapter`          | Generic function to upload each artifact after pipeline processing.     |
| `getPipelineContextMeta` | Factory returning metadata injected into every file's pipeline context. |
| `onFileProcessed`        | Fires after pipeline completes (before upload adapter).                 |
| `onFileComplete`         | Fires after pipeline AND upload adapter resolve.                        |
| `onBatchComplete`        | Fires with cumulative stats when system transitions busy→idle.          |
| `onBatchProgress`        | Fires during processing/uploads with live batch stats.                  |
| `onBeforeStart`          | Async hook before batch starts — return typed via `TPreload` generic.   |
| `retryMode`              | `"pipeline"` (default) or `"adapter-only"` to skip re-compression.      |

### Return Value

```ts
interface UseFileUploadResult<TMeta = void> {
  config: BrowserPipelineOptions;
  updateConfig: (patch: Partial<BrowserPipelineOptions>) => void;
  queue: FileUploadQueueItem<TMeta>[];
  startUpload: (fileIds?: string[]) => Promise<void>;
  clear: () => void;
  retry: (fileId: string) => void;
  retryUpload: (fileId: string) => void; // Upload-only retry
  cancelUpload: (fileId: string) => void;
  cancelAll: () => void;
  pause: () => void; // Pause pipeline execution
  resume: () => void; // Resume + auto-start queued items
  isBusy: boolean;
  isPaused: boolean;
  isDragOver: boolean;
  getDropTargetProps: <T>(props?: T) => T & { onDrop; onDragOver; onDragEnter; onDragLeave };
  getFileInputProps: <T>(props?: T) => T & { type: "file"; multiple: true };
  getFolderInputProps: <T>(props?: T) => T & { type: "file"; multiple: true; webkitdirectory };
}
```

### Queue Item

```ts
type FileUploadQueueItem<TMeta = void> =
  | {
      id: string;
      name: string;
      file: File; // Available when needsReselect is false
      status: "idle" | "processing" | "uploading" | "complete" | "error";
      progress: number;
      error?: string;
      previewUrl?: string;
      meta?: TMeta;
      needsReselect: false;
      artifacts?: {
        variant: string;
        filename: string;
        blob: Blob;
        url?: string;
      }[];
    }
  | {
      id: string;
      name: string;
      file?: never; // Unavailable after IndexedDB restore
      status: "idle" | "processing" | "uploading" | "complete" | "error";
      progress: number;
      error?: string;
      previewUrl?: string;
      meta?: TMeta;
      needsReselect: true;
      artifacts?: {
        variant: string;
        filename: string;
        blob: Blob;
        url?: string;
      }[];
    };
```

Check `item.needsReselect` before accessing `item.file`:

```tsx
if (item.needsReselect) {
  // prompt user to re-select the file
} else {
  console.log(item.file.name);
}
```

### UploadAdapter

```ts
type UploadAdapter<TPreload = undefined> = (
  artifact: { variant: string; blob: Blob; filename: string; filetype: string },
  helpers: {
    onProgress: (progress: number) => void;
    signal?: AbortSignal;
    fileId: string; // File ID this artifact belongs to
    totalArtifacts: number; // Total artifacts for this file
    artifactIndex: number; // Index of this artifact (0-based)
    batch?: {
      files: FileUploadQueueItem[];
      batchId: string;
      preload?: TPreload; // Value from onBeforeStart, typed via generic
    };
  },
) => Promise<void>;
```

### BatchProgressStats

```ts
interface BatchProgressStats {
  totalFiles: number;
  succeeded: number;
  failed: number;
  totalBytes: number; // Sum of original file sizes
  uploadedBytes: number; // Estimated from per-file progress
}
```

### BatchCompleteStats

```ts
interface BatchCompleteStats {
  totalFiles: number;
  succeeded: number;
  failed: number;
  totalBytes: number;
  totalTimeMs: number;
}
```

## Example: Upload Adapter

```tsx
useFileUpload({
  plugins: [jpegCompressor.with({ quality: 80 })],
  uploadAdapter: async (
    artifact,
    { onProgress, signal, fileId, artifactIndex, totalArtifacts },
  ) => {
    // fileId, artifactIndex, totalArtifacts available for S3 multipart coordination
    await fetch("/api/upload", {
      method: "PUT",
      body: artifact.blob,
      headers: { "Content-Type": artifact.filetype },
      signal, // AbortSignal propagates from cancelUpload/cancelAll
    });
  },
  onBatchProgress: (stats) => {
    // Render a global progress bar
    console.log(
      `${stats.succeeded}/${stats.totalFiles} done, ${stats.uploadedBytes}/${stats.totalBytes} bytes`,
    );
  },
  onFileProcessed: (item) => {
    console.log(`${item.name} processed, starting upload...`);
  },
  onFileComplete: (item) => {
    console.log(`${item.name} fully done`);
  },
});
```

## Example: Pause/Resume

```tsx
const { pause, resume, isPaused, isBusy } = useFileUpload({ ... });

return (
  <div>
    <button onClick={pause} disabled={!isBusy || isPaused}>Pause</button>
    <button onClick={resume} disabled={!isPaused}>Resume</button>
  </div>
);
```

## Semaphore Utility

Built-in concurrency limiter. Available as a standalone utility:

```ts
import { Semaphore } from "@vivsh1999/upupload/react";

const sem = new Semaphore(4);
await Promise.all(tasks.map((t) => sem.run(() => process(t))));
```

The hook uses this internally with `tuning.maxConcurrency` and `tuning.maxUploadConcurrency` (defaults: auto-detected from CPU count).

---

## Pre-built Upload Adapters

UpUpload provides high-performance, tree-shakable pre-built upload adapters out-of-the-box inside `@vivsh1999/upupload/adapters` to handle uploads with built-in progress tracking.

### 1. `fetchUploadAdapter`

Suitable for standard multipart/form-data or binary REST endpoints. Uses `XMLHttpRequest` internally for accurate upload progress tracking.

```ts
import { fetchUploadAdapter } from "@vivsh1999/upupload/adapters";

useFileUpload({
  uploadAdapter: fetchUploadAdapter({
    url: "/api/upload",
    method: "POST",
    bodyFormat: "form-data", // or "binary" for raw binary uploads
    fieldName: "file",
    extraFields: (artifact) => ({
      variant: artifact.variant,
    }),
  }),
});
```

### 2. `s3UploadAdapter`

Suitable for direct uploads to Amazon S3 or Cloudflare R2 buckets using PUT presigned URLs.

```ts
import { s3UploadAdapter } from "@vivsh1999/upupload/adapters";

useFileUpload({
  uploadAdapter: s3UploadAdapter({
    getPresignedUrl: async (artifact) => {
      const res = await fetch(
        `/api/presigned-url?filename=${artifact.filename}&type=${artifact.filetype}`,
      );
      const data = await res.json();
      return data.url;
    },
    // Optional additional headers (e.g. S3 ACL headers)
    headers: {
      "x-amz-acl": "public-read",
    },
  }),
});
```
