import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { MediaUploadSkeleton } from "./MediaUploadSkeleton";
import type { MaxLongEdgePreset, MediaUploadFieldProps } from "./types";
import { useMediaUpload } from "./useMediaUpload";
import { rawToJpeg, jpegCompressor, videoPoster } from "@vivsh1999/upupload/plugins";
import type { ProcessingPlugin } from "@vivsh1999/upupload/react";
import { fetchUploadAdapter } from "@vivsh1999/upupload/adapters";

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
  const [useWorker, setUseWorker] = useState(true);

  const plugins = useMemo<ProcessingPlugin<any>[]>(() => {
    const result: ProcessingPlugin<any>[] = [];

    // One decoder instance — output is shared via pipeline context
    result.push(rawToJpeg);

    if (optimizedEnabled) {
      result.push(
        jpegCompressor.with({
          variant: "optimized",
          quality: qualityPercent,
          maxLongEdge: maxLongEdge === "original" ? undefined : maxLongEdge,
          maxSizeMB: 1,
        }),
      );
    }
    if (thumbnailEnabled) {
      result.push(
        jpegCompressor.with({
          variant: "thumbnail",
          quality: 78,
          maxLongEdge: 640,
          maxSizeMB: 0.25,
        }),
      );
    }
    result.push(videoPoster, ...(extraPlugins ?? []));
    return result;
  }, [optimizedEnabled, thumbnailEnabled, qualityPercent, maxLongEdge, extraPlugins]);

  const media = useMediaUpload({
    plugins,
    pipelineConfig: {
      ...pipelineConfig,
      useWorker,
    },
    uploadAdapter: fetchUploadAdapter({
      url: "/api/upload",
      method: "POST",
      bodyFormat: "form-data",
      extraFields: (art) => ({
        variant: art.variant,
      }),
    }),
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
      toast.success(`Processed & Uploaded: ${item.name}`);
    },
  });

  const fileListNode = renderFileList?.(media.queue);
  const isDisabled = Boolean(disabled || media.isBusy);
  const dropProps = media.getDropTargetProps(dropTargetProps);

  return (
    <div data-slot="media-upload-field" className={className}>
      <MediaUploadSkeleton
        debug={media.config.logLevel === "debug"}
        onDebugChange={(value) => media.updateConfig({ logLevel: value ? "debug" : "silent" })}
        optimizedEnabled={optimizedEnabled}
        thumbnailEnabled={thumbnailEnabled}
        onOptimizedEnabledChange={setOptimizedEnabled}
        onThumbnailEnabledChange={setThumbnailEnabled}
        useWorker={useWorker}
        onUseWorkerChange={setUseWorker}
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
        onRetryQueueItem={(id) => {
          const item = media.queue.find((q) => q.id === id);
          if (item?.artifacts && item.artifacts.length > 0) {
            media.retryUpload(id);
          } else {
            media.retry(id);
          }
        }}
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
