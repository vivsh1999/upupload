import type { PipelineInfoMessage } from "../core/types";

// ---------------------------------------------------------------------------
// Options type & defaults
// ---------------------------------------------------------------------------

export type DefaultBrowserPipelineOptions = {
  saveOriginal: boolean;
  saveOptimized: boolean;
  saveThumbnails: boolean;

  /** 1–100 */
  qualityPercent: number;
  maxLongEdge: "original" | number;

  thumbnailMaxEdge: number;
  optimizedMaxSizeMB: number;
  thumbnailMaxSizeMB: number;

  /**
   * If requested outputs (optimized/thumbnail) cannot be produced in-browser
   * and no server processor is configured, produce an original artifact anyway.
   */
  fallbackToOriginal: boolean;

  debug?: boolean;
};

export const DEFAULT_BROWSER_PIPELINE_OPTIONS: DefaultBrowserPipelineOptions = {
  saveOriginal: false,
  saveOptimized: true,
  saveThumbnails: true,
  qualityPercent: 90,
  maxLongEdge: 3840,
  thumbnailMaxEdge: 640,
  optimizedMaxSizeMB: 1,
  thumbnailMaxSizeMB: 0.25,
  fallbackToOriginal: true,
  debug: false,
};

// ---------------------------------------------------------------------------
// Filename helpers
// ---------------------------------------------------------------------------

export function stem(name: string) {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(0, i) : name;
}

/** Replace the extension of a filename with .jpg. */
export function toJpegName(originalName: string): string {
  return `${stem(originalName)}.jpg`;
}

/** Replace the extension with .thumb.jpg for thumbnail outputs. */
export function toThumbName(originalName: string): string {
  return `${stem(originalName)}.thumb.jpg`;
}

// ---------------------------------------------------------------------------
// Pipeline helpers
// ---------------------------------------------------------------------------

export function info(
  level: PipelineInfoMessage["level"],
  message: string,
  code?: string,
): PipelineInfoMessage {
  return { level, message, code };
}
