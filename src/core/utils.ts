import type {
  PipelineDefinition,
  PipelineResult,
  PipelineSource,
  PipelineStage,
  StageMiddleware,
} from "./types";

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
