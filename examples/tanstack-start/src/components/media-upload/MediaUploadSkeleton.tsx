import type { MaxLongEdgePreset } from "./types";
import { DEFAULT_MAX_RESOLUTION_OPTIONS } from "./types";
import type { FileUploadQueueItem, MediaUploadSkeletonProps } from "./types";

function cx(...parts: Array<string | undefined>) {
  return parts.filter(Boolean).join(" ");
}

const defaultLabels: NonNullable<MediaUploadSkeletonProps["labels"]> = {
  saveOriginal: "Save original",
  saveOptimized: "Save optimized (JPEG)",
  saveThumbnails: "Save thumbnails (JPEG)",
  quality: "JPEG quality",
  maxResolution: "Maximum resolution (long edge)",
  chooseFiles: "Choose files",
  chooseFolder: "Choose folder",
  dropHint: "Drop files or folders here",
  startUpload: "Start upload",
  clear: "Clear",
  retry: "Retry",
  processing: "Converting…",
  uploading: "Uploading…",
};

function statusLabel(item: FileUploadQueueItem, lb: MediaUploadSkeletonProps["labels"]) {
  if (item.status === "processing") return lb?.processing ?? defaultLabels.processing;
  if (item.status === "uploading") return lb?.uploading ?? defaultLabels.uploading;
  return null;
}

function DefaultUploadQueue(props: {
  items: FileUploadQueueItem[];
  classNames?: MediaUploadSkeletonProps["classNames"];
  labels?: MediaUploadSkeletonProps["labels"];
  onRetry?: (id: string) => void;
}) {
  const cn = props.classNames ?? {};
  const lb = { ...defaultLabels, ...props.labels };
  return (
    <ul data-slot="upload-queue" className={cx(cn.fileList)}>
      {props.items.map((item) => (
        <li
          key={item.id}
          data-slot="upload-queue-item"
          className={cx("flex items-start gap-3", cn.fileListItem)}
        >
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate font-medium">{item.name}</span>
              {item.status === "error" && item.error ? (
                <span className="text-destructive truncate text-xs" title={item.error}>
                  {item.error}
                </span>
              ) : null}
              <span className="text-muted-foreground shrink-0 text-xs">
                {statusLabel(item, props.labels)}
              </span>
            </div>
            <div
              className="bg-muted h-1.5 w-full overflow-hidden rounded-full"
              role="progressbar"
              aria-valuenow={Math.round(item.progress)}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="bg-primary h-full transition-[width] duration-300 ease-out"
                style={{ width: `${item.progress}%` }}
              />
            </div>
          </div>
          {item.status === "error" && props.onRetry ? (
            <button
              type="button"
              className="text-primary shrink-0 text-xs underline"
              onClick={() => props.onRetry?.(item.id)}
            >
              {lb.retry}
            </button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function MediaUploadSkeleton(props: MediaUploadSkeletonProps) {
  const lb = { ...defaultLabels, ...props.labels };
  const cn = props.classNames ?? {};
  const resOpts = props.resolutionOptions ?? DEFAULT_MAX_RESOLUTION_OPTIONS;
  const { className: dropExtraClass, ...dropSpread } = props.dropTargetProps ?? {};

  if (props.renderControls) {
    return (
      <div data-slot="root" className={cx(cn.root)}>
        {props.renderControls(props)}
      </div>
    );
  }

  const toggleRow = props.renderToggleRow ? (
    props.renderToggleRow(props)
  ) : (
    <div data-slot="toggle-row" className={cx(cn.toggleRow)}>
      <label data-slot="toggle-item" className={cx(cn.toggleItem)}>
        <span data-slot="toggle-label" className={cx(cn.toggleLabel)}>
          {lb.saveOptimized}
        </span>
        <input
          data-slot="toggle"
          className={cx(cn.toggle)}
          type="checkbox"
          checked={props.optimizedEnabled}
          disabled={props.disabled}
          onChange={(e) => props.onOptimizedEnabledChange(e.target.checked)}
        />
      </label>
      <label data-slot="toggle-item" className={cx(cn.toggleItem)}>
        <span data-slot="toggle-label" className={cx(cn.toggleLabel)}>
          {lb.saveThumbnails}
        </span>
        <input
          data-slot="toggle"
          className={cx(cn.toggle)}
          type="checkbox"
          checked={props.thumbnailEnabled}
          disabled={props.disabled}
          onChange={(e) => props.onThumbnailEnabledChange(e.target.checked)}
        />
      </label>
    </div>
  );

  const qualityRow = (
    <div data-slot="quality-row" className={cx(cn.qualityRow)}>
      <label data-slot="quality-label" className={cx(cn.qualityLabel)}>
        {lb.quality}: {props.qualityPercent}%
      </label>
      <input
        data-slot="quality-range"
        className={cx(cn.qualityRange)}
        type="range"
        min={1}
        max={100}
        value={props.qualityPercent}
        disabled={props.disabled}
        onChange={(e) => props.onQualityPercentChange(Number(e.target.value))}
      />
    </div>
  );

  const resolutionRow = (
    <div data-slot="resolution-row" className={cx(cn.resolutionRow)}>
      <label data-slot="resolution-label" className={cx(cn.resolutionLabel)}>
        {lb.maxResolution}
      </label>
      <select
        data-slot="resolution-select"
        className={cx(cn.resolutionSelect)}
        disabled={props.disabled}
        value={String(props.maxLongEdge)}
        onChange={(e) => {
          const v = e.target.value;
          props.onMaxLongEdgeChange(
            v === "original" ? "original" : (Number(v) as MaxLongEdgePreset),
          );
        }}
      >
        {resOpts.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );

  const picker = props.renderPicker ? (
    props.renderPicker(props)
  ) : (
    <>
      <input
        ref={props.fileInputRef}
        data-slot="file-input"
        className={cx(cn.fileInput)}
        type="file"
        multiple
        disabled={props.disabled}
        {...props.fileInputProps}
      />
      <input
        ref={props.folderInputRef}
        data-slot="folder-input"
        className={cx(cn.folderInput)}
        type="file"
        multiple
        {...{ webkitdirectory: "", directory: "" }}
        disabled={props.disabled}
        {...props.folderInputProps}
      />
      <div data-slot="picker-row" className={cx(cn.pickerRow)}>
        <div data-slot="button-row" className={cx(cn.buttonRow)}>
          <button
            data-slot="file-button"
            type="button"
            className={cx(cn.fileButton)}
            disabled={props.disabled}
            onClick={props.onPickFilesClick}
          >
            {lb.chooseFiles}
          </button>
          <button
            data-slot="folder-button"
            type="button"
            className={cx(cn.folderButton)}
            disabled={props.disabled}
            onClick={props.onPickFolderClick}
          >
            {lb.chooseFolder}
          </button>
        </div>
        <div
          data-slot="drop-target"
          className={cx(cn.dropTarget, dropExtraClass)}
          {...dropSpread}
          onDrop={props.onDrop}
          onDragOver={props.onDragOver}
        >
          {lb.dropHint}
        </div>
      </div>
    </>
  );

  return (
    <div data-slot="root" className={cx(cn.root)}>
      {toggleRow}
      <div data-slot="control-row" className={cx(cn.controlRow)}>
        {qualityRow}
        {resolutionRow}
      </div>
      {picker}
      <div data-slot="action-row" className={cx(cn.actionRow)}>
        <button
          data-slot="action-start"
          type="button"
          className={cx(cn.actionButton)}
          disabled={props.disabled}
          onClick={props.onStartUpload}
        >
          {lb.startUpload}
        </button>
        <button
          data-slot="action-clear"
          type="button"
          className={cx(cn.actionButton)}
          disabled={props.disabled}
          onClick={props.onClear}
        >
          {lb.clear}
        </button>
      </div>
      {props.fileList}
      {!props.fileList && props.uploadQueue && props.uploadQueue.length > 0 ? (
        <DefaultUploadQueue
          items={props.uploadQueue}
          classNames={props.classNames}
          labels={props.labels}
          onRetry={props.onRetryQueueItem}
        />
      ) : null}
    </div>
  );
}
