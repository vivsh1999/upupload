/** @module react */
import { useCallback, useRef, useState } from "react";
import type { DragEvent, HTMLAttributes, ComponentProps } from "react";
import type { DefaultBrowserPipelineOptions } from "../browser/pipeline";
import { DEFAULT_BROWSER_PIPELINE_OPTIONS, runDefaultBrowserPipeline } from "../browser/pipeline";
import { uploadArtifactWithTus } from "../browser/tusUpload";
import type { PipelineArtifact, PipelineSource } from "../core/types";

export type { DefaultBrowserPipelineOptions } from "../browser/pipeline";
export {
  preloadBrowserPipelineForFiles,
  preloadImageCompression,
  toJpegName,
  toThumbName,
} from "../browser/pipeline";
export { uploadArtifactWithTus } from "../browser/tusUpload";
export {
  isCameraRawImage,
  isHeicLike,
  isTiffLike,
  isSupportedMediaUpload,
  isVideoLike,
  isAudioLike,
} from "../browser";

/** Supported transport protocols for uploading artifacts. */
export type MediaUploadTransportMode = "tus" | "xhr" | "custom";

/** Options for TUS resumable upload transport. */
export interface TusUploadOptions {
  /** TUS server endpoint URL. */
  endpoint?: string;
  /** Upload chunk size in bytes. */
  chunkSize?: number;
  /** Delay (ms) between upload retries. */
  retryDelays?: number[];
}

/** Context passed to a custom upload handler. */
export interface MediaUploadCustomUploadContext {
  /** Original filename being uploaded. */
  fileName?: string;
}

/** User-defined function for handling artifact uploads when transport is "custom". */
export type MediaUploadCustomUploadHandler = (
  /** The artifact to upload. */
  artifact: PipelineArtifact,
  /** Context with file metadata. */
  context: MediaUploadCustomUploadContext,
) => Promise<void>;

/** Performance tuning options for the upload queue. */
export interface MediaUploadTuningOptions {
  /** Maximum number of simultaneous uploads. */
  simultaneousUploads?: number;
}

/** A single file in the upload queue with its current processing status. */
export interface MediaUploadQueueItem {
  /** Unique item identifier. */
  id: string;
  /** Original filename. */
  name: string;
  /** Current processing status. */
  status: "idle" | "processing" | "uploading" | "error";
  /** Upload progress 0–100. */
  progress: number;
  /** Error message when status is "error". */
  error?: string;
}

/** Configuration options for the `useMediaUpload` hook. */
export interface UseMediaUploadOptions {
  /** Override default pipeline options (quality, thumbnails, etc.). */
  initialConfig?: Partial<DefaultBrowserPipelineOptions>;
  /** Upload transport mode. Defaults to "custom" (requires `uploadHandler`). */
  transport?: MediaUploadTransportMode;
  /** TUS transport options (required when transport is "tus"). */
  tus?: TusUploadOptions;
  /** Custom upload handler (required when transport is "custom"). */
  uploadHandler?: MediaUploadCustomUploadHandler;
  /** Maximum number of files allowed in the queue. */
  maxNumberOfFiles?: number;
  /** Performance tuning options. */
  tuning?: MediaUploadTuningOptions;
  /** Called when an info message is emitted. */
  onInfo?: (message: string) => void;
  /** Called when a warning is emitted. */
  onWarning?: (message: string) => void;
  /** Called when an error occurs during processing or upload. */
  onError?: (error: Error, context?: MediaUploadCustomUploadContext) => void;
  /** Called when a single file artifact finishes uploading. */
  onFileComplete?: (fileName: string) => void;
}

/** Return type of the `useMediaUpload` hook. */
export interface UseMediaUploadResult {
  /** Current pipeline configuration. */
  config: DefaultBrowserPipelineOptions;
  /** Merge a partial config update. */
  updateConfig: (patch: Partial<DefaultBrowserPipelineOptions>) => void;
  /** Current upload queue items. */
  queue: MediaUploadQueueItem[];
  /** Begin processing and uploading all queued files. */
  startUpload: () => Promise<void>;
  /** Clear all items from the queue. */
  clear: () => void;
  /** Reset a failed item to idle for retry. */
  retry: (fileId: string) => void;
  /** Whether the queue is actively processing. */
  isBusy: boolean;
  /** Spread onto a `<div>` to enable drag-and-drop file selection. */
  getDropTargetProps: <T extends Omit<HTMLAttributes<HTMLDivElement>, "onDrop" | "onDragOver">>(
    props?: T,
  ) => T & {
    onDrop: (event: DragEvent<HTMLDivElement>) => void;
    onDragOver: (event: DragEvent<HTMLDivElement>) => void;
  };
  /** Spread onto a file `<input>` to add files via the native picker. */
  getFileInputProps: <T extends Omit<ComponentProps<"input">, "type" | "multiple">>(
    props?: T,
  ) => T & { type: "file"; multiple: true; hidden?: boolean };
  /** Spread onto a file `<input>` to add files via a folder picker. */
  getFolderInputProps: <T extends Omit<ComponentProps<"input">, "type" | "multiple">>(
    props?: T,
  ) => T & { type: "file"; multiple: true; webkitdirectory: string; hidden?: boolean };
}

let counter = 0;
function uid(): string {
  counter += 1;
  return `upupload-${counter}-${Date.now()}`;
}

/**
 * React hook that provides a complete media upload workflow:
 * file selection (drop / picker), pipeline processing, and upload.
 *
 * @param options - Configuration for pipeline, transport, and callbacks.
 * @returns Controls and state for managing the upload queue.
 */
export function useMediaUpload(options?: UseMediaUploadOptions): UseMediaUploadResult {
  const {
    initialConfig,
    transport,
    tus,
    uploadHandler,
    maxNumberOfFiles,
    tuning: _tuning,
    onInfo,
    onWarning: _onWarning,
    onError,
    onFileComplete,
  } = options ?? {};

  const [config, setConfig] = useState<DefaultBrowserPipelineOptions>({
    ...DEFAULT_BROWSER_PIPELINE_OPTIONS,
    ...initialConfig,
  });

  const [queue, setQueue] = useState<MediaUploadQueueItem[]>([]);
  const queueRef = useRef(queue);
  queueRef.current = queue;

  const [isBusy, setIsBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);

  const updateConfig = useCallback((patch: Partial<DefaultBrowserPipelineOptions>) => {
    setConfig((prev) => ({ ...prev, ...patch }));
  }, []);

  const addFiles = useCallback(
    (files: FileList | File[], _relativePaths?: string[]) => {
      const fileArray = Array.from(files);
      const sliced = maxNumberOfFiles != null ? fileArray.slice(0, maxNumberOfFiles) : fileArray;

      const newItems: MediaUploadQueueItem[] = sliced.map((file) => ({
        id: uid(),
        name: file.name,
        status: "idle" as const,
        progress: 0,
      }));

      setQueue((prev) => [...prev, ...newItems]);
      onInfo?.("Files added to queue");
    },
    [maxNumberOfFiles, onInfo],
  );

  const getFileInputProps = useCallback(
    <T extends Omit<ComponentProps<"input">, "type" | "multiple">>(props?: T) => {
      return {
        ...props,
        type: "file" as const,
        multiple: true as const,
        ref: (el: HTMLInputElement | null) => {
          fileInputRef.current = el;
        },
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
          if (e.target.files) {
            addFiles(e.target.files);
          }
          if (props?.onChange) {
            (props.onChange as (e: React.ChangeEvent<HTMLInputElement>) => void)(e);
          }
        },
      } as T & { type: "file"; multiple: true; hidden?: boolean };
    },
    [addFiles],
  );

  const getFolderInputProps = useCallback(
    <T extends Omit<ComponentProps<"input">, "type" | "multiple">>(props?: T) => {
      return {
        ...props,
        type: "file" as const,
        multiple: true as const,
        webkitdirectory: "" as string,
        ref: (el: HTMLInputElement | null) => {
          folderInputRef.current = el;
        },
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
          if (e.target.files) {
            addFiles(e.target.files);
          }
          if (props?.onChange) {
            (props.onChange as (e: React.ChangeEvent<HTMLInputElement>) => void)(e);
          }
        },
      } as T & { type: "file"; multiple: true; webkitdirectory: string; hidden?: boolean };
    },
    [addFiles],
  );

  const getDropTargetProps = useCallback(
    <T extends Omit<HTMLAttributes<HTMLDivElement>, "onDrop" | "onDragOver">>(props?: T) => {
      return {
        ...props,
        onDrop: (event: DragEvent<HTMLDivElement>) => {
          event.preventDefault();
          if (event.dataTransfer?.files) {
            addFiles(event.dataTransfer.files);
          }
        },
        onDragOver: (event: DragEvent<HTMLDivElement>) => {
          event.preventDefault();
        },
      } as T & {
        onDrop: (event: DragEvent<HTMLDivElement>) => void;
        onDragOver: (event: DragEvent<HTMLDivElement>) => void;
      };
    },
    [addFiles],
  );

  const processFile = useCallback(
    async (item: MediaUploadQueueItem, file: File, relativePath?: string): Promise<void> => {
      setQueue((prev) =>
        prev.map((q) => (q.id === item.id ? { ...q, status: "processing" as const } : q)),
      );

      try {
        const source: PipelineSource = {
          file,
          name: file.name,
          type: file.type || "application/octet-stream",
          relativePath,
        };

        const result = await runDefaultBrowserPipeline(source, config);

        if (result.removeFromQueue) {
          setQueue((prev) => prev.filter((q) => q.id !== item.id));
          return;
        }

        for (const artifact of result.artifacts) {
          setQueue((prev) =>
            prev.map((q) => (q.id === item.id ? { ...q, status: "uploading" as const } : q)),
          );

          if (transport === "tus" && tus?.endpoint) {
            await uploadArtifactWithTus({
              endpoint: tus.endpoint,
              chunkSize: tus.chunkSize ?? 5 * 1024 * 1024,
              blob: artifact.file instanceof Blob ? artifact.file : new Blob([artifact.file]),
              meta: {
                variant: artifact.variant,
                filename: artifact.filename,
                filetype: artifact.filetype,
                relativePath: artifact.relativePath,
              },
              onProgress: (percent) => {
                setQueue((prev) =>
                  prev.map((q) => (q.id === item.id ? { ...q, progress: percent } : q)),
                );
              },
            });
          } else if (uploadHandler) {
            await uploadHandler(artifact, { fileName: file.name });
          }

          onFileComplete?.(artifact.filename);
        }

        setQueue((prev) => prev.filter((q) => q.id !== item.id));
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        setQueue((prev) =>
          prev.map((q) =>
            q.id === item.id ? { ...q, status: "error" as const, error: message, progress: 0 } : q,
          ),
        );
        onError?.(err instanceof Error ? err : new Error(message), { fileName: file.name });
      }
    },
    [config, transport, tus, uploadHandler, onFileComplete, onError],
  );

  const startUpload = useCallback(async () => {
    const items = queueRef.current;
    if (items.length === 0) return;

    setIsBusy(true);

    try {
      await Promise.all(
        items.map(async (item) => {
          const input = document.querySelector<HTMLInputElement>(`[data-id="${item.id}"]`);
          const file = (input as HTMLInputElement & { file?: File })?.file;
          if (file) {
            await processFile(item, file);
          }
        }),
      );
    } finally {
      setIsBusy(false);
    }
  }, [processFile]);

  const retry = useCallback((fileId: string) => {
    setQueue((prev) =>
      prev.map((q) =>
        q.id === fileId ? { ...q, status: "idle" as const, error: undefined, progress: 0 } : q,
      ),
    );
  }, []);

  const clear = useCallback(() => {
    setQueue([]);
  }, []);

  return {
    config,
    updateConfig,
    queue,
    startUpload,
    clear,
    retry,
    isBusy,
    getDropTargetProps,
    getFileInputProps,
    getFolderInputProps,
  };
}
