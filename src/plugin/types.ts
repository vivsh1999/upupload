import type { PipelineContext, PipelineResult, PipelineSource, PipelineStage } from "../core/types";

/**
 * Pre-computed file metadata shared with all processing plugins.
 */
export interface FileClassification {
  ext: string;
  mime: string;
  stemName: string;
  isVideo: boolean;
  isAudio: boolean;
  isSvg: boolean;
  /** File size in bytes. */
  size: number;
  /** Last modified timestamp (ms since epoch). */
  lastModified: number;
  /** Optional custom metadata bag. */
  meta?: Record<string, unknown>;
}

/**
 * A processing plugin contributes pipeline stages for specific file types.
 * @typeParam TOpts - The shape of pipeline options this plugin expects.
 */
export interface ProcessingPlugin<TOpts = Record<string, unknown>> {
  readonly id: string;
  readonly name: string;

  /** Quick classifier — does this plugin handle this file? */
  supports(file: { name: string; type?: string | null }): boolean;

  /**
   * Return pipeline stages for this file.
   * Receives the pre-computed FileClassification, typed options, and pipeline context.
   */
  createStages(
    input: PipelineSource,
    opts: TOpts,
    classif: FileClassification,
    ctx: PipelineContext,
  ): PipelineStage<PipelineSource, PipelineResult>[];

  /** Optional: pre-warm decoders / WASM / etc for files handled by this plugin. */
  preload?(): void;
}
