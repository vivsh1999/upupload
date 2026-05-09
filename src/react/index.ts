/** @module react */
import { useCallback, useEffect, useRef, useState } from "react";
import type { DragEvent, HTMLAttributes, ComponentProps } from "react";
import type { BrowserPipelineOptions } from "../browser/pipeline";
import { DEFAULT_BROWSER_PIPELINE_OPTIONS, runDefaultBrowserPipeline } from "../browser/pipeline";
import type { PipelineSource } from "../core/types";
import type { ProcessingPlugin } from "../plugin/types";
import type { PipelineDef } from "../browser/pipeline";
import { Semaphore } from "./utils";

export type { BrowserPipelineOptions, PipelineDef } from "../browser/pipeline";
export { Plugin } from "../plugin/plugin";
export type { ProcessingPlugin, FileClassification } from "../plugin/types";
export { Semaphore } from "./utils";
export { PluginProvider } from "../plugin/plugin-provider";
export type { TypedPluginRef } from "../plugin/plugin-provider";


export interface MediaUploadTuningOptions {
  /** Maximum number of files processed concurrently. Auto-detected based on CPU count. */
  maxConcurrency?: number;
}

/** A single file in the upload queue with processing state. */
export interface MediaUploadQueueItem<TMeta = void> {
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

export interface UseMediaUploadOptions<TMeta = void> {
  plugins?: ProcessingPlugin<any>[];
  pipeline?: PipelineDef[];
  pipelineConfig?: Partial<BrowserPipelineOptions>;
  maxNumberOfFiles?: number;
  tuning?: MediaUploadTuningOptions;
  onInfo?: (message: string) => void;
  onWarning?: (message: string) => void;
  onError?: (error: Error, context?: { fileName?: string }) => void;
  onFileComplete?: (item: MediaUploadQueueItem<TMeta>) => void;
  /** Metadata factory called for each file added to the queue. */
  getMeta?: (file: File) => TMeta;
}

export interface UseMediaUploadResult<TMeta = void> {
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

function defaultConcurrency(): number {
  if (typeof navigator !== "undefined" && navigator.hardwareConcurrency) {
    return navigator.hardwareConcurrency >= 4 ? 4 : 2;
  }
  return 4;
}

export function useMediaUpload<TMeta = void>(
  options?: UseMediaUploadOptions<TMeta>,
): UseMediaUploadResult<TMeta> {
  const {
    plugins,
    pipeline,
    pipelineConfig,
    maxNumberOfFiles,
    tuning,
    onInfo,
    onWarning,
    onError,
    onFileComplete,
    getMeta,
  } = options ?? {};

  const [config, setConfig] = useState<BrowserPipelineOptions>({
    debug: pipelineConfig?.debug ?? DEFAULT_BROWSER_PIPELINE_OPTIONS.debug,
  });

  const [queue, setQueue] = useState<MediaUploadQueueItem<TMeta>[]>([]);
  const queueRef = useRef(queue);
  queueRef.current = queue;

  const [isBusy, setIsBusy] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const filesRef = useRef<Map<string, File>>(new Map());
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());

  const semRef = useRef(new Semaphore(tuning?.maxConcurrency ?? defaultConcurrency()));
  useEffect(() => {
    semRef.current = new Semaphore(tuning?.maxConcurrency ?? defaultConcurrency());
  }, [tuning?.maxConcurrency]);

  const processOptionsRef = useRef({
    config,
    plugins,
    pipeline,
    onInfo,
    onWarning,
    onFileComplete,
    onError,
  });
  processOptionsRef.current = {
    config,
    plugins,
    pipeline,
    onInfo,
    onWarning,
    onFileComplete,
    onError,
  };

  const updateConfig = useCallback((patch: Partial<BrowserPipelineOptions>) => {
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
    },
    [maxNumberOfFiles, getMeta],
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
      const {
        config: currentConfig,
        plugins: currentPlugins,
        pipeline: currentPipeline,
        onInfo: currentOnInfo,
        onWarning: currentOnWarning,
        onFileComplete: currentOnFileComplete,
        onError: currentOnError,
      } = processOptionsRef.current;

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

        const result = await runDefaultBrowserPipeline(source, currentConfig, {
          plugins: currentPlugins,
          pipeline: currentPipeline,
          signal: controller.signal,
        });

        if (controller.signal.aborted) return;

        for (const msg of result.info) {
          if (msg.level === "warn") {
            currentOnWarning?.(msg.message);
          } else {
            currentOnInfo?.(msg.message);
          }
        }

        if (result.removeFromQueue) {
          setQueue((prev) => prev.filter((q) => q.id !== item.id));
          abortControllersRef.current.delete(item.id);
          return;
        }

        const artifactPreviews = result.artifacts.map((a) => {
          const blob = a.file instanceof Blob ? a.file : new Blob([a.file]);
          const url = URL.createObjectURL(blob);
          return {
            variant: a.variant,
            filename: a.filename,
            blob,
            url,
          };
        });

        const completedItem: MediaUploadQueueItem<TMeta> = {
          ...item,
          status: "complete" as const,
          progress: 100,
          artifacts: artifactPreviews,
          previewUrl: artifactPreviews[0]?.url,
        };

        setQueue((prev) => prev.map((q) => (q.id === item.id ? completedItem : q)));

        currentOnFileComplete?.(completedItem);
      } catch (err) {
        if (controller.signal.aborted) return;
        const message = err instanceof Error ? err.message : "Unknown error";
        setQueue((prev) =>
          prev.map((q) =>
            q.id === item.id ? { ...q, status: "error" as const, error: message, progress: 0 } : q,
          ),
        );
        currentOnError?.(err instanceof Error ? err : new Error(message), {
          fileName: file.name,
        });
      } finally {
        abortControllersRef.current.delete(item.id);
      }
    },
    [],
  );

  const startUpload = useCallback(async (fileIds?: string[]) => {
    const items = fileIds
      ? queueRef.current.filter((q) => fileIds.includes(q.id))
      : queueRef.current;

    const pending = items.filter((q) => q.status === "idle");
    if (pending.length === 0) return;

    setIsBusy(true);

    try {
      await Promise.all(
        pending.map((item) => {
          const file = filesRef.current.get(item.id);
          if (!file) return Promise.resolve();
          return semRef.current.run(() => processFile(item, file));
        }),
      );
    } finally {
      setIsBusy(false);
    }
  }, []);

  const cancelUpload = useCallback((fileId: string) => {
    abortControllersRef.current.get(fileId)?.abort();
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
    for (const item of queueRef.current) {
      item.artifacts?.forEach((a) => a.url && URL.revokeObjectURL(a.url));
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    }
    setQueue([]);
  }, []);

  useEffect(() => {
    if (!onWarning) return;
    for (const item of queue) {
      if (item.status === "error" && item.error) {
        onWarning(item.error);
      }
    }
  }, [queue, onWarning]);

  // Auto-preload: eagerly warm up decoders for all registered plugins
  useEffect(() => {
    for (const p of plugins ?? []) {
      p.preload?.();
    }
  }, [plugins]);

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
