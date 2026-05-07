/** @module plugins/raw-to-jpeg */
import type { PipelineContext, PipelineResult, PipelineSource, PipelineStage } from "../core/types";
import { fileExtensionLower, RAW_EXTENSIONS } from "../browser/allowlist";
import { tryDecodeHeicToJpegFile, tryDecodeTiffToJpegFile } from "../browser/optionalDecoders";
import { decodeCameraRawToJpegFile, preloadRawDecoder } from "../browser/rawDecode";
import type { DefaultBrowserPipelineOptions } from "../browser/pipeline-utils";
import type { FileClassification, ProcessingPlugin } from "./types";

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

function maxWidthOrHeight(preset: DefaultBrowserPipelineOptions["maxLongEdge"]) {
  return preset === "original" ? undefined : preset;
}

/**
 * Create a plugin that decodes RAW/HEIC/TIFF camera images to JPEG.
 * Uses `libraw-wasm`, `heic-decode`/`heic2any`, and `utif` under the hood.
 * @returns A {@link ProcessingPlugin} configured for RAW, HEIC, and TIFF inputs.
 */
export function createRawToJpegPlugin(): ProcessingPlugin<DefaultBrowserPipelineOptions> {
  return {
    id: "raw-to-jpeg",
    name: "RAW to JPEG Plugin",

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
      opts: DefaultBrowserPipelineOptions,
      classif: FileClassification,
      ctx: PipelineContext,
    ): PipelineStage<PipelineSource, PipelineResult>[] {
      const stemName = classif.stemName;

      let decodedCache: File | null | undefined;
      async function getDecoded(): Promise<File | null | undefined> {
        if (decodedCache !== undefined) return decodedCache;
        if (RAW_EXTENSIONS.has(classif.ext)) {
          decodedCache = await decodeCameraRawToJpegFile(input.file as File, {
            outFilename: `${stemName}.raw.jpg`,
            outputQuality: 0.98,
            debug: Boolean(opts.debug),
          });
        } else if (
          classif.ext === ".heic" ||
          classif.ext === ".heif" ||
          classif.mime === "image/heic" ||
          classif.mime === "image/heif"
        ) {
          decodedCache = await tryDecodeHeicToJpegFile(input.file as File);
        } else if (
          classif.ext === ".tif" ||
          classif.ext === ".tiff" ||
          classif.mime === "image/tiff"
        ) {
          decodedCache = await tryDecodeTiffToJpegFile(input.file as File);
        } else {
          decodedCache = null;
        }
        if (!decodedCache) {
          ctx.log("warn", `Decode failed for "${input.name}"`, { ext: classif.ext });
        }
        return decodedCache;
      }

      return [
        {
          id: "optimized-jpeg",
          when: () => ({ run: opts.saveOptimized }),
          run: async () => {
            const q = Math.min(100, Math.max(1, opts.qualityPercent)) / 100;
            const maxWH = maxWidthOrHeight(opts.maxLongEdge);

            const decoded = await getDecoded();
            if (!decoded) {
              if (opts.fallbackToOriginal) {
                const code = RAW_EXTENSIONS.has(classif.ext)
                  ? "raw_decode_failed"
                  : classif.ext === ".heic" || classif.ext === ".heif"
                    ? "heic_decode_missing_or_failed"
                    : "tiff_decode_missing_or_failed";
                return {
                  artifacts: [
                    {
                      variant: "original",
                      file: input.file,
                      filename: input.name,
                      filetype: input.type || "application/octet-stream",
                      relativePath: input.relativePath,
                    },
                  ],
                  info: [
                    {
                      level: "warn",
                      message: `"${input.name}" could not be decoded in-browser. Uploading original instead.`,
                      code,
                    },
                  ],
                  removeFromQueue: false,
                };
              }
              return {
                artifacts: [],
                info: [
                  {
                    level: "warn",
                    message: `Decode failed for "${input.name}".`,
                    code: "decode_failed",
                  },
                ],
                removeFromQueue: false,
              };
            }

            const imageCompression = await loadImageCompression();
            try {
              const compressed = await imageCompression(decoded, {
                maxSizeMB: opts.optimizedMaxSizeMB,
                maxWidthOrHeight: maxWH ?? 16384,
                useWebWorker: true,
                maxIteration: 12,
                fileType: "image/jpeg",
                initialQuality: q,
              });
              const jpegFile = new File([compressed], `${stemName}.jpg`, {
                type: "image/jpeg",
                lastModified: Date.now(),
              });
              return {
                artifacts: [
                  {
                    variant: "optimized",
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
              if (opts.fallbackToOriginal) {
                return {
                  artifacts: [
                    {
                      variant: "original",
                      file: input.file,
                      filename: input.name,
                      filetype: input.type || "application/octet-stream",
                      relativePath: input.relativePath,
                    },
                  ],
                  info: [
                    {
                      level: "warn",
                      message: `Could not optimize "${input.name}" in this browser. Uploading original.`,
                      code: "optimize_failed",
                    },
                  ],
                  removeFromQueue: false,
                };
              }
              return {
                artifacts: [],
                info: [
                  {
                    level: "warn",
                    message: `Could not optimize "${input.name}" in this browser.`,
                    code: "optimize_failed",
                  },
                ],
                removeFromQueue: false,
              };
            }
          },
        },

        {
          id: "thumbnail-jpeg",
          when: () => ({ run: opts.saveThumbnails }),
          run: async () => {
            const decoded = await getDecoded();
            if (!decoded) {
              return { artifacts: [], info: [], removeFromQueue: false };
            }

            const imageCompression = await loadImageCompression();
            try {
              const thumb = await imageCompression(decoded, {
                maxSizeMB: opts.thumbnailMaxSizeMB,
                maxWidthOrHeight: opts.thumbnailMaxEdge,
                useWebWorker: true,
                maxIteration: 10,
                fileType: "image/jpeg",
                initialQuality: 0.78,
              });
              const thumbFile = new File([thumb], `${stemName}.thumb.jpg`, {
                type: "image/jpeg",
                lastModified: Date.now(),
              });
              return {
                artifacts: [
                  {
                    variant: "thumbnail",
                    file: thumbFile,
                    filename: thumbFile.name,
                    filetype: thumbFile.type,
                    relativePath: input.relativePath,
                  },
                ],
                info: [],
                removeFromQueue: false,
              };
            } catch {
              return { artifacts: [], info: [], removeFromQueue: false };
            }
          },
        },
      ];
    },

    preload() {
      preloadImageCompression();
      preloadRawDecoder();
    },
  };
}
