import type {
  PipelineContext,
  PipelineDefinition,
  PipelineFactory,
  PipelineNode,
  PipelineOptions,
  PipelineResult,
  PipelineSource,
  PipelineStage,
  StageMiddleware,
} from "./types";
import { runPipeline } from "./runPipeline";

/**
 * Compose multiple pipeline definitions into one.
 * Stages are concatenated in order; middleware arrays are merged.
 */
export function compose(
  ...defs: PipelineDefinition<PipelineSource, PipelineResult>[]
): PipelineDefinition<PipelineSource, PipelineResult> {
  const stages: PipelineStage<PipelineSource, PipelineResult>[] = [];
  const middleware: StageMiddleware[] = [];

  for (const def of defs) {
    for (let i = 0; i < def.stages.length; i++) {
      stages.push(def.stages[i]!);
    }
    if (def.middleware) {
      for (let i = 0; i < def.middleware.length; i++) {
        middleware.push(def.middleware[i]!);
      }
    }
  }

  return { stages, middleware: middleware.length > 0 ? middleware : undefined };
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
    return { stages: [{ id: idOrStage, when: () => ({ run: true }), run: run! }] };
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
        const start = performance.now();
        try {
          return await originalRun(input, ctx);
        } finally {
          const elapsed = performance.now() - start;
          ctx.log("debug", `Stage "${stage.id}" took ${elapsed.toFixed(1)}ms`);
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
): PipelineStage<PipelineSource, PipelineResult>[] {
  const stages: PipelineStage<PipelineSource, PipelineResult>[] = [];
  for (const node of nodes) {
    if (isPipelineNode(node)) {
      const inner = node(ctx, source);
      stages.push(...flattenPipeline(inner, ctx, source));
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
 *   { id: "transcode", when: () => ({ run: true }), run: async (input, ctx) => { … } },
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
  const fn = ((ctx: PipelineContext, source: PipelineSource) =>
    factory(ctx, source)) as PipelineFactory;
  fn.__pipeline = true;
  return fn;
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
  const log = options?.logger ?? (() => {});
  const ctx: PipelineContext = {
    log,
    shared: new Map<string, unknown>(),
    signal: options?.signal,
  };

  const nodes = factory(ctx, source);
  const stages = flattenPipeline(nodes, ctx, source);
  const def: PipelineDefinition<PipelineSource, PipelineResult> = { stages };

  return runPipeline(source, def, { ...options, ctx });
}
