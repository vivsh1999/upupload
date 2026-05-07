# React Hook

## `useMediaUpload`

```tsx
import { useMediaUpload } from "@vivsh1999/upupload/react";
import { createJpegCompressorPlugin } from "@vivsh1999/upupload/plugins/jpeg-compressor";

function Uploader() {
  const { getDropTargetProps, getFileInputProps, queue, startUpload, isDragOver, cancelUpload } =
    useMediaUpload({
      plugins: [createJpegCompressorPlugin()],
      transport: "tus",
      tus: { endpoint: "/api/tus" },
      // Generic metadata — each file gets an id
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
  initialConfig?: Partial<DefaultBrowserPipelineOptions>;
  plugins?: ProcessingPlugin[];
  transport?: "tus" | "custom";
  tus?: TusUploadOptions;
  uploadHandler?: MediaUploadCustomUploadHandler;
  maxNumberOfFiles?: number;
  tuning?: MediaUploadTuningOptions; // { simultaneousUploads?: number }
  getMeta?: (file: File) => TMeta; // Per-file metadata
  onInfo?: (message: string) => void;
  onWarning?: (message: string) => void;
  onError?: (error: Error, context?: MediaUploadCustomUploadContext) => void;
  onFileComplete?: (fileName: string) => void;
}
```

### Return Value

```ts
interface UseMediaUploadResult<TMeta = void> {
  config: DefaultBrowserPipelineOptions;
  updateConfig: (patch: Partial<DefaultBrowserPipelineOptions>) => void;
  queue: MediaUploadQueueItem<TMeta>[];
  startUpload: (fileIds?: string[]) => Promise<void>; // Selective processing
  clear: () => void;
  retry: (fileId: string) => void;
  cancelUpload: (fileId: string) => void; // Cancel one file
  cancelAll: () => void; // Cancel everything
  isBusy: boolean;
  isDragOver: boolean; // Drag-and-drop visual state
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
  file: File; // Direct file reference
  status: "idle" | "processing" | "uploading" | "error";
  progress: number; // 0–100
  error?: string;
  previewUrl?: string; // Auto-released on clear/cancel
  meta?: TMeta; // From getMeta()
  artifacts?: {
    variant: string;
    filename: string;
    progress: number;
    url?: string; // Blob URL for preview
  }[];
}
```

## Semaphore Utility

Built-in concurrency limiter. Available as a standalone utility:

```ts
import { Semaphore } from "@vivsh1999/upupload/react";

const sem = new Semaphore(4); // max 4 concurrent
await Promise.all(tasks.map((t) => sem.run(() => process(t))));
```

The hook uses this internally with `tuning.simultaneousUploads` (default: 4).
