/** @module react */
import { useCallback, useEffect, useRef, useState } from "react";
import type { DragEvent, HTMLAttributes, ComponentProps } from "react";
import type { DefaultBrowserPipelineOptions } from "../browser/pipeline";
import { DEFAULT_BROWSER_PIPELINE_OPTIONS, runDefaultBrowserPipeline } from "../browser/pipeline";
import { uploadArtifactWithTus } from "../browser/tusUpload";
import type { PipelineArtifact, PipelineSource } from "../core/types";
import type { ProcessingPlugin } from "../plugin/types";
import { Semaphore } from "./utils";

export type { DefaultBrowserPipelineOptions } from "../browser/pipeline";
export type { ProcessingPlugin, FileClassification } from "../plugin/types";
export { preloadBrowserPipelineForFiles, toJpegName, toThumbName } from "../browser/pipeline";
export { uploadArtifactWithTus } from "../browser/tusUpload";
export {
  isCameraRawImage,
  isHeicLike,
  isTiffLike,
  isSupportedMediaUpload,
  isVideoLike,
  isAudioLike,
} from "../browser";

export type MediaUploadTransportMode = "tus" | "custom";

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

/** A single file in the upload queue with processing state. */
export interface MediaUploadQueueItem<TMeta = void> {
  id: string;
  name: string;
  file: File;
  status: "idle" | "processing" | "uploading" | "error";
  progress: number;
  error?: string;
  previewUrl?: string;
  meta?: TMeta;
  artifacts?: {
    variant: string;
    filename: string;
    progress: number;
    url?: string;
  }[];
}

export interface UseMediaUploadOptions<TMeta = void> {
  initialConfig?: Partial<DefaultBrowserPipelineOptions>;
  plugins?: ProcessingPlugin[];
  transport?: MediaUploadTransportMode;
  tus?: TusUploadOptions;
  uploadHandler?: MediaUploadCustomUploadHandler;
  maxNumberOfFiles?: number;
  tuning?: MediaUploadTuningOptions;
  onInfo?: (message: string) => void;
  onWarning?: (message: string) => void;
  onError?: (error: Error, context?: MediaUploadCustomUploadContext) => void;
  onFileComplete?: (fileName: string) => void;
  /** Initial metadata for each file added to the queue. */
  getMeta?: (file: File) => TMeta;
}

export interface UseMediaUploadResult<TMeta = void> {
  config: DefaultBrowserPipelineOptions;
  updateConfig: (patch: Partial<DefaultBrowserPipelineOptions>) => void;
  queue: MediaUploadQueueItem<TMeta>[];
  startUpload: (fileIds?: string[]) => Promise<void>;
  clear: () => void;
  retry: (fileId: string) => void;
  cancelUpload: (fileId: string) => void;
  cancelAll: () => void;
  isBusy: boolean;
  isDragOver: boolean;
  getDropTargetProps: <T extends Omit<HTMLAttributes<HTMLDivElement>, "onDrop" | "onDragOver">>(
    props?: T,
  ) => T & {
    onDrop: (event: DragEvent<HTMLDivElement>) => void;
    onDragOver: (event: DragEvent<HTMLDivElement>) => void;
    onDragEnter: (event: DragEvent<HTMLDivElement>) => void;
    onDragLeave: (event: DragEvent<HTMLDivElement>) => void;
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

export function useMediaUpload<TMeta = void>(
  options?: UseMediaUploadOptions<TMeta>,
): UseMediaUploadResult<TMeta> {
  const {
    initialConfig,
    plugins,
    transport,
    tus,
    uploadHandler,
    maxNumberOfFiles,
    tuning,
    onInfo,
    onWarning,
    onError,
    onFileComplete,
    getMeta,
  } = options ?? {};

  const [config, setConfig] = useState<DefaultBrowserPipelineOptions>({
    ...DEFAULT_BROWSER_PIPELINE_OPTIONS,
    ...initialConfig,
  });

  const [queue, setQueue] = useState<MediaUploadQueueItem<TMeta>[]>([]);
  const queueRef = useRef(queue);
  queueRef.current = queue;

  const [isBusy, setIsBusy] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const filesRef = useRef<Map<string, File>>(new Map());
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());

  const updateConfig = useCallback((patch: Partial<DefaultBrowserPipelineOptions>) => {
    setConfig((prev) => ({ ...prev, ...patch }));
  }, []);

  const addFiles = useCallback(
    (fileList: FileList | File[]) => {
      const fileArray = Array.from(fileList);
      const sliced = maxNumberOfFiles != null ? fileArray.slice(0, maxNumberOfFiles) : fileArray;

      const newItems: MediaUploadQueueItem<TMeta>[] = [];
      for (const file of sliced) {
        const id = uid();
        filesRef.current.set(id, file);
        newItems.push({
          id,
          name: file.name,
          file,
          status: "idle",
          progress: 0,
          meta: getMeta?.(file),
        });
      }

      setQueue((prev) => [...prev, ...newItems]);
      onInfo?.("Files added to queue");
    },
    [maxNumberOfFiles, onInfo, getMeta],
  );

  const getFileInputProps = useCallback(
    <T extends Omit<ComponentProps<"input">, "type" | "multiple">>(props?: T) => {
      return {
        ...props,
        type: "file" as const,
        multiple: true as const,
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

  const dragEnterCounterRef = useRef(0);

  const getDropTargetProps = useCallback(
    <T extends Omit<HTMLAttributes<HTMLDivElement>, "onDrop" | "onDragOver">>(props?: T) => {
      return {
        ...props,
        onDrop: (event: DragEvent<HTMLDivElement>) => {
          event.preventDefault();
          setIsDragOver(false);
          dragEnterCounterRef.current = 0;
          if (event.dataTransfer?.files) {
            addFiles(event.dataTransfer.files);
          }
        },
        onDragOver: (event: DragEvent<HTMLDivElement>) => {
          event.preventDefault();
        },
        onDragEnter: (event: DragEvent<HTMLDivElement>) => {
          event.preventDefault();
          dragEnterCounterRef.current++;
          setIsDragOver(true);
        },
        onDragLeave: (event: DragEvent<HTMLDivElement>) => {
          event.preventDefault();
          dragEnterCounterRef.current--;
          if (dragEnterCounterRef.current <= 0) {
            dragEnterCounterRef.current = 0;
            setIsDragOver(false);
          }
        },
      } as T & {
        onDrop: (event: DragEvent<HTMLDivElement>) => void;
        onDragOver: (event: DragEvent<HTMLDivElement>) => void;
        onDragEnter: (event: DragEvent<HTMLDivElement>) => void;
        onDragLeave: (event: DragEvent<HTMLDivElement>) => void;
      };
    },
    [addFiles],
  );

  const processFile = useCallback(
    async (item: MediaUploadQueueItem<TMeta>, file: File): Promise<void> => {
      const controller = new AbortController();
      abortControllersRef.current.set(item.id, controller);

      try {
        if (controller.signal.aborted) return;

        setQueue((prev) =>
          prev.map((q) => (q.id === item.id ? { ...q, status: "processing" as const } : q)),
        );

        const source: PipelineSource = {
          file,
          name: file.name,
          type: file.type || "application/octet-stream",
        };

        const result = await runDefaultBrowserPipeline(source, config, {
          plugins,
          signal: controller.signal,
        });

        if (controller.signal.aborted) return;

        if (result.removeFromQueue) {
          setQueue((prev) => prev.filter((q) => q.id !== item.id));
          abortControllersRef.current.delete(item.id);
          return;
        }

        const artifactPreviews = result.artifacts.map((a) => {
          const url = a.file instanceof Blob ? URL.createObjectURL(a.file) : undefined;
          return {
            variant: a.variant,
            filename: a.filename,
            progress: 0,
            url,
          };
        });

        setQueue((prev) =>
          prev.map((q) =>
            q.id === item.id
              ? {
                  ...q,
                  status: "uploading" as const,
                  artifacts: artifactPreviews,
                  previewUrl: artifactPreviews.find((p) =>
                    ["optimized", "thumbnail"].includes(p.variant),
                  )?.url,
                }
              : q,
          ),
        );

        let completedArtifacts = 0;
        const totalArtifacts = result.artifacts.length;

        for (let i = 0; i < result.artifacts.length; i++) {
          const artifact = result.artifacts[i]!;

          if (controller.signal.aborted) return;

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
              signal: controller.signal,
              onProgress: (percent) => {
                const overall =
                  totalArtifacts > 0
                    ? ((completedArtifacts + percent / 100) / totalArtifacts) * 100
                    : percent;
                setQueue((prev) =>
                  prev.map((q) =>
                    q.id === item.id
                      ? {
                          ...q,
                          progress: Math.min(99, overall),
                          artifacts: q.artifacts?.map((pa, idx) =>
                            idx === i ? { ...pa, progress: percent } : pa,
                          ),
                        }
                      : q,
                  ),
                );
              },
            });
          } else if (uploadHandler) {
            await uploadHandler(artifact, { fileName: file.name });
          }

          completedArtifacts++;
          onFileComplete?.(artifact.filename);
        }

        setQueue((prev) => prev.filter((q) => q.id !== item.id));
      } catch (err) {
        if (controller.signal.aborted) return;
        const message = err instanceof Error ? err.message : "Unknown error";
        setQueue((prev) =>
          prev.map((q) =>
            q.id === item.id ? { ...q, status: "error" as const, error: message, progress: 0 } : q,
          ),
        );
        onError?.(err instanceof Error ? err : new Error(message), {
          fileName: file.name,
        });
      } finally {
        abortControllersRef.current.delete(item.id);
      }
    },
    [config, transport, tus, uploadHandler, plugins, onFileComplete, onError],
  );

  const startUpload = useCallback(
    async (fileIds?: string[]) => {
      const items = fileIds
        ? queueRef.current.filter((q) => fileIds.includes(q.id))
        : queueRef.current;

      const pending = items.filter((q) => q.status === "idle");
      if (pending.length === 0) return;

      setIsBusy(true);

      try {
        const concurrency = tuning?.simultaneousUploads ?? 4;
        const sem = new Semaphore(concurrency);

        await Promise.all(
          pending.map((item) => {
            const file = filesRef.current.get(item.id);
            if (!file) return Promise.resolve();
            return sem.run(() => processFile(item, file));
          }),
        );
      } finally {
        setIsBusy(false);
      }
    },
    [tuning?.simultaneousUploads, processFile],
  );

  const cancelUpload = useCallback((fileId: string) => {
    abortControllersRef.current.get(fileId)?.abort();
    // Release preview URLs
    setQueue((prev) => {
      const item = prev.find((q) => q.id === fileId);
      if (item) {
        item.artifacts?.forEach((a) => a.url && URL.revokeObjectURL(a.url));
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      }
      return prev.filter((q) => q.id !== fileId);
    });
    abortControllersRef.current.delete(fileId);
  }, []);

  const cancelAll = useCallback(() => {
    for (const fileId of abortControllersRef.current.keys()) {
      cancelUpload(fileId);
    }
  }, [cancelUpload]);

  const retry = useCallback((fileId: string) => {
    setQueue((prev) =>
      prev.map((q) =>
        q.id === fileId ? { ...q, status: "idle" as const, error: undefined, progress: 0 } : q,
      ),
    );
  }, []);

  const clear = useCallback(() => {
    // Release all preview URLs
    for (const item of queueRef.current) {
      item.artifacts?.forEach((a) => a.url && URL.revokeObjectURL(a.url));
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    }
    setQueue([]);
  }, []);

  // Warn about info-level messages from pipeline
  useEffect(() => {
    if (!onWarning) return;
    for (const item of queue) {
      if (item.status === "error" && item.error) {
        onWarning(item.error);
      }
    }
  }, [queue, onWarning]);

  return {
    config,
    updateConfig,
    queue,
    startUpload,
    clear,
    retry,
    cancelUpload,
    cancelAll,
    isBusy,
    isDragOver,
    getDropTargetProps,
    getFileInputProps,
    getFolderInputProps,
  };
}
