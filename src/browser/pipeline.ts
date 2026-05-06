import type {
  PipelineDefinition,
  PipelineInfoMessage,
  PipelineResult,
  PipelineSource,
} from "../core";
import { runPipeline } from "../core";
import {
  fileExtensionLower,
  isAudioLike,
  isCameraRawImage,
  isSupportedMediaUpload,
  isVideoLike,
  shouldCompressToJpeg,
} from "./allowlist";
import {
  isHeicLike,
  isTiffLike,
  tryDecodeHeicToJpegFile,
  tryDecodeTiffToJpegFile,
} from "./optionalDecoders";
import { decodeCameraRawToJpegFile, preloadRawDecoder } from "./rawDecode";

type ImageCompressionFn = typeof import("browser-image-compression").default;

let imageCompressionModulePromise: Promise<ImageCompressionFn> | null = null;

async function loadImageCompression(): Promise<ImageCompressionFn> {
  if (!imageCompressionModulePromise) {
    imageCompressionModulePromise = import("browser-image-compression").then((mod) => mod.default);
  }
  return imageCompressionModulePromise;
}

export function preloadImageCompression() {
  void loadImageCompression();
}

export type DefaultBrowserPipelineVariant = "original" | "optimized" | "thumbnail";

export type DefaultBrowserPipelineOptions = {
  saveOriginal: boolean;
  saveOptimized: boolean;
  saveThumbnails: boolean;

  /** 1–100 */
  qualityPercent: number;
  maxLongEdge: "original" | number;

  thumbnailMaxEdge: number;
  optimizedMaxSizeMB: number;
  thumbnailMaxSizeMB: number;

  /**
   * If requested outputs (optimized/thumbnail) cannot be produced in-browser and
   * no server processor is configured, produce an `original` artifact anyway.
   *
   * This is the key “wide support” default: never drop user media just because
   * a codec isn’t available client-side.
   */
  fallbackToOriginal: boolean;

  debug?: boolean;
};

export const DEFAULT_BROWSER_PIPELINE_OPTIONS: DefaultBrowserPipelineOptions = {
  saveOriginal: false,
  saveOptimized: true,
  saveThumbnails: true,
  qualityPercent: 90,
  maxLongEdge: 3840,
  thumbnailMaxEdge: 640,
  optimizedMaxSizeMB: 1,
  thumbnailMaxSizeMB: 0.25,
  fallbackToOriginal: true,
  debug: false,
};

export function preloadBrowserPipelineForFiles(
  files: Array<{ name: string; type?: string | null }>,
  opts: Pick<DefaultBrowserPipelineOptions, "saveOptimized" | "saveThumbnails">,
) {
  if (!opts.saveOptimized && !opts.saveThumbnails) return;
  let shouldWarmImageCompression = false;
  let shouldWarmRawDecoder = false;

  for (const file of files) {
    if (isCameraRawImage(file)) {
      shouldWarmRawDecoder = true;
    }
    if (shouldCompressToJpeg(file) || isCameraRawImage(file)) {
      shouldWarmImageCompression = true;
    }
    if (shouldWarmImageCompression && shouldWarmRawDecoder) break;
  }

  if (shouldWarmImageCompression) preloadImageCompression();
  if (shouldWarmRawDecoder) preloadRawDecoder();
}

function stem(name: string) {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(0, i) : name;
}

export function toJpegName(originalName: string) {
  return `${stem(originalName)}.jpg`;
}

export function toThumbName(originalName: string) {
  return `${stem(originalName)}.thumb.jpg`;
}

function maxWidthOrHeightForPreset(preset: DefaultBrowserPipelineOptions["maxLongEdge"]) {
  return preset === "original" ? undefined : preset;
}

async function videoPosterFile(source: File, maxEdge: number): Promise<File | null> {
  const url = URL.createObjectURL(source);
  try {
    const video = document.createElement("video");
    video.src = url;
    video.muted = true;
    video.playsInline = true;
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error("video load"));
    });
    video.currentTime = Math.min(0.25, (video.duration || 1) * 0.01);
    await new Promise<void>((resolve) => {
      video.onseeked = () => resolve();
    });
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) return null;
    const scale = Math.min(1, maxEdge / Math.max(w, h));
    const cw = Math.max(1, Math.round(w * scale));
    const ch = Math.max(1, Math.round(h * scale));
    const canvas = document.createElement("canvas");
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, cw, ch);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.78),
    );
    if (!blob) return null;
    return new File([blob], `${stem(source.name)}.poster.jpg`, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function info(
  level: PipelineInfoMessage["level"],
  message: string,
  code?: string,
): PipelineInfoMessage {
  return { level, message, code };
}

export async function runDefaultBrowserPipeline(
  input: PipelineSource,
  opts: DefaultBrowserPipelineOptions,
): Promise<PipelineResult> {
  const log = (level: "debug" | "info" | "warn" | "error", message: string, extra?: unknown) => {
    if (!opts.debug) return;
    const prefix = `[@vivsh1999/upupload] ${input.name}`;
    // eslint-disable-next-line no-console
    const fn = console[level] ?? console.log;
    fn(prefix, message, extra ?? "");
  };

  const def: PipelineDefinition<PipelineSource, PipelineResult> = {
    stages: [
      {
        id: "validate-allowlist",
        when: () => ({ run: true }),
        run: () => {
          if (!isSupportedMediaUpload({ name: input.name, type: input.type })) {
            log("warn", "Rejected (not in allowlist).", { name: input.name, type: input.type });
            return { artifacts: [], info: [], removeFromQueue: true };
          }
          if (!opts.saveOriginal && !opts.saveOptimized && !opts.saveThumbnails) {
            return {
              artifacts: [],
              info: [
                info(
                  "warn",
                  "Enable at least one of: save original, save optimized, or save thumbnails.",
                  "no_outputs_enabled",
                ),
              ],
              removeFromQueue: true,
            };
          }
          if (!(input.file instanceof File)) {
            return {
              artifacts: [],
              info: [info("warn", "Source is not a browser File.", "not_a_file")],
              removeFromQueue: true,
            };
          }
          return { artifacts: [], info: [], removeFromQueue: false };
        },
      },

      {
        id: "original",
        when: () => ({ run: opts.saveOriginal }),
        run: () => ({
          artifacts: [
            {
              variant: "original",
              file: input.file,
              filename: input.name,
              filetype: input.type || "application/octet-stream",
              relativePath: input.relativePath,
            },
          ],
          info: [],
          removeFromQueue: false,
        }),
      },

      {
        id: "video-poster-thumbnail",
        when: () => ({
          run: opts.saveThumbnails && isVideoLike({ name: input.name, type: input.type }),
        }),
        run: async () => {
          const poster = await videoPosterFile(input.file as File, opts.thumbnailMaxEdge);
          if (!poster) {
            return {
              artifacts: [],
              info: [
                info(
                  "warn",
                  `Could not generate a video poster for "${input.name}".`,
                  "poster_failed",
                ),
              ],
              removeFromQueue: false,
            };
          }
          return {
            artifacts: [
              {
                variant: "thumbnail",
                file: poster,
                filename: poster.name,
                filetype: poster.type || "application/octet-stream",
                relativePath: input.relativePath,
              },
            ],
            info: [],
            removeFromQueue: false,
          };
        },
      },

      {
        id: "svg-guard",
        when: () => ({ run: true }),
        run: () => {
          const ext = fileExtensionLower(input.name);
          const isSvg = input.type === "image/svg+xml" || ext === ".svg";
          if (!isSvg) return { artifacts: [], info: [], removeFromQueue: false };

          // SVG cannot be raster-compressed here; keep original only.
          if (
            !opts.saveOriginal &&
            (opts.saveOptimized || opts.saveThumbnails) &&
            opts.fallbackToOriginal
          ) {
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
                info(
                  "info",
                  `SVG "${input.name}" uploaded as original (no client-side raster optimize).`,
                  "svg_original",
                ),
              ],
              removeFromQueue: false,
            };
          }

          return { artifacts: [], info: [], removeFromQueue: false };
        },
      },

      {
        id: "optimized-jpeg",
        when: () => {
          const isVideo = isVideoLike({ name: input.name, type: input.type });
          const isAudio = isAudioLike({ name: input.name, type: input.type });
          const ext = fileExtensionLower(input.name);
          const isSvg = input.type === "image/svg+xml" || ext === ".svg";
          return {
            run: opts.saveOptimized && !isVideo && !isAudio && !isSvg,
          };
        },
        run: async () => {
          const q = Math.min(100, Math.max(1, opts.qualityPercent)) / 100;
          const maxWH = maxWidthOrHeightForPreset(opts.maxLongEdge);
          const rawImage = isCameraRawImage({ name: input.name, type: input.type });
          const heicLike = isHeicLike({ name: input.name, type: input.type });
          const tiffLike = isTiffLike({ name: input.name, type: input.type });

          let rasterSource: File = input.file as File;
          if (rawImage) {
            const decoded = await decodeCameraRawToJpegFile(input.file as File, {
              outFilename: `${stem(input.name)}.raw.jpg`,
              outputQuality: 0.98,
              debug: Boolean(opts.debug),
            });
            if (decoded) {
              rasterSource = decoded;
            } else {
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
                    info(
                      "warn",
                      `"${input.name}" could not be decoded in-browser (RAW). Uploading original instead.`,
                      "raw_decode_failed",
                    ),
                  ],
                  removeFromQueue: false,
                };
              }
              return {
                artifacts: [],
                info: [info("warn", `RAW decode failed for "${input.name}".`, "raw_decode_failed")],
                removeFromQueue: false,
              };
            }
          } else if (heicLike) {
            const decoded = await tryDecodeHeicToJpegFile(input.file as File);
            if (decoded) {
              rasterSource = decoded;
            } else if (opts.fallbackToOriginal) {
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
                  info(
                    "warn",
                    `"${input.name}" could not be decoded in-browser (HEIC/HEIF). Uploading original instead.`,
                    "heic_decode_missing_or_failed",
                  ),
                ],
                removeFromQueue: false,
              };
            } else {
              return {
                artifacts: [],
                info: [
                  info(
                    "warn",
                    `HEIC/HEIF decode unavailable for "${input.name}".`,
                    "heic_decode_missing_or_failed",
                  ),
                ],
                removeFromQueue: false,
              };
            }
          } else if (tiffLike) {
            const decoded = await tryDecodeTiffToJpegFile(input.file as File);
            if (decoded) {
              rasterSource = decoded;
            } else if (opts.fallbackToOriginal) {
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
                  info(
                    "warn",
                    `"${input.name}" could not be decoded in-browser (TIFF). Uploading original instead.`,
                    "tiff_decode_missing_or_failed",
                  ),
                ],
                removeFromQueue: false,
              };
            } else {
              return {
                artifacts: [],
                info: [
                  info(
                    "warn",
                    `TIFF decode unavailable for "${input.name}".`,
                    "tiff_decode_missing_or_failed",
                  ),
                ],
                removeFromQueue: false,
              };
            }
          } else if (!shouldCompressToJpeg({ name: input.name, type: input.type })) {
            return { artifacts: [], info: [], removeFromQueue: false };
          }

          const imageCompression = await loadImageCompression();
          try {
            const compressed = await imageCompression(rasterSource, {
              maxSizeMB: opts.optimizedMaxSizeMB,
              maxWidthOrHeight: maxWH ?? 16384,
              useWebWorker: true,
              maxIteration: 12,
              fileType: "image/jpeg",
              initialQuality: q,
            });
            const jpegName = toJpegName(input.name);
            const jpegFile = new File([compressed], jpegName, {
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
          } catch (err) {
            log("warn", "JPEG optimize failed.", err);
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
                  info(
                    "warn",
                    `Could not optimize "${input.name}" in this browser. Uploading original.`,
                    "optimize_failed",
                  ),
                ],
                removeFromQueue: false,
              };
            }
            return {
              artifacts: [],
              info: [
                info(
                  "warn",
                  `Could not optimize "${input.name}" in this browser.`,
                  "optimize_failed",
                ),
              ],
              removeFromQueue: false,
            };
          }
        },
      },

      {
        id: "thumbnail-jpeg",
        when: () => {
          const isVideo = isVideoLike({ name: input.name, type: input.type });
          const isAudio = isAudioLike({ name: input.name, type: input.type });
          const ext = fileExtensionLower(input.name);
          const isSvg = input.type === "image/svg+xml" || ext === ".svg";
          return {
            run: opts.saveThumbnails && !isVideo && !isAudio && !isSvg,
          };
        },
        run: async () => {
          const rawImage = isCameraRawImage({ name: input.name, type: input.type });
          const heicLike = isHeicLike({ name: input.name, type: input.type });
          const tiffLike = isTiffLike({ name: input.name, type: input.type });

          let rasterSource: File = input.file as File;
          if (rawImage) {
            const decoded = await decodeCameraRawToJpegFile(input.file as File, {
              outFilename: `${stem(input.name)}.raw.jpg`,
              outputQuality: 0.98,
              debug: Boolean(opts.debug),
            });
            if (decoded) {
              rasterSource = decoded;
            } else {
              return { artifacts: [], info: [], removeFromQueue: false };
            }
          } else if (heicLike) {
            const decoded = await tryDecodeHeicToJpegFile(input.file as File);
            if (decoded) rasterSource = decoded;
            else return { artifacts: [], info: [], removeFromQueue: false };
          } else if (tiffLike) {
            const decoded = await tryDecodeTiffToJpegFile(input.file as File);
            if (decoded) rasterSource = decoded;
            else return { artifacts: [], info: [], removeFromQueue: false };
          } else if (!shouldCompressToJpeg({ name: input.name, type: input.type })) {
            return { artifacts: [], info: [], removeFromQueue: false };
          }

          const imageCompression = await loadImageCompression();
          try {
            const thumb = await imageCompression(rasterSource, {
              maxSizeMB: opts.thumbnailMaxSizeMB,
              maxWidthOrHeight: opts.thumbnailMaxEdge,
              useWebWorker: true,
              maxIteration: 10,
              fileType: "image/jpeg",
              initialQuality: 0.78,
            });
            const thumbName = toThumbName(input.name);
            const thumbFile = new File([thumb], thumbName, {
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
          } catch (err) {
            log("warn", "Thumbnail generation failed (ignored).", err);
            return { artifacts: [], info: [], removeFromQueue: false };
          }
        },
      },

      {
        id: "final-fallback-to-original",
        when: () => ({ run: opts.fallbackToOriginal && !opts.saveOriginal }),
        run: () => {
          // If user didn’t request original explicitly but no artifacts were produced,
          // keep the upload by emitting original bytes.
          // NOTE: because stages merge results, we can’t see “final count” here;
          // this stage acts as a safe default for non-transcodable media types.
          const ext = fileExtensionLower(input.name);
          const isSvg = input.type === "image/svg+xml" || ext === ".svg";
          const noTranscode =
            isVideoLike({ name: input.name, type: input.type }) ||
            isAudioLike({ name: input.name, type: input.type }) ||
            isSvg;

          if (!noTranscode) return { artifacts: [], info: [], removeFromQueue: false };
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
            info: [],
            removeFromQueue: false,
          };
        },
      },
    ],
  };

  const out = await runPipeline(input, def, { logger: log });

  // Global fallback: if nothing produced, optionally keep original.
  if (out.artifacts.length === 0 && opts.fallbackToOriginal) {
    out.artifacts.push({
      variant: "original",
      file: input.file,
      filename: input.name,
      filetype: input.type || "application/octet-stream",
      relativePath: input.relativePath,
    });
    out.info.push(
      info(
        "info",
        `Uploading "${input.name}" as original (no client-side processor available).`,
        "fallback_original",
      ),
    );
  }

  return out;
}
