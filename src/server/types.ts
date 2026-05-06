import type { PipelineArtifact, PipelineSource } from "../core";

/**
 * Optional server-side processor interface.
 *
 * If a browser pipeline cannot decode/transcode an input (HEIC/TIFF/etc.),
 * consumers can plug in a server processor and return normalized outputs.
 *
 * @param input - The source file that could not be processed client-side.
 * @param requestedVariants - The artifact variants the consumer needs.
 * @returns Artifacts produced by the server, or an empty array to skip.
 */
export type ServerProcessor = {
  /**
   * Return one or more artifacts. Return [] when the processor chooses not to
   * handle the input.
   */
  process: (input: PipelineSource, requestedVariants: string[]) => Promise<PipelineArtifact[]>;
};
