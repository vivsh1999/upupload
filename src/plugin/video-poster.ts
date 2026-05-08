/** @module plugins/video-poster */
import type { PipelineContext, PipelineResult, PipelineSource, PipelineStage } from "../core/types";
import { fileExtensionLower, VIDEO_EXTENSIONS } from "../browser/allowlist";
import { stem } from "../browser/pipeline-utils";
import type { FileClassification, ProcessingPlugin } from "./types";

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
    const cctx = canvas.getContext("2d");
    if (!cctx) return null;
    cctx.drawImage(video, 0, 0, cw, ch);
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

export interface VideoPosterPluginOptions {
  /** Artifact variant name. Default: `"poster"`. */
  variant?: string;
  /** Maximum long edge of the poster image. Default: `640`. */
  maxEdge?: number;
}

/**
 * Create a plugin that extracts a poster frame from video files.
 * No external dependencies — uses the browser Canvas API.
 *
 * @param opts - Variant name and max edge.
 * @returns A {@link ProcessingPlugin} configured for video inputs.
 *
 * @example
 * ```ts
 * const posterPlugin = createVideoPosterPlugin({ variant: "poster", maxEdge: 640 });
 * ```
 */
export function createVideoPosterPlugin(
  opts?: VideoPosterPluginOptions,
): ProcessingPlugin<VideoPosterPluginOptions> {
  const options: VideoPosterPluginOptions = {
    variant: opts?.variant ?? "poster",
    maxEdge: opts?.maxEdge ?? 640,
  };

  return {
    id: "video-poster",
    name: "Video Poster Plugin",
    options,

    supports(file: { name: string; type?: string | null }) {
      const ext = fileExtensionLower(file.name);
      const mime = (file.type ?? "").toLowerCase();
      return mime.startsWith("video/") || VIDEO_EXTENSIONS.has(ext);
    },

    createStages(
      input: PipelineSource,
      pluginOpts: VideoPosterPluginOptions,
      _classif: FileClassification,
      _ctx: PipelineContext,
    ): PipelineStage<PipelineSource, PipelineResult>[] {
      return [
        {
          id: "extract-poster",
          when: () => ({ run: true }),
          run: async () => {
            const poster = await videoPosterFile(input.file as File, pluginOpts.maxEdge ?? 640);
            if (!poster) {
              return {
                artifacts: [],
                info: [
                  {
                    level: "warn",
                    message: `Could not generate a video poster for "${input.name}".`,
                    code: "poster_failed",
                  },
                ],
                removeFromQueue: false,
              };
            }
            return {
              artifacts: [
                {
                  variant: pluginOpts.variant ?? "poster",
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
      ];
    },
  };
}
