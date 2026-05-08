/** @module plugins/raw-to-jpeg */
import type { PipelineContext, PipelineResult, PipelineSource, PipelineStage } from "../core/types";
import { fileExtensionLower, RAW_EXTENSIONS } from "../browser/allowlist";
import { tryDecodeHeicToJpegFile, tryDecodeTiffToJpegFile } from "./_optionalDecoders";
import { decodeCameraRawToJpegFile, preloadRawDecoder } from "./_rawDecode";
import type { FileClassification, ProcessingPlugin } from "./types";

/**
 * Shared context key used by `createRawToJpegPlugin` to pass the decoded
 * JPEG to downstream plugins such as `createJpegCompressorPlugin`.
 */
export const R2J_SHARED_KEY = "raw-to-jpeg:decoded";

export interface RawToJpegPluginOptions {
  /** Enable debug-level logging in the plugin. */
  debug?: boolean;
}

/**
 * Create a plugin that decodes RAW/HEIC/TIFF camera images to JPEG.
 *
 * This is a **pure decoder** — it does not produce an output artifact.
 * Instead it places the decoded JPEG into the shared pipeline context
 * so downstream plugins (e.g. {@link createJpegCompressorPlugin}) can
 * read it via the key {@link R2J_SHARED_KEY}.
 *
 * ```ts
 * const registry = [
 *   createRawToJpegPlugin(),
 *   createJpegCompressorPlugin({ quality: 80, maxLongEdge: 1920, maxSizeMB: 1 }),
 * ];
 *
 * // In a PipelineDef, reference by ID with overrides:
 * const pipelines = [{
 *   id: "photos",
 *   supports: () => true,
 *   plugins: [
 *     { id: "raw-to-jpeg" },
 *     { id: "jpeg-compressor", opts: { variant: "client-proof", quality: 85 } },
 *   ],
 * }];
 * ```
 *
 * Only one instance is needed — the decoded result is shared with
 * every downstream compressor instance automatically.
 */
export function createRawToJpegPlugin(
  opts?: RawToJpegPluginOptions,
): ProcessingPlugin<RawToJpegPluginOptions> {
  return {
    id: "raw-to-jpeg",
    name: "RAW to JPEG Plugin",
    options: { debug: opts?.debug },

    supports(file: { name: string; type?: string | null }) {
      const ext = fileExtensionLower(file.name);
      const mime = (file.type ?? "").toLowerCase();
      const isRaw = RAW_EXTENSIONS.has(ext);
      const isHeic =
        ext === ".heic" || ext === ".heif" || mime === "image/heic" || mime === "image/heif";
      const isTiff = ext === ".tif" || ext === ".tiff" || mime === "image/tiff";
      return isRaw || isHeic || isTiff;
    },

    createStages(
      input: PipelineSource,
      pluginOpts: RawToJpegPluginOptions,
      classif: FileClassification,
      ctx: PipelineContext,
    ): PipelineStage<PipelineSource, PipelineResult>[] {
      const stemName = classif.stemName;

      return [
        {
          id: "raw-to-jpeg",
          when: () => ({ run: true }),
          run: async () => {
            if (RAW_EXTENSIONS.has(classif.ext)) {
              const decoded = await decodeCameraRawToJpegFile(input.file as File, {
                outFilename: `${stemName}.raw.jpg`,
                outputQuality: 0.98,
                debug: Boolean(pluginOpts.debug),
              });
              if (decoded) {
                ctx.shared.set(R2J_SHARED_KEY, decoded);
              } else {
                ctx.log("warn", `RAW decode failed for "${input.name}"`, { ext: classif.ext });
              }
            } else if (
              classif.ext === ".heic" ||
              classif.ext === ".heif" ||
              classif.mime === "image/heic" ||
              classif.mime === "image/heif"
            ) {
              const decoded = await tryDecodeHeicToJpegFile(input.file as File);
              if (decoded) {
                ctx.shared.set(R2J_SHARED_KEY, decoded);
              } else {
                ctx.log("warn", `HEIC decode failed for "${input.name}"`);
              }
            } else if (
              classif.ext === ".tif" ||
              classif.ext === ".tiff" ||
              classif.mime === "image/tiff"
            ) {
              const decoded = await tryDecodeTiffToJpegFile(input.file as File);
              if (decoded) {
                ctx.shared.set(R2J_SHARED_KEY, decoded);
              } else {
                ctx.log("warn", `TIFF decode failed for "${input.name}"`);
              }
            }
            return { artifacts: [], info: [], removeFromQueue: false };
          },
        },
      ];
    },

    preload() {
      preloadRawDecoder();
    },
  };
}
