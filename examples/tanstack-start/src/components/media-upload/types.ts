import type { ComponentProps, DragEvent, HTMLAttributes, ReactNode, Ref } from "react";
import type {
  BrowserPipelineOptions,
  FileUploadQueueItem,
  FileUploadTuningOptions,
  UseFileUploadOptions,
  UseFileUploadResult,
} from "@vivsh1999/upupload/react";

export type MaxLongEdgePreset = "original" | 640 | 720 | 1280 | 1920 | 2560 | 3840;

export const DEFAULT_MAX_RESOLUTION_OPTIONS: ReadonlyArray<{
  value: MaxLongEdgePreset;
  label: string;
}> = [
  { value: "original", label: "Original (no downscale)" },
  { value: 640, label: "640 px (long edge)" },
  { value: 720, label: "720 px" },
  { value: 1280, label: "1280 px" },
  { value: 1920, label: "1920 px (1080p)" },
  { value: 2560, label: "2560 px" },
  { value: 3840, label: "3840 px (4K)" },
];

export type { BrowserPipelineOptions };
export type MediaUploadQueueStatus = "idle" | "processing" | "complete" | "error";

export type { FileUploadQueueItem, FileUploadTuningOptions };
export type { UseFileUploadOptions, UseFileUploadResult };

export interface MediaUploadSkeletonClassNames {
  root?: string;
  toggleRow?: string;
  toggleItem?: string;
  toggleLabel?: string;
  toggle?: string;
  controlRow?: string;
  qualityRow?: string;
  qualityLabel?: string;
  qualityRange?: string;
  resolutionRow?: string;
  resolutionLabel?: string;
  resolutionSelect?: string;
  pickerRow?: string;
  dropTarget?: string;
  buttonRow?: string;
  fileButton?: string;
  folderButton?: string;
  fileInput?: string;
  folderInput?: string;
  actionRow?: string;
  actionButton?: string;
  fileList?: string;
  fileListItem?: string;
}

export interface MediaUploadSkeletonLabels {
  saveOriginal?: string;
  saveOptimized?: string;
  saveThumbnails?: string;
  quality?: string;
  maxResolution?: string;
  chooseFiles?: string;
  chooseFolder?: string;
  dropHint?: string;
  startUpload?: string;
  clear?: string;
  retry?: string;
  processing?: string;
  uploading?: string;
}

export interface MediaUploadSkeletonProps {
  debug: boolean;
  onDebugChange: (value: boolean) => void;
  optimizedEnabled: boolean;
  thumbnailEnabled: boolean;
  onOptimizedEnabledChange: (value: boolean) => void;
  onThumbnailEnabledChange: (value: boolean) => void;
  qualityPercent: number;
  onQualityPercentChange: (value: number) => void;
  maxLongEdge: MaxLongEdgePreset;
  onMaxLongEdgeChange: (value: MaxLongEdgePreset) => void;
  resolutionOptions?: ReadonlyArray<{ value: MaxLongEdgePreset; label: string }>;
  fileInputRef: Ref<HTMLInputElement>;
  folderInputRef: Ref<HTMLInputElement>;
  onPickFilesClick: () => void;
  onPickFolderClick: () => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
  onDragOver: (event: DragEvent<HTMLDivElement>) => void;
  onStartUpload: () => void;
  onClear: () => void;
  uploadQueue?: FileUploadQueueItem[];
  onRetryQueueItem?: (fileId: string) => void;
  disabled?: boolean;
  classNames?: MediaUploadSkeletonClassNames;
  labels?: MediaUploadSkeletonLabels;
  fileInputProps?: Omit<ComponentProps<"input">, "ref" | "type" | "onChange">;
  folderInputProps?: Omit<ComponentProps<"input">, "ref" | "type" | "onChange">;
  dropTargetProps?: Omit<HTMLAttributes<HTMLDivElement>, "onDrop" | "onDragOver">;
  renderControls?: (props: MediaUploadSkeletonProps) => ReactNode;
  renderToggleRow?: (props: MediaUploadSkeletonProps) => ReactNode;
  renderPicker?: (props: MediaUploadSkeletonProps) => ReactNode;
  fileList?: ReactNode;
}

export interface MediaUploadFieldProps
  extends
    Omit<
      MediaUploadSkeletonProps,
      | "saveOriginal"
      | "saveOptimized"
      | "saveThumbnails"
      | "onSaveOriginalChange"
      | "onSaveOptimizedChange"
      | "onSaveThumbnailsChange"
      | "qualityPercent"
      | "onQualityPercentChange"
      | "maxLongEdge"
      | "onMaxLongEdgeChange"
      | "fileInputRef"
      | "folderInputRef"
      | "onPickFilesClick"
      | "onPickFolderClick"
      | "onDrop"
      | "onDragOver"
      | "onStartUpload"
      | "onClear"
      | "fileList"
      | "uploadQueue"
      | "onRetryQueueItem"
      | "debug"
      | "onDebugChange"
      | "optimizedEnabled"
      | "thumbnailEnabled"
      | "onOptimizedEnabledChange"
      | "onThumbnailEnabledChange"
      | "fileInputProps"
      | "folderInputProps"
      | "dropTargetProps"
    >,
    UseFileUploadOptions {
  maxNumberOfFiles?: number;
  fileInputProps?: Omit<ComponentProps<"input">, "type" | "multiple">;
  folderInputProps?: Omit<ComponentProps<"input">, "type" | "multiple">;
  dropTargetProps?: Omit<HTMLAttributes<HTMLDivElement>, "onDrop" | "onDragOver">;
  renderFileList?: (queue: FileUploadQueueItem[]) => ReactNode;
  className?: string;
}
