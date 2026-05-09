/** @module plugins/video-poster */
import { fileExtensionLower, VIDEO_EXTENSIONS } from "../browser/allowlist";
import { stem } from "../browser/pipeline-utils";
import { Plugin } from "./plugin";
import { warning, artifact } from "../core/result";
import { PIPELINE_CURRENT_KEY } from "../browser/pipeline-utils";

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
  variant?: string;
  maxEdge?: number;
}

/**
 * Video poster frame extractor — base instance with defaults.
 *
 * @example
 * ```ts
 * videoPoster                                          // poster at 640px
 * videoPoster.with({ variant: "thumb", maxEdge: 320 }) // smaller variant
 * ```
 */
export const videoPoster: Plugin<VideoPosterPluginOptions> = new Plugin<VideoPosterPluginOptions>({
  id: "video-poster",
  name: "Video Poster Plugin",
  options: { variant: "poster", maxEdge: 640 },
  supports: (file) => {
    const ext = fileExtensionLower(file.name);
    const mime = (file.type ?? "").toLowerCase();
    return mime.startsWith("video/") || VIDEO_EXTENSIONS.has(ext);
  },
  run: async (input, pluginOpts, _classif, ctx) => {
    // Follow the pipeline:current convention so downstream plugins can chain
    const sourceFile = (ctx.shared.get(PIPELINE_CURRENT_KEY) as File | undefined) ?? input.file;
    const poster = await videoPosterFile(sourceFile as File, pluginOpts.maxEdge ?? 640);
    if (!poster) {
      return {
        artifacts: [],
        info: [warning(`Could not generate a video poster for "${input.name}".`, "poster_failed")],
        removeFromQueue: false,
      };
    }
    ctx.shared.set(PIPELINE_CURRENT_KEY, poster);
    return {
      artifacts: [
        artifact(
          pluginOpts.variant ?? "poster",
          poster,
          poster.name,
          poster.type || "application/octet-stream",
          { relativePath: input.relativePath },
        ),
      ],
      info: [],
      removeFromQueue: false,
    };
  },
});

/** @deprecated Use `videoPoster.with(opts)` instead. */
export function createVideoPosterPlugin(
  opts?: VideoPosterPluginOptions,
): Plugin<VideoPosterPluginOptions> {
  return videoPoster.with(opts ?? {});
}
