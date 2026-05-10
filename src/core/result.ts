/** @module core/result */
import type { PipelineArtifact, PipelineInfoMessage, PipelineResult } from "./types";

export function emptyResult(): PipelineResult {
  return { artifacts: [], info: [], removeFromQueue: false };
}

export function artifact(
  variant: string,
  file: File | Blob,
  filename: string,
  filetype?: string,
  extra?: { relativePath?: string; skip?: boolean },
): PipelineArtifact {
  return {
    variant,
    file,
    filename,
    filetype:
      filetype ?? (file instanceof Blob && file.type ? file.type : "application/octet-stream"),
    relativePath: extra?.relativePath,
    skip: extra?.skip,
  };
}

export function warning(message: string, code?: string): PipelineInfoMessage {
  return { level: "warn", message, code };
}

export function infoMessage(message: string, code?: string): PipelineInfoMessage {
  return { level: "info", message, code };
}

/**
 * Create an empty {@link PipelineResult} for use as a fallback value in error handlers.
 *
 * @example
 * ```ts
 * onError: () => ({ action: "fallback", value: fallbackResult() })
 * ```
 */
export function fallbackResult(): PipelineResult {
  return { artifacts: [], info: [], removeFromQueue: false };
}
