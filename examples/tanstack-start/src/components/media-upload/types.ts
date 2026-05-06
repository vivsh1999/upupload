import type { ComponentProps, DragEvent, HTMLAttributes, ReactNode, Ref } from 'react'
import type {
  DefaultBrowserPipelineOptions,
  MediaUploadCustomUploadHandler,
  MediaUploadCustomUploadContext,
  MediaUploadQueueItem,
  MediaUploadTransportMode,
  MediaUploadTuningOptions,
  TusUploadOptions,
  UseMediaUploadOptions,
  UseMediaUploadResult,
} from 'media-pipeline/react'

export type MaxLongEdgePreset =
  | 'original'
  | 640
  | 720
  | 1280
  | 1920
  | 2560
  | 3840

export const DEFAULT_MAX_RESOLUTION_OPTIONS: ReadonlyArray<{
  value: MaxLongEdgePreset
  label: string
}> = [
  { value: 'original', label: 'Original (no downscale)' },
  { value: 640, label: '640 px (long edge)' },
  { value: 720, label: '720 px' },
  { value: 1280, label: '1280 px' },
  { value: 1920, label: '1920 px (1080p)' },
  { value: 2560, label: '2560 px' },
  { value: 3840, label: '3840 px (4K)' },
]

export type UploadPipelineOptions = DefaultBrowserPipelineOptions

export interface MediaUploadSkeletonClassNames {
  root?: string
  toggleRow?: string
  toggleItem?: string
  toggleLabel?: string
  toggle?: string
  controlRow?: string
  qualityRow?: string
  qualityLabel?: string
  qualityRange?: string
  resolutionRow?: string
  resolutionLabel?: string
  resolutionSelect?: string
  pickerRow?: string
  dropTarget?: string
  buttonRow?: string
  fileButton?: string
  folderButton?: string
  fileInput?: string
  folderInput?: string
  actionRow?: string
  actionButton?: string
  fileList?: string
  fileListItem?: string
}

export type MediaUploadQueueStatus =
  | 'idle'
  | 'processing'
  | 'uploading'
  | 'error'

export type { MediaUploadQueueItem, MediaUploadTuningOptions, MediaUploadTransportMode }
export type { TusUploadOptions, MediaUploadCustomUploadContext, MediaUploadCustomUploadHandler }
export type { UseMediaUploadOptions, UseMediaUploadResult }

export interface MediaUploadSkeletonLabels {
  saveOriginal?: string
  saveOptimized?: string
  saveThumbnails?: string
  quality?: string
  maxResolution?: string
  chooseFiles?: string
  chooseFolder?: string
  dropHint?: string
  startUpload?: string
  clear?: string
  /** Shown on retry buttons / screen readers */
  retry?: string
  /** Status hint next to filename */
  processing?: string
  uploading?: string
}

export interface MediaUploadSkeletonProps {
  saveOriginal: boolean
  saveOptimized: boolean
  saveThumbnails: boolean
  onSaveOriginalChange: (value: boolean) => void
  onSaveOptimizedChange: (value: boolean) => void
  onSaveThumbnailsChange: (value: boolean) => void
  qualityPercent: number
  onQualityPercentChange: (value: number) => void
  maxLongEdge: MaxLongEdgePreset
  onMaxLongEdgeChange: (value: MaxLongEdgePreset) => void
  resolutionOptions?: ReadonlyArray<{ value: MaxLongEdgePreset; label: string }>
  fileInputRef: Ref<HTMLInputElement>
  folderInputRef: Ref<HTMLInputElement>
  onPickFilesClick: () => void
  onPickFolderClick: () => void
  onDrop: (event: DragEvent<HTMLDivElement>) => void
  onDragOver: (event: DragEvent<HTMLDivElement>) => void
  onStartUpload: () => void
  onClear: () => void
  /**
   * One row per source file (original name only). Used for progress bars and
   * error/retry when not using a custom `fileList`.
   */
  uploadQueue?: MediaUploadQueueItem[]
  /** Retry a failed row (same id as Uppy file id). */
  onRetryQueueItem?: (fileId: string) => void
  disabled?: boolean
  classNames?: MediaUploadSkeletonClassNames
  labels?: MediaUploadSkeletonLabels
  fileInputProps?: Omit<ComponentProps<'input'>, 'ref' | 'type' | 'onChange'>
  folderInputProps?: Omit<ComponentProps<'input'>, 'ref' | 'type' | 'onChange'>
  dropTargetProps?: Omit<
    HTMLAttributes<HTMLDivElement>,
    'onDrop' | 'onDragOver'
  >
  /** Replace the whole control stack (toggles + quality + resolution + picker). */
  renderControls?: (props: MediaUploadSkeletonProps) => ReactNode
  /** Replace only the toggles row. */
  renderToggleRow?: (props: MediaUploadSkeletonProps) => ReactNode
  /** Replace file / folder buttons + drop target. */
  renderPicker?: (props: MediaUploadSkeletonProps) => ReactNode
  /** List of queued files (plain markup by default). */
  fileList?: ReactNode
}

export interface MediaUploadFieldProps
  extends Omit<
    MediaUploadSkeletonProps,
    | 'saveOriginal'
    | 'saveOptimized'
    | 'saveThumbnails'
    | 'onSaveOriginalChange'
    | 'onSaveOptimizedChange'
    | 'onSaveThumbnailsChange'
    | 'qualityPercent'
    | 'onQualityPercentChange'
    | 'maxLongEdge'
    | 'onMaxLongEdgeChange'
    | 'fileInputRef'
    | 'folderInputRef'
    | 'onPickFilesClick'
    | 'onPickFolderClick'
    | 'onDrop'
    | 'onDragOver'
    | 'onStartUpload'
    | 'onClear'
    | 'fileList'
    | 'uploadQueue'
    | 'onRetryQueueItem'
    | 'fileInputProps'
    | 'folderInputProps'
    | 'dropTargetProps'
  >,
    UseMediaUploadOptions {
  maxNumberOfFiles?: number
  initialConfig?: Partial<UploadPipelineOptions>
  fileInputProps?: Omit<ComponentProps<'input'>, 'type' | 'multiple'>
  folderInputProps?: Omit<ComponentProps<'input'>, 'type' | 'multiple'>
  dropTargetProps?: Omit<HTMLAttributes<HTMLDivElement>, 'onDrop' | 'onDragOver'>
  /** Override queued file list rendering. */
  renderFileList?: (queue: MediaUploadQueueItem[]) => ReactNode
  /** Extra class on outer wrapper. */
  className?: string
}
