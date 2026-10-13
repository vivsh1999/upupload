/** @module plugins/jpeg-compressor */
import { fileExtensionLower, RASTER_IMAGE_EXTENSIONS, RAW_EXTENSIONS } from "../browser/allowlist";
import { PIPELINE_CURRENT_KEY } from "../core/constants";
import { Plugin } from "./plugin";
import { warning, artifact } from "../core/result";
import type { PipelineContext, PipelineResult } from "../core/types";
import { jpegFileFromBlob } from "./_rasterize";
import { encodeJpegVariants } from "./_jpegVariants";
import type { EncodedJpegVariant, JpegVariantJob } from "./_jpegVariants";
import imageCompression from "browser-image-compression";
import {
  compressImageInWorker,
  compressVariantsInWorker,
  isOffscreenWorkerSupported,
} from "../browser/worker-client";

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

/**
 * One output variant for the {@link JpegCompressorPluginOptions.variants}
 * multi-variant mode. Every field is optional and falls back to the plugin's
 * own option of the same name.
 */
export interface JpegCompressorVariant {
  /** Artifact variant name, used to build `${stem}.${variant}.jpg`. */
  variant: string;
  /** JPEG quality 1–100. Defaults to the plugin's `quality`. */
  quality?: number;
  /** Longest-edge cap in px. Defaults to the plugin's `maxLongEdge` (`-1` = original). */
  maxLongEdge?: number;
  /** Soft size cap in MB. Defaults to the plugin's `maxSizeMB`. */
  maxSizeMB?: number;
}

export interface JpegCompressorPluginOptions {
  variant?: string;
  quality: number;
  maxLongEdge?: number;
  maxSizeMB: number;
  debug?: boolean;
  /**
   * Emit several JPEG variants from **one** decode: the source is decoded once
   * (EXIF orientation applied by that decode, so `exifOrientation` is not
   * needed), then resized and encoded once per entry. This replaces registering
   * several `.with({}, { instanceId })` clones, each of which would decode the
   * source again.
   *
   * When set and non-empty, this mode takes precedence over the flat
   * `variant` / `quality` / `maxLongEdge` / `maxSizeMB` options, which are only
   * used as per-variant fallbacks.
   *
   * @example
   * ```ts
   * jpegCompressor.with({
   *   variants: [
   *     { variant: "outputFile", quality: 82, maxLongEdge: 2560, maxSizeMB: 1 },
   *     { variant: "thumb", quality: 60, maxLongEdge: 400, maxSizeMB: 0.25 },
   *   ],
   * });
   * ```
   */
  variants?: JpegCompressorVariant[];
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
 * Clamp a 1–100 quality option to a 0–1 JPEG quality fraction.
 */
function qualityFraction(quality: number): number {
  return Math.min(100, Math.max(1, quality)) / 100;
}

/** `-1` means "keep the original size" — normalize it to an absent constraint. */
function resolveMaxEdge(value: number | undefined): number | undefined {
  return value === -1 ? undefined : value;
}

/**
 * Encode every configured variant from a single decode, preferring the worker
 * pool (one job per source file) and falling back to the main thread.
 */
async function encodeVariants(
  sourceFile: File | Blob,
  specs: JpegCompressorVariant[],
  pluginOpts: JpegCompressorPluginOptions,
  useWorker: boolean,
  stemName: string,
  ctx: PipelineContext,
): Promise<EncodedJpegVariant[]> {
  const jobs: JpegVariantJob[] = specs.map((spec) => {
    const maxLongEdge = resolveMaxEdge(spec.maxLongEdge ?? pluginOpts.maxLongEdge);
    const maxSizeMB = spec.maxSizeMB ?? pluginOpts.maxSizeMB;
    return {
      variant: spec.variant,
      filename: `${stemName}.${spec.variant}.jpg`,
      quality: qualityFraction(spec.quality ?? pluginOpts.quality),
      ...(maxLongEdge !== undefined ? { maxLongEdge } : {}),
      ...(maxSizeMB !== undefined ? { maxSizeMB } : {}),
    };
  });

  if (useWorker && isOffscreenWorkerSupported()) {
    try {
      ctx.log(
        "debug",
        `Offloading ${jobs.length} JPEG variant(s) of "${stemName}" to the background worker pool`,
      );
      const results = await compressVariantsInWorker(sourceFile, jobs);
      return results.map((result) => ({
        variant: result.variant,
        filename: result.filename,
        file: new File([result.blob], result.filename, {
          type: "image/jpeg",
          lastModified: Date.now(),
        }),
      }));
    } catch (err) {
      ctx.log(
        "warn",
        `Worker variant compression failed for "${stemName}", falling back to the main thread: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return encodeJpegVariants(sourceFile, jobs);
}

/**
 * JPEG/PNG/WebP compressor — base instance with defaults.
 * Create variants via `.with()`:
 *
 * @example
 * ```ts
 * jpegCompressor.with({ variant: "optimized", quality: 80, maxSizeMB: 1 })
 * jpegCompressor.with({ variant: "thumbnail", quality: 78, maxLongEdge: 320, maxSizeMB: 0.25 })
 *
 * // Or emit several variants from one decode:
 * jpegCompressor.with({
 *   variants: [
 *     { variant: "outputFile", quality: 82, maxLongEdge: 2560 },
 *     { variant: "thumb", quality: 60, maxLongEdge: 400 },
 *   ],
 * })
 * ```
 */
export const jpegCompressor: Plugin<JpegCompressorPluginOptions> =
  new Plugin<JpegCompressorPluginOptions>({
    id: "jpeg-compressor",
    name: "JPEG Compressor Plugin",
    options: { variant: "outputFile", quality: 1, maxLongEdge: -1, maxSizeMB: 1, debug: false },
    supports: (file) => isAnyImage(file),
    run: async (input, pluginOpts, classif, ctx): Promise<PipelineResult> => {
      const stemName = classif.stemName;
      const variantName = pluginOpts.variant ?? "outputFile";
      const q = qualityFraction(pluginOpts.quality);
      const maxWH = resolveMaxEdge(pluginOpts.maxLongEdge);

      if (classif.isSvg) {
        return {
          artifacts: [],
          info: [warning("SVG files cannot be compressed to JPEG.", "svg_skipped")],
          removeFromQueue: false,
        };
      }

      const sourceFile = (ctx.shared.get(PIPELINE_CURRENT_KEY) as File | undefined) ?? input.file;

      const useWorker = ctx.shared.get("pipeline:useWorker") === true;

      // Multi-variant mode: decode once, emit every configured variant.
      const variantSpecs = pluginOpts.variants;
      if (variantSpecs && variantSpecs.length > 0) {
        try {
          const encoded = await encodeVariants(
            sourceFile,
            variantSpecs,
            pluginOpts,
            useWorker,
            stemName,
            ctx,
          );
          return {
            artifacts: encoded.map((variant) =>
              artifact(
                variant.variant,
                variant.file,
                variant.filename,
                variant.file.type,
                input.relativePath !== undefined ? { relativePath: input.relativePath } : {},
              ),
            ),
            info: [],
            removeFromQueue: false,
          };
        } catch (err) {
          ctx.log(
            "warn",
            `Could not encode JPEG variants for "${input.name}": ${err instanceof Error ? err.message : String(err)}`,
          );
          return {
            artifacts: [],
            info: [
              warning(`Could not produce JPEG variants for "${input.name}".`, "variant_failed"),
            ],
            removeFromQueue: false,
          };
        }
      }

      // Try browser-image-compression first, fall back to Canvas API
      let compressed: Blob | File | null = null;

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
