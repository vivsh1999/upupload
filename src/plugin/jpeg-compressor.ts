/** @module plugins/jpeg-compressor */
import { fileExtensionLower, RASTER_IMAGE_EXTENSIONS, RAW_EXTENSIONS } from "../browser/allowlist";
import { PIPELINE_CURRENT_KEY } from "../core/constants";
import { Plugin } from "./plugin";
import { warning, artifact } from "../core/result";

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
  variant?: string;
  quality: number;
  maxLongEdge?: number;
  maxSizeMB: number;
  debug?: boolean;
}

/**
 * JPEG/PNG/WebP compressor — base instance with defaults.
 * Create variants via `.with()`:
 *
 * @example
 * ```ts
 * jpegCompressor.with({ variant: "optimized", quality: 80, maxSizeMB: 1 })
 * jpegCompressor.with({ variant: "thumbnail", quality: 78, maxLongEdge: 320, maxSizeMB: 0.25 })
 * ```
 */
export const jpegCompressor: Plugin<JpegCompressorPluginOptions> =
  new Plugin<JpegCompressorPluginOptions>({
    id: "jpeg-compressor",
    name: "JPEG Compressor Plugin",
    options: { variant: "outputFile", quality: 1, maxLongEdge: -1, maxSizeMB: 1, debug: false },
    supports: (file) => isAnyImage(file),
    run: async (input, pluginOpts, classif, ctx) => {
      const stemName = classif.stemName;
      const variantName = pluginOpts.variant ?? "outputFile";
      const q = Math.min(100, Math.max(1, pluginOpts.quality)) / 100;
      const maxWH = pluginOpts.maxLongEdge === -1 ? undefined : pluginOpts.maxLongEdge;

      if (classif.isSvg) {
        return {
          artifacts: [],
          info: [warning("SVG files cannot be compressed to JPEG.", "svg_skipped")],
          removeFromQueue: false,
        };
      }

      const sourceFile = (ctx.shared.get(PIPELINE_CURRENT_KEY) as File | undefined) ?? input.file;

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
        const now = Date.now();
        const jpegFile = new File(
          [compressed],
          variantName.endsWith(".jpg") ? variantName : `${stemName}.${variantName}.jpg`,
          { type: "image/jpeg", lastModified: now },
        );
        return {
          artifacts: [
            artifact(variantName, jpegFile, jpegFile.name, jpegFile.type, {
              relativePath: input.relativePath,
            }),
          ],
          info: [],
          removeFromQueue: false,
        };
      } catch {
        return {
          artifacts: [],
          info: [
            warning(`Could not produce "${variantName}" for "${input.name}".`, "variant_failed"),
          ],
          removeFromQueue: false,
        };
      }
    },
    preload: () => preloadImageCompression(),
  });

