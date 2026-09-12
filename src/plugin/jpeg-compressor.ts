/** @module plugins/jpeg-compressor */
import { fileExtensionLower, RASTER_IMAGE_EXTENSIONS, RAW_EXTENSIONS } from "../browser/allowlist";
import { PIPELINE_CURRENT_KEY } from "../core/constants";
import { Plugin } from "./plugin";
import { warning, artifact } from "../core/result";
import { jpegFileFromBlob } from "./_rasterize";
import imageCompression from "browser-image-compression";
import { isOffscreenWorkerSupported, compressImageInWorker } from "../browser/worker-client";

type ImageCompressionFn = (
  file: File | Blob,
  options: Record<string, unknown>,
) => Promise<File | Blob>;

async function loadImageCompression(): Promise<ImageCompressionFn> {
  return imageCompression as unknown as ImageCompressionFn;
}

function preloadImageCompression() {}

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
  /**
   * URL of the `browser-image-compression` script the Web Worker loads via
   * `importScripts`. Defaults to the library's public CDN build. Supply a
   * same-origin URL to keep the compression hot path free of a third-party
   * dependency (and to keep it working offline).
   */
  libURL?: string;
  /**
   * EXIF orientation (1-8) of the source image. When supplied,
   * `browser-image-compression` skips reading the entire source blob to discover
   * it, which removes a full-file read per compression.
   */
  exifOrientation?: number;
  /**
   * Run the compression inside a Web Worker. Defaults to `true`. Set to `false`
   * to keep the work on the main thread.
   */
  useWebWorker?: boolean;
  /**
   * Maximum re-encode attempts `browser-image-compression` may spend trying to
   * satisfy {@link JpegCompressorPluginOptions.maxSizeMB}. Defaults to `12`.
   */
  maxIteration?: number;
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

      // Try browser-image-compression first, fall back to Canvas API
      let compressed: Blob | File | null = null;

      const useWorker = ctx.shared.get("pipeline:useWorker") === true;
      if (useWorker) {
        try {
          if (isOffscreenWorkerSupported()) {
            ctx.log(
              "debug",
              `Offloading image compression to background Web Worker for "${input.name}"`,
            );
            const workerBlob = await compressImageInWorker(sourceFile, {
              quality: q,
              ...(maxWH !== undefined ? { maxLongEdge: maxWH } : {}),
              ...(pluginOpts.maxSizeMB !== undefined ? { maxSizeMB: pluginOpts.maxSizeMB } : {}),
              filename: `${stemName}.${variantName}.jpg`,
              variant: variantName,
            });
            compressed = new File([workerBlob], `${stemName}.${variantName}.jpg`, {
              type: "image/jpeg",
              lastModified: Date.now(),
            });
          }
        } catch (err) {
          ctx.log(
            "warn",
            `Worker compression failed for "${input.name}", falling back: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }

      if (!compressed) {
        try {
          const imageCompression = await loadImageCompression();
          compressed = await imageCompression(sourceFile, {
            maxSizeMB: pluginOpts.maxSizeMB,
            maxWidthOrHeight: maxWH ?? 16384,
            useWebWorker: pluginOpts.useWebWorker ?? true,
            maxIteration: pluginOpts.maxIteration ?? 12,
            fileType: "image/jpeg",
            ...(pluginOpts.libURL !== undefined ? { libURL: pluginOpts.libURL } : {}),
            ...(pluginOpts.exifOrientation !== undefined
              ? { exifOrientation: pluginOpts.exifOrientation }
              : {}),
            initialQuality: q,
          });
        } catch (err) {
          ctx.log(
            "warn",
            `browser-image-compression failed for "${input.name}", falling back to Canvas compression: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }

      if (!compressed) {
        compressed = await jpegFileFromBlob(sourceFile, `${stemName}.${variantName}.jpg`, {
          quality: q,
          ...(maxWH !== undefined ? { maxWidthOrHeight: maxWH } : {}),
          ...(pluginOpts.maxSizeMB > 0 ? { maxSizeBytes: pluginOpts.maxSizeMB * 1024 * 1024 } : {}),
        });
      }

      if (!compressed) {
        return {
          artifacts: [],
          info: [
            warning(`Could not produce "${variantName}" for "${input.name}".`, "variant_failed"),
          ],
          removeFromQueue: false,
        };
      }

      const now = Date.now();
      const jpegFile = new File(
        [compressed],
        variantName.endsWith(".jpg") ? variantName : `${stemName}.${variantName}.jpg`,
        { type: "image/jpeg", lastModified: now },
      );
      return {
        artifacts: [
          artifact(
            variantName,
            jpegFile,
            jpegFile.name,
            jpegFile.type,
            input.relativePath !== undefined ? { relativePath: input.relativePath } : {},
          ),
        ],
        info: [],
        removeFromQueue: false,
      };
    },
    preload: () => preloadImageCompression(),
  });
