import type { PipelineArtifact, PipelineSource } from '../core'

/**
 * Optional server-side processor interface.
 *
 * If a browser pipeline cannot decode/transcode an input (HEIC/TIFF/etc.),
 * consumers can plug in a server processor and return normalized outputs.
 */
export type ServerProcessor = {
  /**
   * Return one or more artifacts. Return [] when the processor chooses not to
   * handle the input.
   */
  process: (input: PipelineSource, requestedVariants: string[]) => Promise<PipelineArtifact[]>
}

