import type {
  PipelineContext,
  PipelineDefinition,
  PipelineLogger,
  PipelineOptions,
  PipelineResult,
  PipelineSource,
  PipelineStage,
} from "./types";

const NOOP_LOGGER: PipelineLogger = () => {};
const ALWAYS_RUN_DECISION = { run: true } as const;
const ALWAYS_RUN = () => ALWAYS_RUN_DECISION;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function initialResult(): PipelineResult {
  return { artifacts: [], info: [], removeFromQueue: false };
}

function normalizeSkipGroups(v: string | string[] | undefined): Set<string> {
  if (!v) return new Set();
  if (typeof v === "string") return new Set([v]);
  return new Set(v);
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

function mergeResult(acc: PipelineResult, out: PipelineResult): void {
  for (let i = 0; i < out.artifacts.length; i++) {
    acc.artifacts.push(out.artifacts[i]!);
  }
  for (let i = 0; i < out.info.length; i++) {
    acc.info.push(out.info[i]!);
  }
  if (out.removeFromQueue) acc.removeFromQueue = true;
  if (out.skipRemaining) acc.skipRemaining = true;
  if (out.skipGroup) {
    const groups = normalizeSkipGroups(out.skipGroup);
    if (!acc.skipGroup) acc.skipGroup = [];
    const existing = normalizeSkipGroups(acc.skipGroup);
    for (const g of groups) existing.add(g);
    acc.skipGroup = [...existing];
  }
}

async function executeStage<I extends PipelineSource, O extends PipelineResult>(
  stage: PipelineStage<I, O>,
  source: I,
  ctx: PipelineContext,
  log: PipelineLogger,
  startIndex: number,
  totalStages: number,
  options: PipelineOptions | undefined,
  current?: PipelineResult,
): Promise<{ result: O; skipped: boolean }> {
  const guard = stage.when ?? ALWAYS_RUN;
  const decision = await guard(source, ctx, (current ?? initialResult()) as O);
  if (!decision.run) {
    if (decision.reason) {
      log("debug", `Stage "${stage.id}" skipped: ${decision.reason}`, decision.code);
    }
    return { result: initialResult() as O, skipped: true };
  }

  options?.onProgress?.({
    stageId: stage.id,
    stageIndex: startIndex,
    totalStages,
    phase: "start",
  });

  let out: O | null = null;
  let stageThrew = false;

  try {
    out = await stage.run(source, ctx);
  } catch (err) {
    stageThrew = true;

    if (options?.signal?.aborted) {
      log("debug", `Pipeline aborted during stage "${stage.id}"`);
      return { result: initialResult() as O, skipped: false };
    }

    options?.onProgress?.({
      stageId: stage.id,
      stageIndex: startIndex,
      totalStages,
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
      if (handled.info) {
        const r = initialResult() as O;
        r.info.push(handled.info);
        return { result: r, skipped: false };
      }
    } else {
      const r = initialResult() as O;
      if (handled.info) r.info.push(handled.info);
      if (handled.action === "skip") return { result: r, skipped: false };
      if (handled.action === "fallback") {
        const fb = handled.value;
        if (handled.info) fb.info.push(handled.info);
        return { result: fb, skipped: false };
      }
      return { result: r, skipped: false };
    }
  }

  if (!stageThrew || out !== null) {
    options?.onProgress?.({
      stageId: stage.id,
      stageIndex: startIndex,
      totalStages,
      phase: "end",
    });
    return { result: out!, skipped: false };
  }

  return { result: initialResult() as O, skipped: false };
}

export async function runPipeline(
  source: PipelineSource,
  def: PipelineDefinition<PipelineSource, PipelineResult>,
  options?: PipelineOptions,
): Promise<PipelineResult> {
  const log = options?.logger ?? NOOP_LOGGER;
  const ctx: PipelineContext = options?.ctx ?? {
    log,
    shared: new Map<string, unknown>(),
    signal: options?.signal,
  };

  const total = def.stages.length;
  const stages = def.middleware ? applyMiddleware(def.stages, def.middleware) : def.stages;

  // Validate dependencies (lazy — only build Set when a stage declares dependsOn)
  let stageIds: Set<string> | undefined;
  for (const stage of stages) {
    if (stage.dependsOn) {
      if (!stageIds) {
        stageIds = new Set<string>();
        for (const s of stages) stageIds.add(s.id);
      }
      for (const depId of stage.dependsOn) {
        if (!stageIds.has(depId)) {
          throw new Error(
            `Stage "${stage.id}" depends on "${depId}" which does not exist in the pipeline`,
          );
        }
      }
    }
  }

  const current = initialResult();
  const completed = new Set<string>();
  const skippedGroups = new Set<string>();

  let i = 0;
  while (i < stages.length) {
    if (options?.signal?.aborted) {
      log("debug", "Pipeline aborted");
      break;
    }

    const stage = stages[i]!;

    // 1. If a previous stage signaled removeFromQueue, skip remaining
    if (current.removeFromQueue) {
      log("debug", `Skipping stage "${stage.id}" (removeFromQueue signaled)`);
      i++;
      continue;
    }

    // 2. If skipRemaining is set, stop entirely
    if (current.skipRemaining) break;

    // 3. If this stage's group is in the skip set, skip it
    if (stage.group && skippedGroups.has(stage.group)) {
      log("debug", `Skipping stage "${stage.id}" (group "${stage.group}" skipped)`);
      i++;
      continue;
    }

    // 4. Check dependencies
    if (stage.dependsOn) {
      let depsMet = true;
      for (const depId of stage.dependsOn) {
        if (!completed.has(depId)) {
          depsMet = false;
          break;
        }
      }
      if (!depsMet) {
        log("warn", `Stage "${stage.id}" dependencies not met (${stage.dependsOn.join(", ")})`);
        throw new Error(
          `Stage "${stage.id}" depends on "${stage.dependsOn.join('", "')}" which have not completed`,
        );
      }
    }

    // 5. Collect parallel batch
    if (stage.parallel) {
      const batch: PipelineStage<PipelineSource, PipelineResult>[] = [];
      const batchStartIndex = i;
      while (i < stages.length && stages[i]?.parallel) {
        // Check skip conditions for each stage in the batch
        const s = stages[i]!;
        if (
          !current.removeFromQueue &&
          !current.skipRemaining &&
          !(s.group && skippedGroups.has(s.group))
        ) {
          batch.push(s);
        }
        i++;
      }

      if (batch.length > 0) {
        const results = await Promise.all(
          batch.map((s) =>
            executeStage(s, source, ctx, log, batchStartIndex, total, options, current),
          ),
        );

        for (const { result, skipped } of results) {
          if (!skipped) mergeResult(current, result);
          if (result.skipGroup) {
            const groups = normalizeSkipGroups(result.skipGroup);
            for (const g of groups) skippedGroups.add(g);
          }
        }

        for (const s of batch) {
          completed.add(s.id);
        }
      }
    } else {
      // 6. Run single stage
      const { result, skipped } = await executeStage(
        stage,
        source,
        ctx,
        log,
        i,
        total,
        options,
        current,
      );
      i++;

      if (!skipped) mergeResult(current, result);
      completed.add(stage.id);

      // Track skipped groups from this stage's result
      if (result.skipGroup) {
        const groups = normalizeSkipGroups(result.skipGroup);
        for (const g of groups) skippedGroups.add(g);
      }
    }
  }

  return current;
}
