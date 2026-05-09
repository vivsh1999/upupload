# React Hook

## `useMediaUpload`

```tsx
import { useMediaUpload } from "@vivsh1999/upupload/react";
import { jpegCompressor } from "@vivsh1999/upupload/plugins";

function Uploader() {
  const { getDropTargetProps, getFileInputProps, queue, startUpload, isDragOver, cancelUpload } =
    useMediaUpload({
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
          {item.status === "error" && <button onClick={() => cancelUpload(item.id)}>Cancel</button>}
        </div>
      ))}
      <button onClick={() => startUpload()}>Upload</button>
    </div>
  );
}
```

### Options

```ts
interface UseMediaUploadOptions<TMeta = void> {
  plugins?: ProcessingPlugin<any>[];
  pipeline?: PipelineDef[];
  pipelineConfig?: Partial<BrowserPipelineOptions>;
  maxNumberOfFiles?: number;
  tuning?: MediaUploadTuningOptions;
  onInfo?: (message: string) => void;
  onWarning?: (message: string) => void;
  onError?: (error: Error, context?: { fileName?: string }) => void;
  onFileComplete?: (item: MediaUploadQueueItem<TMeta>) => void;
  getMeta?: (file: File) => TMeta;
}
```

### Return Value

```ts
interface UseMediaUploadResult<TMeta = void> {
  config: BrowserPipelineOptions;
  updateConfig: (patch: Partial<BrowserPipelineOptions>) => void;
  queue: MediaUploadQueueItem<TMeta>[];
  startUpload: (fileIds?: string[]) => Promise<void>;
  clear: () => void;
  retry: (fileId: string) => void;
  cancelUpload: (fileId: string) => void;
  cancelAll: () => void;
  isBusy: boolean;
  isDragOver: boolean;
  getDropTargetProps: <T>(props?: T) => T & { onDrop; onDragOver; onDragEnter; onDragLeave };
  getFileInputProps: <T>(props?: T) => T & { type: "file"; multiple: true };
  getFolderInputProps: <T>(props?: T) => T & { type: "file"; multiple: true; webkitdirectory };
}
```

### Queue Item

```ts
interface MediaUploadQueueItem<TMeta = void> {
  id: string;
  name: string;
  file: File;
  status: "idle" | "processing" | "complete" | "error";
  progress: number;
  error?: string;
  previewUrl?: string;
  meta?: TMeta;
  artifacts?: {
    variant: string;
    filename: string;
    blob: Blob;
    url?: string;
  }[];
}
```

## Semaphore Utility

Built-in concurrency limiter. Available as a standalone utility:

```ts
import { Semaphore } from "@vivsh1999/upupload/react";

const sem = new Semaphore(4);
await Promise.all(tasks.map((t) => sem.run(() => process(t))));
```

The hook uses this internally with `tuning.maxConcurrency` (default: auto-detected from CPU count).
