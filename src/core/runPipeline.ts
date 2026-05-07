import type {
  PipelineContext,
  PipelineDefinition,
  PipelineLogger,
  PipelineOptions,
  PipelineResult,
  PipelineSource,
  PipelineStage,
} from "./types";

function defaultLogger(): PipelineLogger {
  return () => {};
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function initialResult(): PipelineResult {
  return { artifacts: [], info: [], removeFromQueue: false };
}

function applyMiddleware<I, O>(
  stages: PipelineStage<I, O>[],
  middleware: NonNullable<PipelineDefinition<I, O>["middleware"]>,
): PipelineStage<I, O>[] {
  if (middleware.length === 0) return stages;
  return stages.map((stage, i) => {
    let wrapped = stage;
    for (const mw of middleware) {
      wrapped = mw(wrapped, i, stages);
    }
    return wrapped;
  });
}

export async function runPipeline(
  source: PipelineSource,
  def: PipelineDefinition<PipelineSource, PipelineResult>,
  options?: PipelineOptions,
): Promise<PipelineResult> {
  const log = options?.logger ?? defaultLogger();
  const shared = new Map<string, unknown>();
  const ctx: PipelineContext = {
    log,
    shared,
    signal: options?.signal,
  };

  const total = def.stages.length;
  const stages = def.middleware ? applyMiddleware(def.stages, def.middleware) : def.stages;

  let current = initialResult();

  for (let i = 0; i < stages.length; i++) {
    const stage = stages[i]!;

    if (options?.signal?.aborted) {
      log("debug", `Pipeline aborted at stage "${stage.id}"`);
      break;
    }

    const decision = await stage.when(source, ctx, current);
    if (!decision.run) {
      if (decision.reason) {
        log("debug", `Stage "${stage.id}" skipped: ${decision.reason}`, decision.code);
      }
      continue;
    }

    options?.onProgress?.({
      stageId: stage.id,
      stageIndex: i,
      totalStages: total,
      phase: "start",
    });

    let out: PipelineResult | null = null;
    let stageThrew = false;

    try {
      out = await stage.run(source, ctx);
    } catch (err) {
      stageThrew = true;

      if (options?.signal?.aborted) {
        log("debug", `Pipeline aborted during stage "${stage.id}"`);
        break;
      }

      options?.onProgress?.({
        stageId: stage.id,
        stageIndex: i,
        totalStages: total,
        phase: "end",
        error: err,
      });

      if (!stage.onError) throw err;
      const handled = await stage.onError(err, source, ctx);

      if (handled.action === "throw") throw err;

      if (handled.action === "retry") {
        let attempts = 0;
        let lastErr = err;
        let retryOk = false;
        while (attempts < handled.maxRetries) {
          try {
            if (handled.delayMs) await sleep(handled.delayMs);
            out = await stage.run(source, ctx);
            retryOk = true;
            break;
          } catch (retryErr) {
            attempts++;
            lastErr = retryErr;
          }
        }
        if (!retryOk) throw lastErr;
        if (handled.info) current.info.push(handled.info);
        // fall through to mergeResult below
      } else {
        if (handled.info) current.info.push(handled.info);
        if (handled.action === "skip") continue;
        if (handled.action === "fallback") {
          mergeResult(current, handled.value);
          continue;
        }
        continue; // unreachable
      }
    }

    if (!stageThrew || out !== null) {
      options?.onProgress?.({
        stageId: stage.id,
        stageIndex: i,
        totalStages: total,
        phase: "end",
      });
      mergeResult(current, out!);
    }
  }

  return current;
}

function mergeResult(acc: PipelineResult, out: PipelineResult): void {
  for (let i = 0; i < out.artifacts.length; i++) {
    acc.artifacts.push(out.artifacts[i]!);
  }
  for (let i = 0; i < out.info.length; i++) {
    acc.info.push(out.info[i]!);
  }
  if (out.removeFromQueue) acc.removeFromQueue = true;
}
