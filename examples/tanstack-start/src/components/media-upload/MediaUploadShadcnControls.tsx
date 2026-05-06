import { AlertCircle, RotateCcw, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

import {
  DEFAULT_MAX_RESOLUTION_OPTIONS,
  type MaxLongEdgePreset,
  type MediaUploadSkeletonProps,
} from "./types";

function parseMaxLongEdge(value: string): MaxLongEdgePreset {
  if (value === "original") return "original";
  return Number(value) as MaxLongEdgePreset;
}

function ToggleRow(props: {
  title: string;
  description: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-1">
        <Label className="text-base">{props.title}</Label>
        <p className="text-muted-foreground text-xs leading-relaxed">{props.description}</p>
      </div>
      <Switch
        checked={props.checked}
        onCheckedChange={props.onCheckedChange}
        disabled={props.disabled}
        className="shrink-0"
      />
    </div>
  );
}

/** shadcn-styled `renderControls` for {@link MediaUploadSkeletonProps}. */
export function MediaUploadShadcnControls(props: MediaUploadSkeletonProps) {
  const resOpts = props.resolutionOptions ?? DEFAULT_MAX_RESOLUTION_OPTIONS;
  const {
    className: dropClassName,
    onDrop: _drop,
    onDragOver: _drag,
    ...dropRest
  } = props.dropTargetProps ?? {};

  return (
    <Card className="border-border/80 shadow-md">
      <CardHeader className="border-border/60 border-b pb-4">
        <div className="flex items-start gap-3">
          <div className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-lg">
            <Upload className="size-5" aria-hidden />
          </div>
          <div className="min-w-0 space-y-1">
            <CardTitle className="text-xl">Media upload</CardTitle>
            <CardDescription>
              Choose what to keep, tune JPEG quality and max size, then pick files or a folder. Drag
              and drop works too.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-8 pt-6">
        <input ref={props.fileInputRef} type="file" multiple {...props.fileInputProps} />
        <input
          ref={props.folderInputRef}
          type="file"
          multiple
          {...{ webkitdirectory: "", directory: "" }}
          {...props.folderInputProps}
        />

        <section className="space-y-3" aria-label="Output variants">
          <h3 className="text-sm font-medium">What to upload</h3>
          <div className="grid gap-3">
            <ToggleRow
              title={props.labels?.saveOriginal ?? "Save original"}
              description="Keep a byte-for-byte copy when the format allows."
              checked={props.saveOriginal}
              onCheckedChange={props.onSaveOriginalChange}
              disabled={props.disabled}
            />
            <ToggleRow
              title={props.labels?.saveOptimized ?? "Save optimized"}
              description="Raster / RAW → JPEG under your quality and size caps."
              checked={props.saveOptimized}
              onCheckedChange={props.onSaveOptimizedChange}
              disabled={props.disabled}
            />
            <ToggleRow
              title={props.labels?.saveThumbnails ?? "Save thumbnails"}
              description="Smaller JPEG previews (and video posters when possible)."
              checked={props.saveThumbnails}
              onCheckedChange={props.onSaveThumbnailsChange}
              disabled={props.disabled}
            />
          </div>
        </section>

        <Separator />

        <section className="space-y-4" aria-label="JPEG tuning">
          <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-4">
              <Label htmlFor="jpeg-quality" className="text-sm font-medium">
                {props.labels?.quality ?? "JPEG quality"}
              </Label>
              <span className="text-muted-foreground tabular-nums text-sm">
                {props.qualityPercent}%
              </span>
            </div>
            <Slider
              id="jpeg-quality"
              min={1}
              max={100}
              step={1}
              value={[props.qualityPercent]}
              onValueChange={(v) => props.onQualityPercentChange(v[0] ?? 90)}
              disabled={props.disabled}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="max-resolution" className="text-sm font-medium">
              {props.labels?.maxResolution ?? "Maximum resolution"}
            </Label>
            <Select
              value={String(props.maxLongEdge)}
              onValueChange={(v) => props.onMaxLongEdgeChange(parseMaxLongEdge(v))}
              disabled={props.disabled}
            >
              <SelectTrigger id="max-resolution" className="w-full" size="default">
                <SelectValue placeholder="Select max long edge" />
              </SelectTrigger>
              <SelectContent position="popper" className="w-[var(--radix-select-trigger-width)]">
                {resOpts.map((o) => (
                  <SelectItem key={String(o.value)} value={String(o.value)}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </section>

        <Separator />

        <section className="space-y-3" aria-label="Pick files">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={props.disabled}
              onClick={props.onPickFilesClick}
            >
              {props.labels?.chooseFiles ?? "Choose files"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={props.disabled}
              onClick={props.onPickFolderClick}
            >
              {props.labels?.chooseFolder ?? "Choose folder"}
            </Button>
          </div>
          <div
            data-slot="drop-target"
            className={cn(
              "border-muted-foreground/25 bg-muted/20 text-muted-foreground hover:border-primary/40 hover:bg-muted/40 rounded-xl border-2 border-dashed px-6 py-10 text-center text-sm transition-colors",
              dropClassName,
            )}
            {...dropRest}
            onDrop={props.onDrop}
            onDragOver={props.onDragOver}
          >
            {props.labels?.dropHint ?? "Drop files here"}
          </div>
        </section>

        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={props.disabled} onClick={props.onStartUpload}>
            {props.labels?.startUpload ?? "Start upload"}
          </Button>
          <Button type="button" variant="outline" disabled={props.disabled} onClick={props.onClear}>
            {props.labels?.clear ?? "Clear queue"}
          </Button>
        </div>

        {props.fileList ? (
          <>
            <Separator />
            <div className="space-y-2">
              <h3 className="text-sm font-medium">Queue</h3>
              {props.fileList}
            </div>
          </>
        ) : null}

        {!props.fileList && props.uploadQueue && props.uploadQueue.length > 0 ? (
          <>
            <Separator />
            <div className="space-y-3">
              <h3 className="text-sm font-medium">Queue</h3>
              <ul className="space-y-3">
                {props.uploadQueue.map((item) => (
                  <li
                    key={item.id}
                    className="border-border/60 bg-muted/20 space-y-2 rounded-lg border p-3"
                    title={item.status === "error" && item.error ? item.error : undefined}
                  >
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="truncate text-sm font-medium">{item.name}</p>
                        <p className="text-muted-foreground text-xs">
                          {item.status === "processing"
                            ? (props.labels?.processing ?? "Converting…")
                            : item.status === "uploading"
                              ? (props.labels?.uploading ?? "Uploading…")
                              : item.status === "error"
                                ? "Failed"
                                : "Waiting"}
                        </p>
                      </div>
                      {item.status === "error" && item.error ? (
                        <span className="text-destructive inline-flex shrink-0" title={item.error}>
                          <AlertCircle className="size-4" aria-hidden />
                          <span className="sr-only">{item.error}</span>
                        </span>
                      ) : null}
                      {item.status === "error" && props.onRetryQueueItem ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="shrink-0 gap-1"
                          onClick={() => props.onRetryQueueItem?.(item.id)}
                        >
                          <RotateCcw className="size-3.5" aria-hidden />
                          {props.labels?.retry ?? "Retry"}
                        </Button>
                      ) : null}
                    </div>
                    <Progress value={item.progress} />
                  </li>
                ))}
              </ul>
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
