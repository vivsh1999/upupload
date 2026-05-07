import type { PipelineContext, PipelineResult, PipelineSource, PipelineStage } from "../core/types";
import { fileExtensionLower, RASTER_IMAGE_EXTENSIONS, RAW_EXTENSIONS } from "../browser/allowlist";
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

function isNonRawRasterImage(file: { name: string; type?: string | null }): boolean {
  const ext = fileExtensionLower(file.name);
  const mime = (file.type ?? "").toLowerCase();

  const isRaster = mime.startsWith("image/") || RASTER_IMAGE_EXTENSIONS.has(ext);
  if (!isRaster) return false;

  if (RAW_EXTENSIONS.has(ext)) return false;
  if (ext === ".heic" || ext === ".heif" || mime === "image/heic" || mime === "image/heif")
    return false;
  if (ext === ".tif" || ext === ".tiff" || mime === "image/tiff") return false;

  return true;
}

export function createJpegCompressorPlugin(): ProcessingPlugin<DefaultBrowserPipelineOptions> {
  return {
    id: "jpeg-compressor",
    name: "JPEG Compressor Plugin",

    supports(file: { name: string; type?: string | null }) {
      return isNonRawRasterImage(file);
    },

    createStages(
      input: PipelineSource,
      opts: DefaultBrowserPipelineOptions,
      classif: FileClassification,
      _ctx: PipelineContext,
    ): PipelineStage<PipelineSource, PipelineResult>[] {
      const stemName = classif.stemName;

      return [
        {
          id: "optimized-jpeg",
          when: () => ({ run: opts.saveOptimized && !classif.isSvg }),
          run: async () => {
            const q = Math.min(100, Math.max(1, opts.qualityPercent)) / 100;
            const maxWH = maxWidthOrHeight(opts.maxLongEdge);

            const imageCompression = await loadImageCompression();
            try {
              const compressed = await imageCompression(input.file as File, {
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
          when: () => ({ run: opts.saveThumbnails && !classif.isSvg }),
          run: async () => {
            const imageCompression = await loadImageCompression();
            try {
              const thumb = await imageCompression(input.file as File, {
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
    },
  };
}
