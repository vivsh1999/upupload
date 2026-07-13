import type {
  PipelineContext,
  PipelineDefinition,
  PipelineFactory,
  PipelineLogger,
  PipelineNode,
  PipelineOptions,
  PipelineResult,
  PipelineSource,
  PipelineStage,
  StageMiddleware,
} from "./types";
import { runPipeline } from "./runPipeline";

const NOOP_LOGGER: PipelineLogger = () => {};

/**
 * Compose multiple pipeline definitions into one.
 * Stages are concatenated in order; middleware arrays are merged.
 */
export function compose(
  ...defs: PipelineDefinition<PipelineSource, PipelineResult>[]
): PipelineDefinition<PipelineSource, PipelineResult> {
  const stages: PipelineStage<PipelineSource, PipelineResult>[] = [];
  const middleware: StageMiddleware[] = [];

  const defsLen = defs.length;
  for (let d = 0; d < defsLen; d++) {
    const def = defs[d]!;
    const stagesLen = def.stages.length;
    for (let i = 0; i < stagesLen; i++) {
      stages.push(def.stages[i]!);
    }
    if (def.middleware) {
      const mwLen = def.middleware.length;
      for (let i = 0; i < mwLen; i++) {
        middleware.push(def.middleware[i]!);
      }
    }
  }

  return { stages, ...(middleware.length > 0 ? { middleware } : {}) };
}

/**
 * Create a single-stage pipeline definition.
 *
 * Accepts either a full `PipelineStage` object, or shorthand `(id, run)`
 * that creates an unconditional stage (always runs).
 *
 * @example
 * // Shorthand — unconditional stage
 * stage("resize", async (input, ctx) => { ... })
 *
 * @example
 * // Full stage with guard
 * stage({ id: "resize", when: ..., run: ... })
 */
export function stage(
  s: PipelineStage<PipelineSource, PipelineResult>,
): PipelineDefinition<PipelineSource, PipelineResult>;
export function stage(
  id: string,
  run: PipelineStage<PipelineSource, PipelineResult>["run"],
): PipelineDefinition<PipelineSource, PipelineResult>;
export function stage(
  idOrStage: string | PipelineStage<PipelineSource, PipelineResult>,
  run?: PipelineStage<PipelineSource, PipelineResult>["run"],
): PipelineDefinition<PipelineSource, PipelineResult> {
  if (typeof idOrStage === "string") {
    return { stages: [{ id: idOrStage, run: run! }] };
  }
  return { stages: [idOrStage] };
}

/**
 * Type-safe read from a shared pipeline context map.
 */
export function sharedGet<T>(shared: Map<string, unknown>, key: string): T | undefined {
  return shared.get(key) as T | undefined;
}

/**
 * Type-safe write to a shared pipeline context map.
 */
export function sharedSet<T>(shared: Map<string, unknown>, key: string, value: T): void {
  shared.set(key, value);
}

/**
 * Create a timing middleware that logs stage duration.
 */
export function createTimingMiddleware(
  onTiming?: (id: string, ms: number) => void,
): StageMiddleware {
  return (stage) => {
    const originalRun = stage.run;
    return {
      ...stage,
      run: async (input, ctx) => {
        if (!onTiming && (!ctx.log || ctx.log === NOOP_LOGGER)) {
          return originalRun(input, ctx);
        }
        const start = performance.now();
        try {
          return await originalRun(input, ctx);
        } finally {
          const elapsed = performance.now() - start;
          if (ctx.log && ctx.log !== NOOP_LOGGER) {
            ctx.log("debug", `Stage "${stage.id}" took ${elapsed.toFixed(1)}ms`);
          }
          onTiming?.(stage.id, elapsed);
        }
      },
    };
  };
}

// ---------------------------------------------------------------------------
// Nestable Pipeline
// ---------------------------------------------------------------------------

function isPipelineNode(v: unknown): v is PipelineFactory {
  return typeof v === "function" && (v as PipelineFactory).__pipeline === true;
}

/**
 * Flatten a tree of pipeline nodes (stages and nested sub-pipelines) into
 * a flat stage array. Nested pipelines are inlined recursively.
 */
export function flattenPipeline(
  nodes: PipelineNode[],
  ctx: PipelineContext,
  source: PipelineSource,
  stages: PipelineStage<PipelineSource, PipelineResult>[] = [],
): PipelineStage<PipelineSource, PipelineResult>[] {
  const len = nodes.length;
  for (let i = 0; i < len; i++) {
    const node = nodes[i]!;
    if (isPipelineNode(node)) {
      const inner = node(ctx, source);
      flattenPipeline(inner, ctx, source, stages);
    } else {
      stages.push(node);
    }
  }
  return stages;
}

/**
 * Create a nestable pipeline factory. The callback receives pipeline context
 * and the source input, and returns an array of stages and/or nested
 * sub-pipelines.
 *
 * @example
 * ```ts
 * const videoPipeline = Pipeline((ctx, source) => [
 *   { id: "transcode", run: async (input, ctx) => { … } },
 * ]);
 *
 * const main = Pipeline((ctx, source) => [
 *   { id: "classify", … },
 *   ...(source.type?.startsWith("video/") ? videoPipeline(ctx, source) : []),
 * ]);
 * ```
 */
export function Pipeline(
  factory: (ctx: PipelineContext, source: PipelineSource) => PipelineNode[],
): PipelineFactory {
  (factory as PipelineFactory).__pipeline = true;
  return factory as PipelineFactory;
}

/**
 * Run a pipeline from a {@link Pipeline} factory. Creates the shared context,
 * flattens any nested sub-pipelines, and executes all stages in order.
 *
 * The same context object is passed to the factory (during flatten) and to
 * every stage (during execution), so factories can pre-populate shared state.
 */
export async function runPipelineFrom(
  source: PipelineSource,
  factory: PipelineFactory,
  options?: PipelineOptions,
): Promise<PipelineResult> {
  const log = options?.logger ?? NOOP_LOGGER;
  const ctx: PipelineContext = {
    log,
    shared: new Map<string, unknown>(),
    ...(options?.signal ? { signal: options.signal } : {}),
  };

  const nodes = factory(ctx, source);
  const stages = flattenPipeline(nodes, ctx, source);
  const def: PipelineDefinition<PipelineSource, PipelineResult> = { stages };

  return runPipeline(source, def, { ...options, ctx });
}
