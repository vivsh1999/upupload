import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { MediaUploadSkeleton } from "./MediaUploadSkeleton";
import type { MaxLongEdgePreset, MediaUploadFieldProps } from "./types";
import { useMediaUpload } from "./useMediaUpload";
import { createJpegCompressorPlugin } from "@vivsh1999/upupload/plugins/jpeg-compressor";
import { createRawToJpegPlugin } from "@vivsh1999/upupload/plugins/raw-to-jpeg";
import { createVideoPosterPlugin } from "@vivsh1999/upupload/plugins/video-poster";
import type { ProcessingPlugin } from "@vivsh1999/upupload/react";

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
    plugins: extraPlugins,
    pipelineConfig,
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

  const [optimizedEnabled, setOptimizedEnabled] = useState(true);
  const [thumbnailEnabled, setThumbnailEnabled] = useState(true);
  const [qualityPercent, setQualityPercent] = useState(90);
  const [maxLongEdge, setMaxLongEdge] = useState<MaxLongEdgePreset>(3840);

  const plugins = useMemo<ProcessingPlugin<any>[]>(() => {
    const result: ProcessingPlugin<any>[] = [];

    // One decoder instance — output is shared via pipeline context
    result.push(createRawToJpegPlugin());

    if (optimizedEnabled) {
      result.push(
        createJpegCompressorPlugin({
          variant: "optimized",
          quality: qualityPercent,
          maxLongEdge,
          maxSizeMB: 1,
        }),
      );
    }
    if (thumbnailEnabled) {
      result.push(
        createJpegCompressorPlugin({
          variant: "thumbnail",
          quality: 78,
          maxLongEdge: 640,
          maxSizeMB: 0.25,
        }),
      );
    }
    result.push(createVideoPosterPlugin(), ...(extraPlugins ?? []));
    return result;
  }, [optimizedEnabled, thumbnailEnabled, qualityPercent, maxLongEdge, extraPlugins]);

  const media = useMediaUpload({
    plugins,
    pipelineConfig,
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
      const title = context?.fileName
        ? `Processing failed: ${context.fileName}`
        : "Processing error";
      toast.error(title, { description: error.message });
    },
    onFileComplete: (item) => {
      onFileComplete?.(item);
      toast.success(`Processed: ${item.name}`);
    },
  });

  const fileListNode = renderFileList?.(media.queue);
  const isDisabled = Boolean(disabled || media.isBusy);
  const dropProps = media.getDropTargetProps(dropTargetProps);

  return (
    <div data-slot="media-upload-field" className={className}>
      <MediaUploadSkeleton
        debug={media.config.debug ?? false}
        onDebugChange={(value) => media.updateConfig({ debug: value })}
        optimizedEnabled={optimizedEnabled}
        thumbnailEnabled={thumbnailEnabled}
        onOptimizedEnabledChange={setOptimizedEnabled}
        onThumbnailEnabledChange={setThumbnailEnabled}
        qualityPercent={qualityPercent}
        onQualityPercentChange={setQualityPercent}
        maxLongEdge={maxLongEdge}
        onMaxLongEdgeChange={setMaxLongEdge}
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
