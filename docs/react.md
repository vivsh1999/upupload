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
interface UseFileUploadOptions<TMeta = void> {
  plugins?: ProcessingPlugin<any>[];
  pipeline?: PipelineDef[];
  pipelineConfig?: Partial<BrowserPipelineOptions>;
  maxNumberOfFiles?: number;
  maxFileSize?: number; // Bytes per file
  maxTotalBatchSize?: number; // Bytes total across queue
  maxQueuedUploads?: number; // Upload backlog limit
  autoPreventTabClose?: boolean;
  autoPauseOnOffline?: boolean;
  autoWakeLock?: boolean;
  persistence?: "memory" | "indexeddb";
  tuning?: {
    maxConcurrency?: number; // Pipeline concurrency (auto-detected)
    maxUploadConcurrency?: number; // Upload adapter concurrency
  };
  uploadAdapter?: UploadAdapter; // Generic upload function
  getMeta?: (file: File) => TMeta;
  getPipelineContextMeta?: () => Record<string, unknown>;
  onInfo?: (message: string) => void;
  onWarning?: (message: string) => void;
  onError?: (error: Error, context?: { fileName?: string }) => void;
  onFileProcessed?: (item: FileUploadQueueItem<TMeta>) => void;
  onFileComplete?: (item: FileUploadQueueItem<TMeta>) => void;
  onBatchComplete?: (stats: BatchCompleteStats) => void;
}
```

#### New in 0.2.0

| Option                   | Description                                                             |
| ------------------------ | ----------------------------------------------------------------------- |
| `maxFileSize`            | Rejects files exceeding this size (bytes).                              |
| `maxTotalBatchSize`      | Rejects files that would push total queue size over limit.              |
| `maxQueuedUploads`       | Backpressure: defers new processing when this many files are uploading. |
| `autoPreventTabClose`    | Registers `beforeunload` while busy.                                    |
| `autoPauseOnOffline`     | Auto-pauses processing on network disconnect, resumes on reconnect.     |
| `autoWakeLock`           | Acquires screen wake lock while busy.                                   |
| `persistence`            | `"indexeddb"` persists queue metadata across page reloads.              |
| `uploadAdapter`          | Generic function to upload each artifact after pipeline processing.     |
| `getPipelineContextMeta` | Factory returning metadata injected into every file's pipeline context. |
| `onFileProcessed`        | Fires after pipeline completes (before upload adapter).                 |
| `onFileComplete`         | Fires after pipeline AND upload adapter resolve.                        |
| `onBatchComplete`        | Fires with cumulative stats when system transitions busy→idle.          |

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
interface FileUploadQueueItem<TMeta = void> {
  id: string;
  name: string;
  file: File;
  status: "idle" | "processing" | "uploading" | "complete" | "error";
  progress: number;
  error?: string;
  previewUrl?: string;
  meta?: TMeta;
  needsReselect?: boolean; // true if file blob unavailable (reloaded from IndexedDB)
  artifacts?: {
    variant: string;
    filename: string;
    blob: Blob;
    url?: string;
  }[];
}
```

### UploadAdapter

```ts
type UploadAdapter = (
  artifact: { variant: string; blob: Blob; filename: string; filetype: string },
  helpers: { onProgress: (progress: number) => void; signal?: AbortSignal },
) => Promise<void>;
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
  uploadAdapter: async (artifact, { onProgress, signal }) => {
    await fetch("/api/upload", {
      method: "PUT",
      body: artifact.blob,
      headers: { "Content-Type": artifact.filetype },
      signal, // AbortSignal propagates from cancelUpload/cancelAll
    });
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
