import type { PipelineSource } from "../core";
import type { DefaultBrowserPipelineOptions } from "../browser";

export type MediaUploadQueueStatus = "idle" | "processing" | "uploading" | "error";

export type MediaUploadQueueItem = {
  id: string;
  name: string;
  status: MediaUploadQueueStatus;
  /** 0–100 */
  progress: number;
  error?: string;
};

export type MediaUploadTransportMode = "tus" | "custom";

export type MediaUploadCustomUploadContext = {
  artifact: {
    variant: string;
    file: File | Blob;
    filename: string;
    filetype: string;
    relativePath?: string;
  };
  signal: AbortSignal;
  onProgress: (percent: number) => void;
};

export type MediaUploadCustomUploadHandler = (ctx: MediaUploadCustomUploadContext) => Promise<void>;

export type TusUploadOptions = {
  endpoint?: string;
  chunkSize?: number;
};

export type MediaUploadTuningOptions = {
  pipelineProgressShare: number;
  maxParallelFileJobs: number;
  addFilesBatchSize: number;
};

export type UseMediaUploadOptions = {
  initialConfig?: Partial<DefaultBrowserPipelineOptions>;
  transport?: MediaUploadTransportMode;
  tus?: TusUploadOptions;
  uploadHandler?: MediaUploadCustomUploadHandler;
  maxNumberOfFiles?: number;
  tuning?: Partial<MediaUploadTuningOptions>;
  onInfo?: (message: string) => void;
  onWarning?: (message: string) => void;
  onError?: (error: Error, context?: { fileName?: string }) => void;
  onFileComplete?: (fileName: string) => void;
};

export type UseMediaUploadResult = {
  config: DefaultBrowserPipelineOptions;
  queue: MediaUploadQueueItem[];
  isBusy: boolean;
  addFiles: (input: File[] | FileList | null | undefined) => Promise<void>;
  startUpload: () => Promise<void>;
  clear: () => void;
  retry: (fileId: string) => void;
  cancel: (fileId?: string) => void;
  updateConfig: (patch: Partial<DefaultBrowserPipelineOptions>) => void;
  getFileInputProps: <T extends Record<string, unknown>>(
    props?: T,
  ) => T & {
    type: "file";
    multiple: true;
    onChange: (event: Event) => void;
  };
  getFolderInputProps: <T extends Record<string, unknown>>(
    props?: T,
  ) => T & {
    type: "file";
    multiple: true;
    onChange: (event: Event) => void;
  };
  getDropTargetProps: <T extends Record<string, unknown>>(
    props?: T,
  ) => T & {
    onDrop: (event: DragEvent) => void;
    onDragOver: (event: DragEvent) => void;
  };
  /** For advanced usage; the raw sources waiting to run through pipeline. */
  getSources: () => PipelineSource[];
};
