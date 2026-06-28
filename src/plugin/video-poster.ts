/** @module plugins/video-poster */
import { fileExtensionLower, VIDEO_EXTENSIONS } from "../browser/allowlist";
import { PIPELINE_CURRENT_KEY } from "../core/constants";
import { Plugin } from "./plugin";
import { warning, artifact } from "../core/result";

async function videoPosterFile(
  source: File,
  maxEdge: number,
  stemName: string,
): Promise<File | null> {
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
    return new File([blob], `${stemName}.poster.jpg`, {
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
  /** When true, emit the poster as a direct artifact. Default: true. */
  produceArtifact?: boolean;
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
  run: async (input, pluginOpts, classif, ctx) => {
    // Follow the pipeline:current convention so downstream plugins can chain
    const sourceFile = (ctx.shared.get(PIPELINE_CURRENT_KEY) as File | undefined) ?? input.file;
    const poster = await videoPosterFile(
      sourceFile as File,
      pluginOpts.maxEdge ?? 640,
      classif.stemName,
    );
    if (!poster) {
      return {
        artifacts: [],
        info: [warning(`Could not generate a video poster for "${input.name}".`, "poster_failed")],
        removeFromQueue: false,
      };
    }
    ctx.shared.set(PIPELINE_CURRENT_KEY, poster);
    const produceArtifact = pluginOpts.produceArtifact !== false;
    return {
      artifacts: produceArtifact
        ? [
            artifact(
              pluginOpts.variant ?? "poster",
              poster,
              poster.name,
              poster.type || "application/octet-stream",
              input.relativePath !== undefined ? { relativePath: input.relativePath } : {},
            ),
          ]
        : [],
      info: [],
      removeFromQueue: false,
    };
  },
});
