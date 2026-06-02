import type { PipelineContext, PipelineDefinition, PipelineResult, PipelineSource } from "../core";
import { runPipeline } from "../core";
import type { PipelineStage } from "../core/types";
import {
  AUDIO_EXTENSIONS,
  fileExtensionLower,
  RAW_EXTENSIONS,
  VIDEO_EXTENSIONS,
} from "./allowlist";
import {
  info,
  isLevelEnabled,
  PIPELINE_CURRENT_KEY,
  PIPELINE_CLASSIF_KEY,
  resolvePipeline,
  stem,
} from "./pipeline-utils";
import type { LogLevel } from "./pipeline-utils";
import type { BrowserPipelineOptions, PipelineDef } from "./pipeline-utils";
import type { FileClassification, ProcessingPlugin } from "../plugin/types";

export type { BrowserPipelineOptions, LogLevel, PipelineDef } from "./pipeline-utils";
export {
  DEFAULT_BROWSER_PIPELINE_OPTIONS,
  PIPELINE_CURRENT_KEY,
  resolvePipeline,
  toJpegName,
  toThumbName,
} from "./pipeline-utils";

function topologicalSort(plugins: ProcessingPlugin<any>[]): ProcessingPlugin<any>[] {
  const byId = new Map<string, ProcessingPlugin<any>>();
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

  // Cycle detection via DFS
  const WHITE = 0,
    GRAY = 1,
    BLACK = 2;
  const color = new Map<string, number>();
  const parent = new Map<string, string | null>();
  for (const id of byId.keys()) color.set(id, WHITE);

  function dfs(u: string): string | null {
    color.set(u, GRAY);
    for (const v of adj.get(u) ?? []) {
      if (!color.has(v)) color.set(v, WHITE);
      if (color.get(v) === GRAY) {
        return v; // found cycle back edge
      }
      if (color.get(v) === WHITE) {
        parent.set(v, u);
        const cycle = dfs(v);
        if (cycle) return cycle;
      }
    }
    color.set(u, BLACK);
    return null;
  }

  for (const id of byId.keys()) {
    if (color.get(id) === WHITE) {
      const cycle = dfs(id);
      if (cycle) {
        // Reconstruct the cycle path
        const path: string[] = [cycle];
        let cur = parent.get(cycle);
        while (cur && cur !== cycle) {
          path.push(cur);
          cur = parent.get(cur);
        }
        path.reverse();
        throw new Error(
          `Cycle detected in plugin ordering: ${path.join(" → ")}. ` +
            "Check your plugins' `after` and `before` declarations.",
        );
      }
    }
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  const sorted: ProcessingPlugin<any>[] = [];
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

/**
 * Check an array of resolved plugin instances for duplicate stage IDs.
 * Throws if two plugins would produce stages with the same ID.
 */
function checkDuplicateStageIds(plugins: ProcessingPlugin<any>[]): void {
  // We can't fully predict stage IDs without calling createStages, but we can
  // detect cases where two plugins share the same id (common with .with() clones).
  const seen = new Map<string, string>();
  for (const p of plugins) {
    if (seen.has(p.id)) {
      const first = seen.get(p.id)!;
      throw new Error(
        `Duplicate plugin id "${p.id}" — both "${first}" and "${p.name}" produce the same ` +
          `stage prefix. Use .with({...}, { instanceId: "unique-name" }) to disambiguate.`,
      );
    }
    seen.set(p.id, p.name);
  }
}

export async function runDefaultBrowserPipeline(
  input: PipelineSource,
  pipelineOpts: BrowserPipelineOptions,
  extra?: {
    plugins?: ProcessingPlugin<any>[];
    pipeline?: PipelineDef[];
    signal?: AbortSignal;
    onStageProgress?: (stageId: string, progress: number) => void;
    onPauseCheck?: () => Promise<void>;
    pipelineContextMeta?: Record<string, unknown>;
    onProgress?: (event: import("../core/types").PipelineProgressEvent) => void;
  },
): Promise<PipelineResult> {
  // If pipeline definitions are provided, use the first matching one;
  // otherwise fall back to the flat `plugins` array.
  const signal = extra?.signal;

  let plugins: ProcessingPlugin<any>[];
  if (extra?.pipeline) {
    const resolved = resolvePipeline(extra.pipeline, input, extra.plugins);
    if (!resolved) {
      return {
        artifacts: [],
        info: [info("warn", `No matching pipeline definition for "${input.name}".`, "no_pipeline")],
        removeFromQueue: true,
      };
    }
    plugins = resolved.plugins;
  } else {
    plugins = extra?.plugins ?? [];
  }

  const log = (level: "debug" | "info" | "warn" | "error", message: string, extra?: unknown) => {
    const configured: LogLevel = pipelineOpts.logLevel ?? "silent";
    if (!isLevelEnabled(configured, level)) return;
    const prefix = `[@vivsh1999/upupload] ${input.name}`;
    const fn = console[level] ?? console.log;
    fn(prefix, message, extra ?? "");
  };

  // Normalize: prefer source.type over file.type, warn on mismatch
  if (
    input.type &&
    input.file.type &&
    input.type !== input.file.type &&
    input.type.toLowerCase() !== input.file.type.toLowerCase()
  ) {
    log(
      "warn",
      `source.type ("${input.type}") differs from file.type ("${input.file.type}") — preferring source.type.`,
      {
        name: input.name,
      },
    );
  }

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
  if (extra?.pipelineContextMeta) {
    for (const [key, val] of Object.entries(extra.pipelineContextMeta)) {
      ctx.shared.set(key, val);
    }
  }
  ctx.shared.set(PIPELINE_CLASSIF_KEY, classif);

  const matchedPlugins = plugins.filter((p) => p.supports({ ...input, size: input.file.size }));
  checkDuplicateStageIds(matchedPlugins);
  const sorted = topologicalSort(matchedPlugins);

  const pluginStages: PipelineStage<PipelineSource, PipelineResult>[] = [];
  for (const plugin of sorted) {
    const stages = plugin.createStages(input, plugin.options, classif, ctx);
    for (let i = 0; i < stages.length; i++) {
      pluginStages.push(stages[i]!);
    }
  }

  const def: PipelineDefinition<PipelineSource, PipelineResult> = {
    stages: [
      {
        id: "validate-allowlist",
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

      // Always include the original file as an artifact.
      // Users who don't want it can filter it from the result.
      {
        id: "original",
        run: () => {
          ctx.shared.set(PIPELINE_CURRENT_KEY, input.file);
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

      ...pluginStages,
    ],
  };

  const out = await runPipeline(input, def, {
    logger: log,
    signal,
    onStageProgress: extra?.onStageProgress,
    onPauseCheck: extra?.onPauseCheck,
    onProgress: extra?.onProgress,
  });

  // Filter out any artifact flagged with `skip: true`
  out.artifacts = out.artifacts.filter((a) => !a.skip);

  return out;
}
