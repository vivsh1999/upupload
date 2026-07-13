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
  const art: PipelineArtifact = {
    variant,
    file,
    filename,
    filetype:
      filetype ?? (file instanceof Blob && file.type ? file.type : "application/octet-stream"),
  };
  if (extra) {
    if (extra.relativePath !== undefined) art.relativePath = extra.relativePath;
    if (extra.skip !== undefined) art.skip = extra.skip;
  }
  return art;
}

export function warning(message: string, code?: string): PipelineInfoMessage {
  return code !== undefined ? { level: "warn", message, code } : { level: "warn", message };
}

export function infoMessage(message: string, code?: string): PipelineInfoMessage {
  return code !== undefined ? { level: "info", message, code } : { level: "info", message };
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
