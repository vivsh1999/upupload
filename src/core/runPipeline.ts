import type {
  PipelineContext,
  PipelineDefinition,
  PipelineInfoMessage,
  PipelineLogger,
  PipelineResult,
  PipelineSource,
} from "./types";

function defaultLogger(): PipelineLogger {
  return () => {};
}

export async function runPipeline(
  source: PipelineSource,
  def: PipelineDefinition<PipelineSource, PipelineResult>,
  options?: { logger?: PipelineLogger },
): Promise<PipelineResult> {
  const log = options?.logger ?? defaultLogger();
  const ctx: PipelineContext = { log };

  let result: PipelineResult = { artifacts: [], info: [], removeFromQueue: false };

  for (const stage of def.stages) {
    const decision = await stage.when(source, ctx);
    if (!decision.run) {
      if (decision.reason) {
        log("debug", `Stage "${stage.id}" skipped: ${decision.reason}`, decision.code);
      }
      continue;
    }

    try {
      const out = await stage.run(source, ctx);
      result = mergePipelineResults(result, out);
    } catch (err) {
      if (!stage.onError) throw err;
      const handled = await stage.onError(err, source, ctx);
      if (handled.action === "throw") throw err;
      if (handled.info) result.info.push(handled.info);
      if (handled.action === "skip") continue;
      if (handled.action === "fallback") {
        result = mergePipelineResults(result, handled.value);
      }
    }
  }

  return result;
}

function mergePipelineResults(a: PipelineResult, b: PipelineResult): PipelineResult {
  const info: PipelineInfoMessage[] = [...a.info, ...b.info];
  return {
    artifacts: [...a.artifacts, ...b.artifacts],
    info,
    removeFromQueue: a.removeFromQueue || b.removeFromQueue,
  };
}
