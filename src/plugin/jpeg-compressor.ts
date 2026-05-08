/** @module plugins/jpeg-compressor */
import type { PipelineContext, PipelineResult, PipelineSource, PipelineStage } from "../core/types";
import { fileExtensionLower, RASTER_IMAGE_EXTENSIONS, RAW_EXTENSIONS } from "../browser/allowlist";
import type { FileClassification, ProcessingPlugin } from "./types";
import { R2J_SHARED_KEY } from "./raw-to-jpeg";

type ImageCompressionFn = (
  file: File | Blob,
  options: Record<string, unknown>,
) => Promise<File | Blob>;

let compressionModulePromise: Promise<ImageCompressionFn> | null = null;

const BIC = "browser-image-compression";

async function loadImageCompression(): Promise<ImageCompressionFn> {
  if (!compressionModulePromise) {
    compressionModulePromise = import(BIC).then(
      (mod: { default: ImageCompressionFn }) => mod.default,
    );
  }
  return compressionModulePromise;
}

function preloadImageCompression() {
  void loadImageCompression();
}

function isAnyImage(file: { name: string; type?: string | null }): boolean {
  const ext = fileExtensionLower(file.name);
  const mime = (file.type ?? "").toLowerCase();
  if (mime.startsWith("image/")) return true;
  if (file.type && file.type !== "application/octet-stream") return false;
  return RASTER_IMAGE_EXTENSIONS.has(ext) || RAW_EXTENSIONS.has(ext) || ext === ".svg";
}

export interface JpegCompressorPluginOptions {
  /** Output variant name (e.g. "client-proof", "gallery-thumb"). */
  variant: string;
  /** JPEG quality 1–100. */
  quality: number;
  /** Maximum long edge in pixels, or "original" for no downscale. */
  maxLongEdge: number | "original";
  /** Maximum output file size in MB. */
  maxSizeMB: number;
  /** Enable debug-level logging in the plugin. */
  debug?: boolean;
}

/**
 * Create a plugin that compresses JPEG/PNG/WebP/BMP/GIF/AVIF images to JPEG.
 * Uses `browser-image-compression` under the hood.
 *
 * If a previous plugin (e.g. {@link createRawToJpegPlugin}) placed a decoded
 * JPEG in the shared context (key {@link R2J_SHARED_KEY}), this compressor
 * operates on that decoded file instead of the original input.
 *
 * Each instance produces exactly one output variant. For multiple variants
 * use plugin references with overrides in a {@link PipelineDef}:
 *
 * ```ts
 * const registry = [createJpegCompressorPlugin({ quality: 80, ... })];
 *
 * const pipelines = [{
 *   id: "photos", supports: () => true,
 *   plugins: [
 *     { id: "jpeg-compressor", opts: { variant: "client-proof", quality: 85, ... } },
 *     { id: "jpeg-compressor", opts: { variant: "gallery-thumb", quality: 78, ... } },
 *   ],
 * }];
 * ```
 */
export function createJpegCompressorPlugin(
  opts: JpegCompressorPluginOptions,
): ProcessingPlugin<JpegCompressorPluginOptions> {
  return {
    id: "jpeg-compressor",
    name: "JPEG Compressor Plugin",
    options: opts,

    supports(file: { name: string; type?: string | null }) {
      return isAnyImage(file);
    },

    createStages(
      input: PipelineSource,
      pluginOpts: JpegCompressorPluginOptions,
      classif: FileClassification,
      ctx: PipelineContext,
    ): PipelineStage<PipelineSource, PipelineResult>[] {
      const stemName = classif.stemName;
      const variantName = pluginOpts.variant;
      const q = Math.min(100, Math.max(1, pluginOpts.quality)) / 100;
      const maxWH = pluginOpts.maxLongEdge === "original" ? undefined : pluginOpts.maxLongEdge;

      return [
        {
          id: `jpeg-compressor:${variantName}`,
          when: () => ({ run: !classif.isSvg }),
          run: async () => {
            // If a previous plugin decoded the file (e.g. raw-to-jpeg),
            // compress the decoded JPEG instead of the original.
            const sourceFile =
              (ctx.shared.get(R2J_SHARED_KEY) as File | undefined) ?? (input.file as File);

            const imageCompression = await loadImageCompression();
            try {
              const compressed = await imageCompression(sourceFile, {
                maxSizeMB: pluginOpts.maxSizeMB,
                maxWidthOrHeight: maxWH ?? 16384,
                useWebWorker: true,
                maxIteration: 12,
                fileType: "image/jpeg",
                initialQuality: q,
              });
              const jpegFile = new File(
                [compressed],
                variantName.endsWith(".jpg") ? variantName : `${stemName}.${variantName}.jpg`,
                {
                  type: "image/jpeg",
                  lastModified: Date.now(),
                },
              );
              return {
                artifacts: [
                  {
                    variant: variantName,
                    file: jpegFile,
                    filename: jpegFile.name,
                    filetype: jpegFile.type,
                    relativePath: input.relativePath,
                  },
                ],
                info: [],
                removeFromQueue: false,
              };
            } catch {
              return {
                artifacts: [],
                info: [
                  {
                    level: "warn",
                    message: `Could not produce "${variantName}" for "${input.name}".`,
                    code: "variant_failed",
                  },
                ],
                removeFromQueue: false,
              };
            }
          },
        },
      ];
    },

    preload() {
      preloadImageCompression();
    },
  };
}
