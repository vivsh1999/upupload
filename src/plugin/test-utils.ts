/** @module plugins/testing */
import type { FileClassification } from "./types";
import type { PipelineContext, PipelineSource } from "../core/types";

/**
 * Create a mock `PipelineSource` for testing.
 * @param overrides Optional field overrides.
 */
export function mockPipelineSource(overrides?: Partial<PipelineSource>): PipelineSource {
  return {
    file: overrides?.file ?? new File([], "mock.txt"),
    name: overrides?.name ?? "mock.txt",
    type: overrides?.type ?? "text/plain",
    relativePath: overrides?.relativePath,
  };
}

/**
 * Create a mock `PipelineContext` for testing.
 * @param overrides Optional field overrides.
 */
export function mockPipelineContext(overrides?: Partial<PipelineContext>): PipelineContext {
  return {
    log: overrides?.log ?? (() => {}),
    shared: overrides?.shared ?? new Map(),
    signal: overrides?.signal,
  };
}

/**
 * Create a mock `FileClassification` for testing.
 * @param overrides Optional field overrides.
 */
export function mockFileClassification(
  overrides?: Partial<FileClassification>,
): FileClassification {
  return {
    ext: overrides?.ext ?? ".txt",
    mime: overrides?.mime ?? "text/plain",
    stemName: overrides?.stemName ?? "mock",
    isVideo: overrides?.isVideo ?? false,
    isAudio: overrides?.isAudio ?? false,
    isSvg: overrides?.isSvg ?? false,
    size: overrides?.size ?? 0,
    lastModified: overrides?.lastModified ?? Date.now(),
    meta: overrides?.meta,
  };
}
