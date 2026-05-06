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

export type MediaUploadTransportMode = "tus" | "xhr" | "custom";

export interface TusUploadOptions {
  endpoint?: string;
  chunkSize?: number;
  retryDelays?: number[];
}

export interface MediaUploadCustomUploadContext {
  fileName?: string;
}

export type MediaUploadCustomUploadHandler = (
  artifact: PipelineArtifact,
  context: MediaUploadCustomUploadContext,
) => Promise<void>;

export interface MediaUploadTuningOptions {
  simultaneousUploads?: number;
}

export interface MediaUploadQueueItem {
  id: string;
  name: string;
  status: "idle" | "processing" | "uploading" | "error";
  progress: number;
  error?: string;
}

export interface UseMediaUploadOptions {
  initialConfig?: Partial<DefaultBrowserPipelineOptions>;
  transport?: MediaUploadTransportMode;
  tus?: TusUploadOptions;
  uploadHandler?: MediaUploadCustomUploadHandler;
  maxNumberOfFiles?: number;
  tuning?: MediaUploadTuningOptions;
  onInfo?: (message: string) => void;
  onWarning?: (message: string) => void;
  onError?: (error: Error, context?: MediaUploadCustomUploadContext) => void;
  onFileComplete?: (fileName: string) => void;
}

export interface UseMediaUploadResult {
  config: DefaultBrowserPipelineOptions;
  updateConfig: (patch: Partial<DefaultBrowserPipelineOptions>) => void;
  queue: MediaUploadQueueItem[];
  startUpload: () => Promise<void>;
  clear: () => void;
  retry: (fileId: string) => void;
  isBusy: boolean;
  getDropTargetProps: <T extends Omit<HTMLAttributes<HTMLDivElement>, "onDrop" | "onDragOver">>(
    props?: T,
  ) => T & {
    onDrop: (event: DragEvent<HTMLDivElement>) => void;
    onDragOver: (event: DragEvent<HTMLDivElement>) => void;
  };
  getFileInputProps: <T extends Omit<ComponentProps<"input">, "type" | "multiple">>(
    props?: T,
  ) => T & { type: "file"; multiple: true; hidden?: boolean };
  getFolderInputProps: <T extends Omit<ComponentProps<"input">, "type" | "multiple">>(
    props?: T,
  ) => T & { type: "file"; multiple: true; webkitdirectory: string; hidden?: boolean };
}

let counter = 0;
function uid(): string {
  counter += 1;
  return `upupload-${counter}-${Date.now()}`;
}

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
