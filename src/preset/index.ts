/** @module preset */
import { runDefaultBrowserPipeline } from "../browser/pipeline";
import { createJpegCompressorPlugin } from "../plugin/jpeg-compressor";
import { createRawToJpegPlugin } from "../plugin/raw-to-jpeg";
import type { PipelineResult } from "../core/types";

export interface UploadOptions {
  /** JPEG quality 1–100. Default: 90. */
  quality?: number;
  /** Max long edge in pixels. Default: 3840. */
  maxLongEdge?: number | "original";
  /** Max size in MB for optimized output. Default: 1. */
  optimizedMaxSizeMB?: number;
  /** Also produce the original file as an artifact. Default: false. */
  saveOriginal?: boolean;
  /** Called for each artifact produced by the pipeline. */
  onArtifact?: (result: PipelineResult) => void | Promise<void>;
}

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
 *       const url = URL.createObjectURL(a.file);
 *       // ... display or upload
 *     }
 *   },
 * });
 * ```
 */
export async function upload(file: File, options?: UploadOptions): Promise<PipelineResult> {
  const q = options?.quality ?? 90;
  const maxLongEdge = options?.maxLongEdge ?? 3840;
  const maxSizeMB = options?.optimizedMaxSizeMB ?? 1;

  const plugins = [
    createRawToJpegPlugin(),
    createJpegCompressorPlugin({ variant: "optimized", quality: q, maxLongEdge, maxSizeMB }),
  ];

  const result = await runDefaultBrowserPipeline(
    { file, name: file.name, type: file.type },
    {},
    { plugins },
  );

  await options?.onArtifact?.(result);

  return result;
}
