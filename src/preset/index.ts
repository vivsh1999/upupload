/** @module preset */
import { runDefaultBrowserPipeline } from "../browser/pipeline";
import type { DefaultBrowserPipelineOptions } from "../browser/pipeline-utils";
import { createJpegCompressorPlugin } from "../plugin/jpeg-compressor";
import { createRawToJpegPlugin } from "../plugin/raw-to-jpeg";
import type { PipelineResult } from "../core/types";

export interface UploadOptions {
  /** Quality percentage (1–100). Default: 90. */
  quality?: number;
  /** Max long edge in pixels. Default: 3840. */
  maxLongEdge?: number | "original";
  /** Max size in MB for optimized output. Default: 1. */
  optimizedMaxSizeMB?: number;
  /** Save original variant alongside optimized. Default: false. */
  saveOriginal?: boolean;
  /** Save optimized variant. Default: true. */
  saveThumbnails?: boolean;
  /** Called for each artifact produced by the pipeline. */
  onArtifact?: (result: PipelineResult) => void | Promise<void>;
}

const plugins = [createRawToJpegPlugin(), createJpegCompressorPlugin()];

/**
 * Upload a file with auto-detected plugins and sensible defaults.
 *
 * @example
 * ```ts
 * const result = await upload(file);
 * ```
 *
 * @example
 * ```ts
 * await upload(file, {
 *   quality: 80,
 *   saveOriginal: true,
 *   onArtifact: (result) => {
 *     for (const a of result.artifacts) {
 *       await fetch("/api/upload", { method: "POST", body: a.file });
 *     }
 *   },
 * });
 * ```
 */
export async function upload(file: File, options?: UploadOptions): Promise<PipelineResult> {
  const pipelineOpts: DefaultBrowserPipelineOptions = {
    saveOriginal: options?.saveOriginal ?? false,
    saveOptimized: true,
    saveThumbnails: options?.saveThumbnails ?? false,
    qualityPercent: options?.quality ?? 90,
    maxLongEdge: options?.maxLongEdge ?? 3840,
    thumbnailMaxEdge: 640,
    optimizedMaxSizeMB: options?.optimizedMaxSizeMB ?? 1,
    thumbnailMaxSizeMB: 0.25,
    fallbackToOriginal: true,
  };

  const result = await runDefaultBrowserPipeline(
    { file, name: file.name, type: file.type },
    pipelineOpts,
    { plugins },
  );

  await options?.onArtifact?.(result);

  return result;
}
