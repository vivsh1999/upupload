import type { PipelineContext, PipelineDefinition, PipelineResult, PipelineSource } from "../core";
import { runPipeline } from "../core";
import type { PipelineStage } from "../core/types";
import {
  AUDIO_EXTENSIONS,
  fileExtensionLower,
  RAW_EXTENSIONS,
  VIDEO_EXTENSIONS,
} from "./allowlist";
import { info, resolvePipeline, stem } from "./pipeline-utils";
import type { BrowserPipelineOptions, PipelineDef } from "./pipeline-utils";
import type { FileClassification, ProcessingPlugin } from "../plugin/types";

export type { BrowserPipelineOptions, PipelineDef } from "./pipeline-utils";
export {
  DEFAULT_BROWSER_PIPELINE_OPTIONS,
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

export async function runDefaultBrowserPipeline(
  input: PipelineSource,
  pipelineOpts: BrowserPipelineOptions,
  extra?: {
    plugins?: ProcessingPlugin<any>[];
    pipeline?: PipelineDef[];
    signal?: AbortSignal;
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
    if (!pipelineOpts.debug) return;
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
    const stages = plugin.createStages(input, plugin.options, classif, ctx);
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
        when: () => ({ run: true }),
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

      ...pluginStages,
    ],
  };

  const out = await runPipeline(input, def, { logger: log, signal });

  // Filter out any artifact flagged with `skip: true`
  out.artifacts = out.artifacts.filter((a) => !a.skip);

  return out;
}
