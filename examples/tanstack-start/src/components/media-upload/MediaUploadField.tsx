import { useRef } from "react";
import { toast } from "sonner";

import { MediaUploadSkeleton } from "./MediaUploadSkeleton";
import type { MaxLongEdgePreset, MediaUploadFieldProps } from "./types";
import { useMediaUpload } from "./useMediaUpload";

export function MediaUploadField(props: MediaUploadFieldProps) {
  const {
    className,
    labels,
    classNames,
    resolutionOptions,
    renderControls,
    renderToggleRow,
    renderPicker,
    renderFileList,
    disabled,
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
    fileInputProps,
    folderInputProps,
    dropTargetProps,
  } = props;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const media = useMediaUpload({
    initialConfig,
    plugins,
    transport,
    tus,
    uploadHandler,
    maxNumberOfFiles,
    tuning,
    onInfo: (message) => {
      onInfo?.(message);
      toast.message(message);
    },
    onWarning: (message) => {
      onWarning?.(message);
      toast.warning(message);
    },
    onError: (error, context) => {
      onError?.(error, context);
      const title = context?.fileName ? `Upload failed: ${context.fileName}` : "Uploader error";
      toast.error(title, { description: error.message });
    },
    onFileComplete: (fileName) => {
      onFileComplete?.(fileName);
      toast.success(`Uploaded: ${fileName}`);
    },
  });

  const fileListNode = renderFileList?.(media.queue);
  const isDisabled = Boolean(disabled || media.isBusy);
  const dropProps = media.getDropTargetProps(dropTargetProps);

  return (
    <div data-slot="media-upload-field" className={className}>
      <MediaUploadSkeleton
        saveOriginal={media.config.saveOriginal}
        saveOptimized={media.config.saveOptimized}
        saveThumbnails={media.config.saveThumbnails}
        onSaveOriginalChange={(value) => media.updateConfig({ saveOriginal: value })}
        onSaveOptimizedChange={(value) => media.updateConfig({ saveOptimized: value })}
        onSaveThumbnailsChange={(value) => media.updateConfig({ saveThumbnails: value })}
        qualityPercent={media.config.qualityPercent}
        onQualityPercentChange={(value) => media.updateConfig({ qualityPercent: value })}
        maxLongEdge={media.config.maxLongEdge as MaxLongEdgePreset}
        onMaxLongEdgeChange={(value) => media.updateConfig({ maxLongEdge: value })}
        resolutionOptions={resolutionOptions}
        fileInputRef={fileInputRef}
        folderInputRef={folderInputRef}
        onPickFilesClick={() => fileInputRef.current?.click()}
        onPickFolderClick={() => folderInputRef.current?.click()}
        onDrop={(event) => dropProps.onDrop?.(event)}
        onDragOver={(event) => dropProps.onDragOver?.(event)}
        onStartUpload={() => {
          void media.startUpload();
        }}
        onClear={media.clear}
        uploadQueue={renderFileList ? undefined : media.queue}
        onRetryQueueItem={media.retry}
        disabled={isDisabled}
        labels={labels}
        classNames={classNames}
        renderControls={renderControls}
        renderToggleRow={renderToggleRow}
        renderPicker={renderPicker}
        fileInputProps={media.getFileInputProps({
          ...fileInputProps,
          hidden: true,
        })}
        folderInputProps={media.getFolderInputProps({
          ...folderInputProps,
          hidden: true,
        })}
        dropTargetProps={dropProps}
        fileList={fileListNode ?? undefined}
      />
    </div>
  );
}
