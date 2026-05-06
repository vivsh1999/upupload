import type { DragEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  DEFAULT_BROWSER_PIPELINE_OPTIONS,
  preloadBrowserPipelineForFiles,
  runDefaultBrowserPipeline,
  uploadArtifactWithTus,
} from "../browser";
import type { PipelineSource } from "../core";
import type {
  MediaUploadQueueItem,
  MediaUploadQueueStatus,
  MediaUploadTransportMode,
  MediaUploadTuningOptions,
  UseMediaUploadOptions,
  UseMediaUploadResult,
} from "./types";

type FileJob = {
  id: string;
  source: PipelineSource;
  status: MediaUploadQueueStatus;
  progress: number;
  error?: string;
};

const DEFAULT_TUS_CHUNK_SIZE = 5 * 1024 * 1024;
const DEFAULT_PIPELINE_PROGRESS_SHARE = 0.35;
const DEFAULT_TUS_PATHNAME = "/api/tus/";

function resolveTusEndpoint(override?: string) {
  const o = override?.trim();
  if (o) return o;
  if (typeof window !== "undefined") {
    return new URL(DEFAULT_TUS_PATHNAME, window.location.origin).href;
  }
  return DEFAULT_TUS_PATHNAME;
}

function resolveTransportMode(options: UseMediaUploadOptions): MediaUploadTransportMode {
  if (options.transport) return options.transport;
  const hasTus = Boolean(options.tus);
  const hasCustom = Boolean(options.uploadHandler);
  if (hasTus && hasCustom) {
    throw new Error(
      "When both `tus` and `uploadHandler` are provided, set `transport` to `tus` or `custom`.",
    );
  }
  if (hasCustom) return "custom";
  return "tus";
}

function detectDeviceTuningDefaults(): Pick<
  MediaUploadTuningOptions,
  "maxParallelFileJobs" | "addFilesBatchSize"
> {
  if (typeof navigator === "undefined") {
    return { maxParallelFileJobs: 2, addFilesBatchSize: 16 };
  }

  const cores =
    typeof navigator.hardwareConcurrency === "number" ? navigator.hardwareConcurrency : 4;

  const nav = navigator as Navigator & {
    deviceMemory?: number;
    connection?: { saveData?: boolean };
  };

  const memoryGiB = typeof nav.deviceMemory === "number" ? nav.deviceMemory : undefined;
  const saveData = Boolean(nav.connection?.saveData);
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

  const lowTier = saveData || cores <= 4 || (memoryGiB != null && memoryGiB <= 4) || mobile;
  const highTier = !saveData && cores >= 10 && (memoryGiB == null || memoryGiB >= 8) && !mobile;

  if (highTier) return { maxParallelFileJobs: 4, addFilesBatchSize: 48 };
  if (lowTier) return { maxParallelFileJobs: 2, addFilesBatchSize: 12 };
  return { maxParallelFileJobs: 3, addFilesBatchSize: 24 };
}

function nextFrame() {
  return new Promise<void>((resolve) => {
    if (typeof window === "undefined") {
      resolve();
      return;
    }
    window.requestAnimationFrame(() => resolve());
  });
}

function randomId() {
  return (
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
}

export function useMediaUpload(options: UseMediaUploadOptions = {}): UseMediaUploadResult {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const [config, setConfig] = useState({
    ...DEFAULT_BROWSER_PIPELINE_OPTIONS,
    ...options.initialConfig,
  });

  const [jobs, setJobs] = useState<FileJob[]>([]);

  const abortByJobRef = useRef<Map<string, AbortController>>(new Map());
  const inFlightRef = useRef<Set<string>>(new Set());
  const queuedRef = useRef<string[]>([]);
  const queuedSetRef = useRef<Set<string>>(new Set());
  const activeWorkersRef = useRef(0);

  const deviceDefaults = useMemo(detectDeviceTuningDefaults, []);
  const tuning = useMemo<MediaUploadTuningOptions>(
    () => ({
      pipelineProgressShare:
        options.tuning?.pipelineProgressShare ?? DEFAULT_PIPELINE_PROGRESS_SHARE,
      maxParallelFileJobs:
        options.tuning?.maxParallelFileJobs ?? deviceDefaults.maxParallelFileJobs,
      addFilesBatchSize: options.tuning?.addFilesBatchSize ?? deviceDefaults.addFilesBatchSize,
    }),
    [
      deviceDefaults.addFilesBatchSize,
      deviceDefaults.maxParallelFileJobs,
      options.tuning?.addFilesBatchSize,
      options.tuning?.maxParallelFileJobs,
      options.tuning?.pipelineProgressShare,
    ],
  );

  const queue = useMemo<MediaUploadQueueItem[]>(
    () =>
      jobs.map((j) => ({
        id: j.id,
        name: j.source.name,
        status: j.status,
        progress: j.progress,
        error: j.error,
      })),
    [jobs],
  );

  const isBusy = useMemo(
    () => jobs.some((j) => j.status === "processing" || j.status === "uploading"),
    [jobs],
  );

  const getSources = () => jobs.map((j) => j.source);

  const runJob = async (jobId: string) => {
    const job = jobsRef.current.find((j) => j.id === jobId);
    if (!job) return;
    if (inFlightRef.current.has(jobId)) return;
    if (job.status === "processing" || job.status === "uploading") return;

    inFlightRef.current.add(jobId);
    const ac = new AbortController();
    abortByJobRef.current.set(jobId, ac);

    setJobs((prev) =>
      prev.map((j) =>
        j.id === jobId ? { ...j, status: "processing", progress: 12, error: undefined } : j,
      ),
    );

    try {
      const built = await runDefaultBrowserPipeline(job.source, config);

      for (const m of built.info) {
        if (m.level === "warn") optionsRef.current.onWarning?.(m.message);
        else optionsRef.current.onInfo?.(m.message);
      }

      if (built.removeFromQueue) {
        setJobs((prev) => prev.filter((j) => j.id !== jobId));
        return;
      }

      if (!built.artifacts.length) {
        setJobs((prev) =>
          prev.map((j) =>
            j.id === jobId
              ? {
                  ...j,
                  status: "error",
                  progress: 0,
                  error: "Nothing to upload with the current settings.",
                }
              : j,
          ),
        );
        return;
      }

      const n = built.artifacts.length;
      const parts = Array.from({ length: n }, () => 0);
      const reportUploadProgress = () => {
        const avg = parts.reduce((a, b) => a + b, 0) / n;
        const p = Math.round(
          tuning.pipelineProgressShare * 100 + avg * (1 - tuning.pipelineProgressShare),
        );
        setJobs((prev) =>
          prev.map((j) =>
            j.id === jobId
              ? {
                  ...j,
                  status: "uploading",
                  progress: Math.max(0, Math.min(100, p)),
                  error: undefined,
                }
              : j,
          ),
        );
      };

      setJobs((prev) =>
        prev.map((j) =>
          j.id === jobId
            ? {
                ...j,
                status: "uploading",
                progress: Math.round(tuning.pipelineProgressShare * 100),
                error: undefined,
              }
            : j,
        ),
      );

      const transportMode = resolveTransportMode(optionsRef.current);
      const tusChunkSize = optionsRef.current.tus?.chunkSize ?? DEFAULT_TUS_CHUNK_SIZE;
      const endpoint = resolveTusEndpoint(optionsRef.current.tus?.endpoint);

      await Promise.all(
        built.artifacts.map(async (artifact, index) => {
          if (transportMode === "custom") {
            const uploadHandler = optionsRef.current.uploadHandler;
            if (!uploadHandler)
              throw new Error('`uploadHandler` is required when transport is "custom".');
            await uploadHandler({
              artifact,
              signal: ac.signal,
              onProgress: (pct) => {
                parts[index] = pct;
                reportUploadProgress();
              },
            });
            return;
          }

          await uploadArtifactWithTus({
            endpoint,
            chunkSize: tusChunkSize,
            blob: artifact.file as Blob,
            meta: {
              variant: artifact.variant,
              filename: artifact.filename,
              filetype: artifact.filetype,
              relativePath: artifact.relativePath,
            },
            signal: ac.signal,
            onProgress: (pct) => {
              parts[index] = pct;
              reportUploadProgress();
            },
          });
        }),
      );

      optionsRef.current.onFileComplete?.(job.source.name);

      setJobs((prev) => prev.filter((j) => j.id !== jobId));
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setJobs((prev) =>
          prev.map((j) =>
            j.id === jobId ? { ...j, status: "idle", progress: 0, error: undefined } : j,
          ),
        );
        return;
      }
      const e = error instanceof Error ? error : new Error(String(error));
      setJobs((prev) =>
        prev.map((j) =>
          j.id === jobId ? { ...j, status: "error", progress: 0, error: e.message } : j,
        ),
      );
      optionsRef.current.onError?.(e, { fileName: job.source.name });
    } finally {
      inFlightRef.current.delete(jobId);
      abortByJobRef.current.delete(jobId);
    }
  };

  const jobsRef = useRef<FileJob[]>([]);
  useEffect(() => {
    jobsRef.current = jobs;
  }, [jobs]);

  const pumpQueue = () => {
    while (activeWorkersRef.current < tuning.maxParallelFileJobs && queuedRef.current.length > 0) {
      const nextId = queuedRef.current.shift();
      if (!nextId) break;
      queuedSetRef.current.delete(nextId);

      if (inFlightRef.current.has(nextId)) continue;
      const state = jobsRef.current.find((j) => j.id === nextId)?.status;
      if (state === "processing" || state === "uploading") continue;

      activeWorkersRef.current += 1;
      void runJob(nextId).finally(() => {
        activeWorkersRef.current = Math.max(0, activeWorkersRef.current - 1);
        pumpQueue();
      });
    }
  };

  const enqueueJobs = (ids: string[]) => {
    for (const id of ids) {
      if (queuedSetRef.current.has(id) || inFlightRef.current.has(id)) continue;
      queuedSetRef.current.add(id);
      queuedRef.current.push(id);
    }
    pumpQueue();
  };

  const addFiles = async (input: File[] | FileList | null | undefined) => {
    if (!input?.length) return;
    const all = Array.from(input);

    preloadBrowserPipelineForFiles(
      all.map((file) => ({ name: file.name, type: file.type || "" })),
      { saveOptimized: config.saveOptimized, saveThumbnails: config.saveThumbnails },
    );

    const max = options.maxNumberOfFiles ?? 500;
    const room = Math.max(0, max - jobsRef.current.length);
    const accepted = all.slice(0, room);
    if (accepted.length < all.length) {
      optionsRef.current.onWarning?.(`Only ${max} files can be queued.`);
    }

    for (let i = 0; i < accepted.length; i += tuning.addFilesBatchSize) {
      const batch = accepted.slice(i, i + tuning.addFilesBatchSize);
      setJobs((prev) => [
        ...prev,
        ...batch.map((f) => ({
          id: randomId(),
          source: {
            file: f,
            name: f.name,
            type: f.type || "application/octet-stream",
            relativePath:
              (f as File & { webkitRelativePath?: string }).webkitRelativePath || undefined,
          },
          status: "idle" as const,
          progress: 0,
        })),
      ]);

      if (accepted.length > tuning.addFilesBatchSize) await nextFrame();
    }
  };

  const startUpload = async () => {
    const mode = resolveTransportMode(optionsRef.current);
    if (mode === "tus" && !optionsRef.current.tus) {
      throw new Error('When transport is "tus", provide `tus` options (optional `endpoint`).');
    }

    const pending = jobsRef.current.filter((j) => j.status === "idle" || j.status === "error");
    if (pending.length === 0) {
      optionsRef.current.onInfo?.("No files waiting to upload.");
      return;
    }

    preloadBrowserPipelineForFiles(
      pending.map((j) => ({ name: j.source.name, type: j.source.type })),
      { saveOptimized: config.saveOptimized, saveThumbnails: config.saveThumbnails },
    );

    enqueueJobs(pending.map((j) => j.id));
  };

  const retry = (fileId: string) => enqueueJobs([fileId]);

  const cancel = (fileId?: string) => {
    if (fileId) {
      abortByJobRef.current.get(fileId)?.abort();
      return;
    }
    for (const ac of abortByJobRef.current.values()) ac.abort();
  };

  const clear = () => {
    cancel();
    abortByJobRef.current.clear();
    inFlightRef.current.clear();
    queuedRef.current = [];
    queuedSetRef.current.clear();
    activeWorkersRef.current = 0;
    setJobs([]);
  };

  const updateConfig = (patch: Partial<typeof config>) => {
    setConfig((prev) => ({ ...prev, ...patch }));
  };

  const getFileInputProps = (
    props: Omit<React.ComponentProps<"input">, "type" | "multiple"> = {},
  ): React.ComponentProps<"input"> => ({
    ...props,
    type: "file",
    multiple: true,
    onChange: (event) => {
      props.onChange?.(event);
      void addFiles(event.currentTarget.files);
      event.currentTarget.value = "";
    },
  });

  const getFolderInputProps = (
    props: Omit<React.ComponentProps<"input">, "type" | "multiple"> = {},
  ): React.ComponentProps<"input"> => ({
    ...props,
    type: "file",
    multiple: true,
    ...({ webkitdirectory: "", directory: "" } as Record<string, string>),
    onChange: (event) => {
      props.onChange?.(event);
      void addFiles(event.currentTarget.files);
      event.currentTarget.value = "";
    },
  });

  const getDropTargetProps = (
    props: Omit<React.HTMLAttributes<HTMLDivElement>, "onDrop" | "onDragOver"> = {},
  ): React.HTMLAttributes<HTMLDivElement> => ({
    ...props,
    onDrop: (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      void addFiles(event.dataTransfer?.files);
    },
    onDragOver: (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
    },
  });

  return {
    config,
    queue,
    isBusy,
    addFiles,
    startUpload,
    clear,
    retry,
    cancel,
    updateConfig,
    getFileInputProps,
    getFolderInputProps,
    getDropTargetProps,
    getSources,
  };
}
