/** @module react */
import { useCallback, useEffect, useRef, useState } from "react";
import type { DragEvent, HTMLAttributes, ComponentProps } from "react";
import type { BrowserPipelineOptions } from "../browser/pipeline";
import { DEFAULT_BROWSER_PIPELINE_OPTIONS, runDefaultBrowserPipeline } from "../browser/pipeline";
import type { PipelineSource } from "../core/types";
import type { ProcessingPlugin } from "../plugin/types";
import type { PipelineDef } from "../browser/pipeline";
import { Semaphore } from "./utils";
import { saveQueue, loadQueue, serializeForStorage, buildDbName } from "./persistence";

export type { BrowserPipelineOptions, PipelineDef } from "../browser/pipeline";
export { Plugin } from "../plugin/plugin";
export type { ProcessingPlugin, FileClassification } from "../plugin/types";
export { Semaphore } from "./utils";
export { PluginProvider } from "../plugin/plugin-provider";
export type { TypedPluginRef } from "../plugin/plugin-provider";

export interface FileUploadTuningOptions {
  /** Maximum number of files processed concurrently. Auto-detected based on CPU count. */
  maxConcurrency?: number;
  /** Maximum number of files uploading concurrently. Defaults to `maxConcurrency`. */
  maxUploadConcurrency?: number;
}

/**
 * Represents the current status of a file in the upload queue.
 *
 * - `"idle"`: Queued and waiting for `startUpload()` to begin processing.
 * - `"processing"`: Running through the compression/transcoding pipeline.
 * - `"uploading"`: Pipeline completed; the upload adapter is sending artifacts.
 * - `"complete"`: All processing and uploads finished successfully.
 * - `"error"`: Processing or upload failed; check `item.error` for details.
 */
export type FileStatus = "idle" | "processing" | "uploading" | "complete" | "error";

/**
 * Named constants for the possible file statuses.
 * Useful for comparisons without guessing string literals.
 *
 * @example
 * ```ts
 * if (item.status === FileStatus.Complete) { … }
 * ```
 */
export const FileStatus = {
  Idle: "idle" as const,
  Processing: "processing" as const,
  Uploading: "uploading" as const,
  Complete: "complete" as const,
  Error: "error" as const,
} satisfies Record<string, FileStatus>;

/** A single file in the upload queue with processing state.
 *
 * When `needsReselect` is `true`, the raw `File` object is unavailable
 * (e.g. restored from IndexedDB after page reload). Check the discriminant
 * before accessing `.file`.
 */
export type FileUploadQueueItem<TMeta = void> =
  | {
      /** Unique identifier for this file in the queue (stable across retries). */
      id: string;
      /** Original filename from the `File` object (e.g. `"vacation.jpg"`). */
      name: string;
      /** The raw `File` object. Present when `needsReselect` is `false`. */
      file: File;
      /** Current processing status. Use the `FileStatus` constants for comparisons. */
      status: FileStatus;
      /** Upload progress as a number from 0 to 100. */
      progress: number;
      /** Human-readable error message when `status === "error"`. */
      error?: string;
      /** Object URL for the first processed artifact (for display). Revoked on `clear()`. */
      previewUrl?: string;
      /** Arbitrary metadata attached by the `getMeta` option. */
      meta?: TMeta;
      /** Processed artifacts (compressed JPEGs, video posters, etc.).
       *  Each artifact is a variant of the original file produced by the pipeline. */
      artifacts?: {
        variant: string;
        filename: string;
        blob: Blob;
        url?: string;
      }[];
      needsReselect: false;
    }
  | {
      /** Unique identifier for this file in the queue (stable across retries). */
      id: string;
      /** Original filename from the `File` object (e.g. `"vacation.jpg"`). */
      name: string;
      /** Not available when blob is lost (e.g. restored from IndexedDB). */
      file?: never;
      /** Current processing status. Use the `FileStatus` constants for comparisons. */
      status: FileStatus;
      /** Upload progress as a number from 0 to 100. */
      progress: number;
      /** Human-readable error message when `status === "error"`. */
      error?: string;
      /** Object URL for the first processed artifact (for display). Revoked on `clear()`. */
      previewUrl?: string;
      /** Arbitrary metadata attached by the `getMeta` option. */
      meta?: TMeta;
      /** Processed artifacts (compressed JPEGs, video posters, etc.).
       *  Each artifact is a variant of the original file produced by the pipeline. */
      artifacts?: {
        variant: string;
        filename: string;
        blob: Blob;
        url?: string;
      }[];
      needsReselect: true;
    };

/**
 * Upload adapter — a user-supplied function that handles uploading a single artifact.
 * Called by the hook when an `uploadAdapter` is configured. The adapter receives the
 * artifact blob and can report upload progress back to the queue item.
 *
 * @param artifact - The artifact to upload (variant, blob, filename, filetype)
 * @param helpers.onProgress - Call with a 0-100 value to update the queue item's progress
 * @param helpers.signal - AbortSignal that fires when the upload is cancelled
 * @param helpers.batch - Context about the current batch of files being processed.
 *   Includes the full list of files and any value returned by `onBeforeStart`.
 *   Useful for batch coordination (e.g. pre-initializing a session for all files).
 */
export type UploadAdapter<TPreload = undefined> = (
  artifact: {
    variant: string;
    blob: Blob;
    filename: string;
    filetype: string;
  },
  helpers: {
    onProgress: (progress: number) => void;
    signal?: AbortSignal;
    /** ID of the file this artifact belongs to. */
    fileId: string;
    /** Total number of artifacts for this file. */
    totalArtifacts: number;
    /** Index of this artifact within the file's artifact list (0-based). */
    artifactIndex: number;
    /** Context about the current batch of files being processed. */
    batch?: {
      /** All files in this batch, enabling the adapter to see the full picture. */
      files: FileUploadQueueItem[];
      /** Unique identifier for this batch. Stable across all adapter calls in the batch. */
      batchId: string;
      /** Value returned by the `onBeforeStart` hook, if configured. */
      preload?: TPreload;
    };
  },
) => Promise<void>;

/** Aggregate statistics about a completed batch of file processing. */
export interface BatchCompleteStats {
  /** Total number of files processed across all batches. */
  totalFiles: number;
  /** Number of files that completed successfully. */
  succeeded: number;
  /** Number of files that failed. */
  failed: number;
  /** Total bytes across all processed files. */
  totalBytes: number;
  /** Elapsed time in ms since the first batch started. */
  totalTimeMs: number;
}

/** Live progress stats for an active batch. */
export interface BatchProgressStats {
  /** Total number of files in the batch. */
  totalFiles: number;
  /** Number of files that completed successfully. */
  succeeded: number;
  /** Number of files that failed. */
  failed: number;
  /** Total bytes across all files in the batch (sum of original file sizes). */
  totalBytes: number;
  /** Estimated uploaded bytes based on per-file progress. */
  uploadedBytes: number;
}

export interface UseFileUploadOptions<TMeta = void, TPreload = undefined> {
  plugins?: ProcessingPlugin<any>[];
  pipeline?: PipelineDef[];
  pipelineConfig?: Partial<BrowserPipelineOptions>;
  maxNumberOfFiles?: number;
  /** Maximum file size in bytes. Files exceeding this are rejected. */
  maxFileSize?: number;
  /** Maximum total size in bytes across all queued files. Prevents batch OOM. */
  maxTotalBatchSize?: number;
  /** When true, prevents tab close while files are being processed. */
  autoPreventTabClose?: boolean;
  /** When true, auto-pauses processing on network offline, resumes on online. */
  autoPauseOnOffline?: boolean;
  /** When true, acquires a screen wake lock while files are being processed. */
  autoWakeLock?: boolean;
  /**
   * Maximum number of files that can be in the "uploading" state at once.
   * When exceeded, new file processing is deferred until upload slots free up.
   */
  maxQueuedUploads?: number;
  /**
   * Persistence mode for the upload queue.
   * - `"memory"` (default): queue state is lost on page reload.
   * - `"indexeddb"`: queue metadata is persisted to IndexedDB and restored
   *   on reload. File blobs are not preserved — files with status other than
   *   `"complete"` are reset to `"error"` on restore. The user must re-drop
   *   files to re-process them.
   */
  persistence?: "memory" | "indexeddb";
  /**
   * Optional prefix for the IndexedDB database name when
   * `persistence: "indexeddb"` is used.
   *
   * The database name becomes `"<prefix>-upupload"`. The default (no prefix)
   * is `"upupload"`.
   *
   * Useful for:
   * - Multi-tenant or multi-account apps that need isolated storage
   * - Clearing stale upload state without affecting other databases
   */
  storageKeyPrefix?: string;
  tuning?: FileUploadTuningOptions;
  onInfo?: (message: string) => void;
  onWarning?: (message: string) => void;
  onError?: (error: Error, context?: { fileName?: string }) => void;
  /**
   * Fires after pipeline processing completes for a file, before upload adapter runs.
   * Use `onFileComplete` to get notified after the adapter resolves.
   */
  onFileProcessed?: (item: FileUploadQueueItem<TMeta>) => void;
  /**
   * Fires when a file is fully done — after pipeline processing (and upload adapter
   * if configured). At this point `item.status === "complete"`.
   */
  onFileComplete?: (item: FileUploadQueueItem<TMeta>) => void;
  /** Fires when the system transitions from busy to idle with cumulative batch stats. */
  onBatchComplete?: (stats: BatchCompleteStats) => void;
  /** Fires during batch processing with live stats. Useful for rendering a global progress bar. */
  onBatchProgress?: (stats: BatchProgressStats) => void;
  /** Metadata factory called for each file added to the queue. */
  getMeta?: (file: File) => TMeta;
  /**
   * Upload adapter for uploading each artifact after processing completes.
   * When provided, the hook calls this for every artifact and only marks the
   * file as `"complete"` after all uploads finish. Progress during upload
   * maps to the 90-100% range on the queue item.
   */
  uploadAdapter?: UploadAdapter<TPreload>;
  /**
   * Factory that returns metadata to inject into every file's pipeline context.
   * Useful for propagating global state (auth tokens, project IDs, etc.) to
   * pipeline plugins without closure threading.
   */
  getPipelineContextMeta?: () => Record<string, unknown>;
  /**
   * Hook called once before files enter the processing/upload pipeline,
   * with the full list of pending files.
   *
   * Useful for batch pre-processing, e.g. calling `POST /bulk-init` with
   * all files and returning a session token for the upload adapter.
   *
   * The return value is passed to every adapter call in this batch via
   * `helpers.batch.preload`, typed as `TPreload`.
   *
   * @param files - All files in this batch that are about to be processed.
   * @returns An arbitrary value that will be available to each adapter call.
   */
  onBeforeStart?: (files: FileUploadQueueItem<TMeta>[]) => Promise<TPreload>;
  /**
   * Controls what `retry(fileId)` does.
   * - `"pipeline"` (default): resets the file to idle, re-running the full
   *   compression/transcoding pipeline on the next `startUpload()`.
   * - `"adapter-only"`: re-runs only the upload adapter using cached artifacts,
   *   skipping re-compression. Falls back to `"pipeline"` if no artifacts exist.
   */
  retryMode?: "pipeline" | "adapter-only";
}

export interface UseFileUploadResult<TMeta = void> {
  config: BrowserPipelineOptions;
  updateConfig: (patch: Partial<BrowserPipelineOptions>) => void;
  queue: FileUploadQueueItem<TMeta>[];
  startUpload: (fileIds?: string[]) => Promise<void>;
  clear: () => void;
  retry: (fileId: string) => void;
  /**
   * Re-run the upload adapter for a file whose pipeline artifacts were preserved.
   *
   * **Does NOT re-run the pipeline** (compression, transcoding, etc.).
   * Only the `uploadAdapter` is called again with the existing artifacts.
   * This means the adapter must be idempotent — it may receive the same
   * artifact blob across multiple `retryUpload` calls.
   *
   * Returns early (no-op) if:
   * - No `uploadAdapter` is configured on the hook
   * - The file has no artifacts (pipeline never completed or failed)
   *
   * Acquires the same `maxUploadConcurrency` slot as the initial upload path,
   * so retrying respects your configured concurrency limit.
   */
  retryUpload: (fileId: string) => void;
  cancelUpload: (fileId: string) => void;
  cancelAll: () => void;
  pause: () => void;
  resume: () => void;
  isBusy: boolean;
  isPaused: boolean;
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

export function useFileUpload<TMeta = void, TPreload = undefined>(
  options?: UseFileUploadOptions<TMeta, TPreload>,
): UseFileUploadResult<TMeta> {
  const {
    plugins,
    pipeline,
    pipelineConfig,
    maxNumberOfFiles,
    maxFileSize,
    maxTotalBatchSize,
    autoPreventTabClose,
    tuning,
    onInfo,
    onWarning,
    onError,
    onFileProcessed,
    onFileComplete,
    onBatchComplete,
    onBatchProgress,
    getMeta,
    uploadAdapter,
    getPipelineContextMeta,
    persistence,
    autoPauseOnOffline,
    autoWakeLock,
    maxQueuedUploads,
    onBeforeStart,
    storageKeyPrefix,
    retryMode,
  } = options ?? {};

  const [config, setConfig] = useState<BrowserPipelineOptions>({
    debug: pipelineConfig?.debug ?? DEFAULT_BROWSER_PIPELINE_OPTIONS.debug,
  });

  const [queue, setQueue] = useState<FileUploadQueueItem<TMeta>[]>([]);
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

  const uploadSemRef = useRef(
    new Semaphore(tuning?.maxUploadConcurrency ?? tuning?.maxConcurrency ?? defaultConcurrency()),
  );
  useEffect(() => {
    uploadSemRef.current = new Semaphore(
      tuning?.maxUploadConcurrency ?? tuning?.maxConcurrency ?? defaultConcurrency(),
    );
  }, [tuning?.maxUploadConcurrency, tuning?.maxConcurrency]);

  const batchStatsRef = useRef({ totalFiles: 0, totalBytes: 0 });
  const batchStartRef = useRef(0);
  const batchContextRef = useRef<{
    files: FileUploadQueueItem[];
    batchId: string;
    preload?: TPreload;
  } | null>(null);
  const dbName = buildDbName(storageKeyPrefix);

  const [isPaused, setIsPaused] = useState(false);
  const pauseRef = useRef<{ paused: boolean; resolvers: Set<() => void> }>({
    paused: false,
    resolvers: new Set(),
  });

  const restoredRef = useRef(false);
  const warnedRef = useRef<Set<string>>(new Set());

  const processOptionsRef = useRef({
    config,
    plugins,
    pipeline,
    onInfo,
    onWarning,
    onFileProcessed,
    onFileComplete,
    onError,
    onBatchComplete,
    onBatchProgress,
    uploadAdapter,
    getPipelineContextMeta,
    onBeforeStart,
    retryMode,
  });
  processOptionsRef.current = {
    config,
    plugins,
    pipeline,
    onInfo,
    onWarning,
    onFileProcessed,
    onFileComplete,
    onError,
    onBatchComplete,
    onBatchProgress,
    uploadAdapter,
    getPipelineContextMeta,
    onBeforeStart,
    retryMode,
  };

  const fireBatchProgress = useCallback(() => {
    const { onBatchProgress } = processOptionsRef.current;
    if (!onBatchProgress) return;
    const q = queueRef.current;
    const succeeded = q.filter((x) => x.status === "complete").length;
    const failed = q.filter((x) => x.status === "error").length;
    const uploadedBytes = q.reduce(
      (sum, x) => sum + ((filesRef.current.get(x.id)?.size ?? 0) * x.progress) / 100,
      0,
    );
    onBatchProgress({
      totalFiles: batchStatsRef.current.totalFiles,
      succeeded,
      failed,
      totalBytes: batchStatsRef.current.totalBytes,
      uploadedBytes: Math.round(uploadedBytes),
    });
  }, []);

  const updateConfig = useCallback((patch: Partial<BrowserPipelineOptions>) => {
    setConfig((prev) => ({ ...prev, ...patch }));
  }, []);

  const addFiles = useCallback(
    (fileList: FileList | File[]) => {
      const { onWarning: warn } = processOptionsRef.current;
      let filtered = Array.from(fileList);

      if (maxFileSize != null) {
        filtered = filtered.filter((f) => {
          if (f.size > maxFileSize) {
            warn?.(
              `"${f.name}" (${(f.size / 1024 / 1024).toFixed(1)} MB) exceeds the maximum file size of ${(maxFileSize / 1024 / 1024).toFixed(1)} MB.`,
            );
            return false;
          }
          return true;
        });
      }

      if (maxTotalBatchSize != null) {
        const currentTotal = queueRef.current.reduce((sum, q) => sum + (q.file?.size ?? 0), 0);
        let running = currentTotal;
        filtered = filtered.filter((f) => {
          running += f.size;
          if (running > maxTotalBatchSize) {
            warn?.(
              `Adding "${f.name}" would exceed the total batch size limit of ${(maxTotalBatchSize / 1024 / 1024).toFixed(1)} MB.`,
            );
            return false;
          }
          return true;
        });
      }

      let sliced = filtered;
      if (maxNumberOfFiles != null) {
        const existing = queueRef.current.length;
        const headroom = Math.max(0, maxNumberOfFiles - existing);
        if (headroom === 0) {
          warn?.(`Maximum of ${maxNumberOfFiles} files already queued.`);
          return;
        }
        if (filtered.length > headroom) {
          warn?.(`Only ${headroom} more file(s) can be added (limit: ${maxNumberOfFiles}).`);
        }
        sliced = filtered.slice(0, headroom);
      }

      const newItems: FileUploadQueueItem<TMeta>[] = [];
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
          needsReselect: false,
        });
      }

      setQueue((prev) => [...prev, ...newItems]);
    },
    [maxNumberOfFiles, getMeta, maxFileSize, maxTotalBatchSize],
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
    <T extends HTMLAttributes<HTMLDivElement>>(props?: T) => {
      return {
        ...props,
        onDrop: (event: DragEvent<HTMLDivElement>) => {
          event.preventDefault();
          setIsDragOver(false);
          dragEnterCounterRef.current = 0;
          if (event.dataTransfer?.files) {
            addFiles(event.dataTransfer.files);
          }
          (props as any)?.onDrop?.(event);
        },
        onDragOver: (event: DragEvent<HTMLDivElement>) => {
          event.preventDefault();
          (props as any)?.onDragOver?.(event);
        },
        onDragEnter: (event: DragEvent<HTMLDivElement>) => {
          event.preventDefault();
          dragEnterCounterRef.current++;
          setIsDragOver(true);
          (props as any)?.onDragEnter?.(event);
        },
        onDragLeave: (event: DragEvent<HTMLDivElement>) => {
          event.preventDefault();
          dragEnterCounterRef.current--;
          if (dragEnterCounterRef.current <= 0) {
            dragEnterCounterRef.current = 0;
            setIsDragOver(false);
          }
          (props as any)?.onDragLeave?.(event);
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
    async (item: FileUploadQueueItem<TMeta>, file: File): Promise<void> => {
      const {
        config: currentConfig,
        plugins: currentPlugins,
        pipeline: currentPipeline,
        onInfo: currentOnInfo,
        onWarning: currentOnWarning,
        onFileProcessed: currentOnFileProcessed,
        onFileComplete: currentOnFileComplete,
        onError: currentOnError,
        uploadAdapter: currentUploadAdapter,
        getPipelineContextMeta: currentGetPipelineContextMeta,
      } = processOptionsRef.current;

      const controller = new AbortController();
      abortControllersRef.current.set(item.id, controller);

      try {
        if (controller.signal.aborted) return;
        if (item.needsReselect) return; // File blob unavailable

        setQueue((prev) =>
          prev.map((q) =>
            q.id === item.id ? { ...q, status: "processing" as const, progress: 0 } : q,
          ),
        );

        const source: PipelineSource = {
          file,
          name: file.name,
          type: file.type || "application/octet-stream",
        };

        // Track stage progress for granular 0-90% range
        let completedStages = 0;
        let totalStages = 0;

        const pipelineContextMeta = currentGetPipelineContextMeta?.();

        const result = await runDefaultBrowserPipeline(source, currentConfig, {
          plugins: currentPlugins,
          pipeline: currentPipeline,
          signal: controller.signal,
          pipelineContextMeta,
          onPauseCheck: async () => {
            if (pauseRef.current.paused) {
              await new Promise<void>((resolve) => {
                pauseRef.current.resolvers.add(resolve);
              });
            }
          },
          onProgress: (event) => {
            if (event.phase === "start") {
              totalStages = event.totalStages;
            } else if (event.phase === "end") {
              completedStages++;
              const overall = (completedStages / totalStages) * 90;
              setQueue((prev) =>
                prev.map((q) => (q.id === item.id ? { ...q, progress: Math.min(overall, 89) } : q)),
              );
            }
          },
          onStageProgress: (_stageId, progress) => {
            if (totalStages === 0) return;
            const overall = ((completedStages + progress / 100) / totalStages) * 90;
            setQueue((prev) =>
              prev.map((q) => (q.id === item.id ? { ...q, progress: Math.min(overall, 89) } : q)),
            );
          },
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
          filesRef.current.delete(item.id);
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

        // Save artifacts immediately so upload adapter errors preserve them
        const processedItem: FileUploadQueueItem<TMeta> = {
          ...item,
          status: "processing" as const,
          progress: 90,
          artifacts: artifactPreviews,
          previewUrl: artifactPreviews[0]?.url,
          needsReselect: false,
        };
        setQueue((prev) => prev.map((q) => (q.id === item.id ? processedItem : q)));
        currentOnFileProcessed?.(processedItem);

        // Upload artifacts if an adapter is configured
        if (currentUploadAdapter && result.artifacts.length > 0) {
          setQueue((prev) =>
            prev.map((q) =>
              q.id === item.id ? { ...q, status: "uploading" as const, progress: 90 } : q,
            ),
          );

          // Acquire upload semaphore slot
          await uploadSemRef.current.acquire(controller.signal);
          try {
            const total = result.artifacts.length;
            for (let i = 0; i < total; i++) {
              // Pause check between artifact uploads
              if (pauseRef.current.paused) {
                await new Promise<void>((resolve) => {
                  pauseRef.current.resolvers.add(resolve);
                });
              }
              const a = result.artifacts[i]!;
              const blob = a.file instanceof Blob ? a.file : new Blob([a.file]);
              if (controller.signal.aborted) return;
              const batchCtx = batchContextRef.current;
              await currentUploadAdapter(
                {
                  variant: a.variant,
                  blob,
                  filename: a.filename,
                  filetype: a.filetype,
                },
                {
                  onProgress: (p) => {
                    const overall = 90 + ((i + p / 100) / total) * 10;
                    setQueue((prev) =>
                      prev.map((q) =>
                        q.id === item.id ? { ...q, progress: Math.min(overall, 99) } : q,
                      ),
                    );
                    fireBatchProgress();
                  },
                  signal: controller.signal,
                  fileId: item.id,
                  totalArtifacts: total,
                  artifactIndex: i,
                  batch: batchCtx
                    ? {
                        files: batchCtx.files,
                        batchId: batchCtx.batchId,
                        preload: batchCtx.preload,
                      }
                    : undefined,
                },
              );
            }
          } finally {
            uploadSemRef.current.release();
          }
        }

        const completedItem: FileUploadQueueItem<TMeta> = {
          ...item,
          status: "complete" as const,
          progress: 100,
          artifacts: artifactPreviews,
          previewUrl: artifactPreviews[0]?.url,
          needsReselect: false,
        };

        setQueue((prev) => prev.map((q) => (q.id === item.id ? completedItem : q)));

        currentOnFileComplete?.(completedItem);
      } catch (err) {
        if (controller.signal.aborted) return;
        const message = err instanceof Error ? err.message : "Unknown error";
        setQueue((prev) =>
          prev.map((q) =>
            q.id === item.id
              ? {
                  ...q,
                  status: "error" as const,
                  error: message,
                  progress: 0,
                  // Preserve artifacts on error so retryUpload can re-use them
                  artifacts: q.artifacts ?? undefined,
                }
              : q,
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

  const startUpload = useCallback(
    async (fileIds?: string[]) => {
      const items = fileIds
        ? queueRef.current.filter((q) => fileIds.includes(q.id))
        : queueRef.current;

      let pending = items.filter((q) => q.status === "idle");
      if (pending.length === 0) return;

      // Backpressure: limit how many files can be in uploading state
      if (maxQueuedUploads != null) {
        const uploading = queueRef.current.filter((q) => q.status === "uploading").length;
        const headroom = Math.max(0, maxQueuedUploads - uploading);
        pending = pending.slice(0, headroom);
        if (pending.length === 0) return;
      }

      if (batchStartRef.current === 0) batchStartRef.current = Date.now();
      const batchBytes = pending.reduce(
        (sum, q) => sum + (filesRef.current.get(q.id)?.size ?? 0),
        0,
      );
      batchStatsRef.current.totalFiles += pending.length;
      batchStatsRef.current.totalBytes += batchBytes;

      fireBatchProgress();
      setIsBusy(true);

      // Generate a unique batch ID for this dispatch
      const batchId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      // Call onBeforeStart with all pending files before any processing begins
      const preload = await processOptionsRef.current.onBeforeStart?.(
        pending as FileUploadQueueItem<TMeta>[],
      );

      // Store batch context so processFile can pass it to each adapter call
      batchContextRef.current = {
        files: pending as FileUploadQueueItem[],
        batchId,
        preload,
      };

      try {
        await Promise.all(
          pending.map(async (item) => {
            const file = filesRef.current.get(item.id);
            if (!file) return;
            await semRef.current.run(() => processFile(item, file));
            fireBatchProgress();
          }),
        );
      } finally {
        batchContextRef.current = null;
        setIsBusy(false);

        const { onBatchComplete: onBatch } = processOptionsRef.current;
        const currentQueue = queueRef.current;
        const succeeded = currentQueue.filter((q) => q.status === "complete").length;
        const failed = currentQueue.filter((q) => q.status === "error").length;

        onBatch?.({
          totalFiles: batchStatsRef.current.totalFiles,
          succeeded,
          failed,
          totalBytes: batchStatsRef.current.totalBytes,
          totalTimeMs: Date.now() - batchStartRef.current,
        });
      }
    },
    [maxQueuedUploads],
  );

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
    filesRef.current.delete(fileId);
  }, []);

  const cancelAll = useCallback(() => {
    for (const fileId of abortControllersRef.current.keys()) {
      cancelUpload(fileId);
    }
  }, [cancelUpload]);

  const retryUpload = useCallback(async (fileId: string) => {
    const item = queueRef.current.find((q) => q.id === fileId);
    if (!item || !item.artifacts || item.artifacts.length === 0) return;

    const {
      uploadAdapter: adapter,
      onFileComplete: onDone,
      onError: onErr,
    } = processOptionsRef.current;
    if (!adapter) return;

    const controller = new AbortController();
    abortControllersRef.current.set(fileId, controller);

    setQueue((prev) =>
      prev.map((q) =>
        q.id === fileId
          ? { ...q, status: "uploading" as const, progress: 90, error: undefined }
          : q,
      ),
    );

    try {
      await uploadSemRef.current.acquire();
      try {
        const total = item.artifacts.length;
        for (let i = 0; i < total; i++) {
          const a = item.artifacts[i]!;
          if (controller.signal.aborted) return;
          await adapter(
            { variant: a.variant, blob: a.blob, filename: a.filename, filetype: a.blob.type },
            {
              onProgress: (p) => {
                const overall = 90 + ((i + p / 100) / total) * 10;
                setQueue((prev) =>
                  prev.map((q) =>
                    q.id === fileId ? { ...q, progress: Math.min(overall, 99) } : q,
                  ),
                );
                fireBatchProgress();
              },
              signal: controller.signal,
              fileId,
              totalArtifacts: total,
              artifactIndex: i,
            },
          );
        }
      } finally {
        uploadSemRef.current.release();
      }

      const completed: FileUploadQueueItem<TMeta> = {
        ...item,
        status: "complete" as const,
        progress: 100,
      };
      setQueue((prev) => prev.map((q) => (q.id === fileId ? completed : q)));
      onDone?.(completed);
    } catch (err) {
      if (controller.signal.aborted) return;
      const message = err instanceof Error ? err.message : "Unknown error";
      setQueue((prev) =>
        prev.map((q) => (q.id === fileId ? { ...q, status: "error" as const, error: message } : q)),
      );
      onErr?.(err instanceof Error ? err : new Error(message), { fileName: item.name });
    } finally {
      abortControllersRef.current.delete(fileId);
    }
  }, []);

  const retry = useCallback(
    (fileId: string) => {
      const opts = processOptionsRef.current;
      // When retryMode is adapter-only and artifacts exist, skip re-compression
      if (opts.retryMode === "adapter-only") {
        retryUpload(fileId).catch(() => {});
        return;
      }
      warnedRef.current.delete(fileId);
      setQueue((prev) =>
        prev.map((q) => {
          if (q.id !== fileId) return q;
          if (q.needsReselect) return q; // Can't retry — file blob lost
          return { ...q, status: "idle" as const, error: undefined, progress: 0 };
        }),
      );
    },
    [retryUpload],
  );

  const clear = useCallback(() => {
    for (const item of queueRef.current) {
      item.artifacts?.forEach((a) => a.url && URL.revokeObjectURL(a.url));
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    }
    filesRef.current.clear();
    warnedRef.current.clear();
    setQueue([]);
  }, []);

  useEffect(() => {
    if (!onWarning) return;
    for (const item of queue) {
      if (item.status === "error" && item.error && !warnedRef.current.has(item.id)) {
        warnedRef.current.add(item.id);
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

  // Prevent tab close during processing
  useEffect(() => {
    if (!autoPreventTabClose || !isBusy) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [autoPreventTabClose, isBusy]);

  // Restore queue from IndexedDB on mount
  useEffect(() => {
    if (persistence !== "indexeddb") return;
    if (restoredRef.current) return;
    restoredRef.current = true;

    loadQueue(dbName)
      .then((stored) => {
        if (stored.length === 0) return;
        const restored: FileUploadQueueItem<TMeta>[] = stored.map((s) => {
          const isAlive = s.status === "complete";
          return {
            id: s.id,
            name: s.name,
            status: (isAlive ? "complete" : "error") as FileUploadQueueItem<TMeta>["status"],
            progress: isAlive ? 100 : 0,
            error: isAlive
              ? undefined
              : "File unavailable after page reload. Drop the file again to re-process.",
            meta: s.meta as TMeta,
            needsReselect: true,
          } as FileUploadQueueItem<TMeta>;
        });
        setQueue(restored);
      })
      .catch(() => {});
  }, [persistence]);

  // Persist queue to IndexedDB on changes (debounced)
  const persistTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (persistence !== "indexeddb") return;
    if (!restoredRef.current) return;

    if (persistTimeoutRef.current) clearTimeout(persistTimeoutRef.current);
    persistTimeoutRef.current = setTimeout(() => {
      saveQueue(serializeForStorage(queueRef.current as any), dbName).catch(() => {});
    }, 500);

    return () => {
      if (persistTimeoutRef.current) clearTimeout(persistTimeoutRef.current);
    };
  }, [queue, persistence]);

  const pause = useCallback(() => {
    pauseRef.current.paused = true;
    setIsPaused(true);
  }, []);

  const resume = useCallback(() => {
    if (!pauseRef.current.paused) return;
    pauseRef.current.paused = false;
    for (const resolve of pauseRef.current.resolvers) {
      resolve();
    }
    pauseRef.current.resolvers.clear();
    setIsPaused(false);
    void startUpload();
  }, [startUpload]);

  // Auto-pause on network offline, resume on online
  useEffect(() => {
    if (!autoPauseOnOffline) return;
    const onOffline = () => pause();
    const onOnline = () => resume();
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, [autoPauseOnOffline, pause, resume]);

  // Screen wake lock while busy
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  useEffect(() => {
    if (!autoWakeLock) return;
    if (!isBusy) {
      wakeLockRef.current?.release().catch(() => {});
      wakeLockRef.current = null;
      return;
    }
    let cancelled = false;
    const acquire = async () => {
      try {
        const lock = await navigator.wakeLock.request("screen");
        if (cancelled) {
          lock.release().catch(() => {});
          return;
        }
        wakeLockRef.current = lock;
        lock.addEventListener("release", () => {
          if (wakeLockRef.current === lock) wakeLockRef.current = null;
        });
      } catch {}
    };
    void acquire();
    const onVisChange = () => {
      if (document.visibilityState === "visible" && !wakeLockRef.current) void acquire();
    };
    document.addEventListener("visibilitychange", onVisChange);
    return () => {
      cancelled = true;
      wakeLockRef.current?.release().catch(() => {});
      wakeLockRef.current = null;
      document.removeEventListener("visibilitychange", onVisChange);
    };
  }, [autoWakeLock, isBusy]);

  return {
    config,
    updateConfig,
    queue,
    startUpload,
    clear,
    retry,
    retryUpload,
    cancelUpload,
    cancelAll,
    pause,
    resume,
    isBusy,
    isPaused,
    isDragOver,
    getDropTargetProps,
    getFileInputProps,
    getFolderInputProps,
  };
}
