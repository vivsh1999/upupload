import type { PipelineContext, PipelineDefinition, PipelineResult, PipelineSource } from "../core";
import { runPipeline } from "../core";
import type { PipelineStage } from "../core/types";
import {
  AUDIO_EXTENSIONS,
  fileExtensionLower,
  RAW_EXTENSIONS,
  VIDEO_EXTENSIONS,
} from "./allowlist";
import { DEFAULT_BROWSER_PIPELINE_OPTIONS, info, stem } from "./pipeline-utils";
import type { DefaultBrowserPipelineOptions } from "./pipeline-utils";
import type { FileClassification, ProcessingPlugin } from "../plugin/types";

export type { DefaultBrowserPipelineOptions } from "./pipeline-utils";
export { DEFAULT_BROWSER_PIPELINE_OPTIONS, toJpegName, toThumbName } from "./pipeline-utils";

export type DefaultBrowserPipelineVariant = "original" | "optimized" | "thumbnail";

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

export function preloadBrowserPipelineForFiles(
  files: Array<{ name: string; type?: string | null }>,
  opts: Pick<DefaultBrowserPipelineOptions, "saveOptimized" | "saveThumbnails">,
  extra?: { plugins?: ProcessingPlugin<DefaultBrowserPipelineOptions>[] },
) {
  if (!opts.saveOptimized && !opts.saveThumbnails) return;
  const plugins = extra?.plugins ?? [];
  const triggered = new Set<string>();
  for (const file of files) {
    for (const plugin of plugins) {
      if (!triggered.has(plugin.id) && plugin.supports(file) && plugin.preload) {
        triggered.add(plugin.id);
        plugin.preload();
      }
    }
  }
}

function topologicalSort(
  plugins: ProcessingPlugin<DefaultBrowserPipelineOptions>[],
): ProcessingPlugin<DefaultBrowserPipelineOptions>[] {
  const byId = new Map<string, ProcessingPlugin<DefaultBrowserPipelineOptions>>();
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();

  for (const p of plugins) {
    byId.set(p.id, p);
    if (!inDegree.has(p.id)) inDegree.set(p.id, 0);
    if (!adj.has(p.id)) adj.set(p.id, []);

    if (p.after) {
      for (const depId of p.after) {
        if (!adj.has(depId)) adj.set(depId, []);
        adj.get(depId)!.push(p.id);
        inDegree.set(p.id, (inDegree.get(p.id) ?? 0) + 1);
      }
    }

    if (p.before) {
      for (const depId of p.before) {
        adj.get(p.id)!.push(depId);
        if (!inDegree.has(depId)) inDegree.set(depId, 0);
        inDegree.set(depId, (inDegree.get(depId) ?? 0) + 1);
      }
    }
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  const sorted: ProcessingPlugin<DefaultBrowserPipelineOptions>[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    const plugin = byId.get(id);
    if (plugin) sorted.push(plugin);
    for (const next of adj.get(id) ?? []) {
      const deg = inDegree.get(next)! - 1;
      inDegree.set(next, deg);
      if (deg === 0) queue.push(next);
    }
  }

  return sorted;
}

export async function runDefaultBrowserPipeline(
  input: PipelineSource,
  opts: DefaultBrowserPipelineOptions,
  extra?: { plugins?: ProcessingPlugin<DefaultBrowserPipelineOptions>[]; signal?: AbortSignal },
): Promise<PipelineResult> {
  const plugins = extra?.plugins ?? [];
  const signal = extra?.signal;

  const log = (level: "debug" | "info" | "warn" | "error", message: string, extra?: unknown) => {
    if (!opts.debug) return;
    const prefix = `[@vivsh1999/upupload] ${input.name}`;
    const fn = console[level] ?? console.log;
    fn(prefix, message, extra ?? "");
  };

  const ext = fileExtensionLower(input.name);
  const mime = (input.type ?? "").toLowerCase();
  const stemName = stem(input.name);
  const isVideo = mime.startsWith("video/") || VIDEO_EXTENSIONS.has(ext);
  const isAudio = mime.startsWith("audio/") || AUDIO_EXTENSIONS.has(ext);
  const isSvg = mime === "image/svg+xml" || ext === ".svg";
  const size = input.file.size;
  const lastModified = input.file instanceof File ? input.file.lastModified : Date.now();

  const classif: FileClassification = {
    ext,
    mime,
    stemName,
    isVideo,
    isAudio,
    isSvg,
    size,
    lastModified,
  };

  const ctx: PipelineContext = { log, shared: new Map(), signal };

  const matchedPlugins = plugins.filter((p) => p.supports(input));

  const sorted = topologicalSort(matchedPlugins);

  const pluginStages: PipelineStage<PipelineSource, PipelineResult>[] = [];
  for (const plugin of sorted) {
    const stages = plugin.createStages(input, opts, classif, ctx);
    for (let i = 0; i < stages.length; i++) {
      pluginStages.push(stages[i]!);
    }
  }

  const def: PipelineDefinition<PipelineSource, PipelineResult> = {
    stages: [
      {
        id: "validate-allowlist",
        when: () => ({ run: true }),
        run: () => {
          if (mime.startsWith("video/") || mime.startsWith("audio/") || mime.startsWith("image/")) {
            // fast MIME path
          } else if (
            VIDEO_EXTENSIONS.has(ext) ||
            AUDIO_EXTENSIONS.has(ext) ||
            RAW_EXTENSIONS.has(ext) ||
            ext === ".svg"
          ) {
            // extension match
          } else if (mime !== "application/octet-stream") {
            log("warn", "Rejected (not in allowlist).", {
              name: input.name,
              type: input.type,
            });
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
        when: () => ({ run: opts.saveThumbnails && isVideo }),
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

      ...pluginStages,

      {
        id: "final-fallback-to-original",
        when: () => ({
          run: opts.fallbackToOriginal && !opts.saveOriginal,
        }),
        run: () => {
          const noTranscode = isVideo || isAudio || isSvg;
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

  const out = await runPipeline(input, def, { logger: log, signal });

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
