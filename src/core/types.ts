/** A named output variant (e.g. "original", "optimized", "thumbnail"). */
export type PipelineVariant = string;

/** Input source fed into a pipeline — a file/blob with metadata. */
export type PipelineSource = {
  file: File | Blob;
  name: string;
  type: string;
  relativePath?: string;
};

/** A single output artifact produced by a pipeline stage. */
export type PipelineArtifact = {
  variant: PipelineVariant;
  file: File | Blob;
  filename: string;
  filetype: string;
  relativePath?: string;
  /**
   * When `true`, the pipeline will exclude this artifact from the final result.
   * Useful for plugin stages that produce intermediate artifacts that other
   * stages consume but that should not appear in the final output.
   */
  skip?: boolean;
};

/** Informational or warning message emitted during pipeline execution. */
export type PipelineInfoMessage = {
  level: "info" | "warn";
  message: string;
  code?: string;
};

/** Result produced by a completed pipeline run. */
export type PipelineResult = {
  artifacts: PipelineArtifact[];
  info: PipelineInfoMessage[];
  removeFromQueue: boolean;
  /**
   * Skip all unexecuted stages in the given group(s).
   * Set by a stage to conditionally skip a set of downstream stages.
   */
  skipGroup?: string | string[];
  /** Skip all remaining unexecuted stages in the pipeline. */
  skipRemaining?: boolean;
};

/** Logger function injected into pipeline context. */
export type PipelineLogger = (
  level: "debug" | "info" | "warn" | "error",
  message: string,
  extra?: unknown,
) => void;

/** Context object passed to every pipeline stage. */
export type PipelineContext = {
  log: PipelineLogger;
  shared: Map<string, unknown>;
  signal?: AbortSignal;
};

/** Decision returned by a stage's `when` guard. */
export type StageDecision = { run: true } | { run: false; reason?: string; code?: string };

/** Stage error handler actions. */
export type StageOnErrorAction<O> =
  | { action: "throw" }
  | { action: "skip"; info?: PipelineInfoMessage }
  | { action: "fallback"; value: O; info?: PipelineInfoMessage }
  | {
      action: "retry";
      maxRetries: number;
      delayMs?: number;
      info?: PipelineInfoMessage;
    };

/** A single processing stage in a pipeline definition. */
export type PipelineStage<I, O> = {
  id: string;

  /**
   * When `true`, this stage can run concurrently with adjacent parallel stages.
   * The engine groups consecutive `parallel: true` stages into a batch and
   * executes them with `Promise.all`. Stages within a parallel batch share
   * the same pipeline context.
   */
  parallel?: boolean;

  /**
   * IDs of stages that must successfully complete before this stage runs.
   * If a depended-on stage is skipped or fails, this stage will not run.
   */
  dependsOn?: string[];

  /**
   * Optional group name for conditional skipping.
   * If a previous stage returns `skipGroup` matching this group, this stage
   * is skipped. Groups are useful for partitioning stages into phases that
   * can be conditionally disabled.
   */
  group?: string;

  when: (input: I, ctx: PipelineContext, current: O) => Promise<StageDecision> | StageDecision;
  run: (input: I, ctx: PipelineContext) => Promise<O> | O;
  onError?: (
    error: unknown,
    input: I,
    ctx: PipelineContext,
  ) => Promise<StageOnErrorAction<O>> | StageOnErrorAction<O>;
};

/** A function that can wrap/modify a stage (middleware pattern). */
export type StageMiddleware = <I, O>(
  stage: PipelineStage<I, O>,
  index: number,
  stages: PipelineStage<I, O>[],
) => PipelineStage<I, O>;

/** Progress callback emitted by the pipeline engine. */
export type PipelineProgressEvent = {
  stageId: string;
  stageIndex: number;
  totalStages: number;
  phase: "start" | "end";
  error?: unknown;
};

/** Ordered list of stages forming a complete processing pipeline. */
export type PipelineDefinition<I, O> = {
  stages: Array<PipelineStage<I, O>>;
  middleware?: StageMiddleware[];
};

/** Options for the pipeline runner. */
export type PipelineOptions = {
  logger?: PipelineLogger;
  signal?: AbortSignal;
  onProgress?: (event: PipelineProgressEvent) => void;
  /**
   * External pipeline context to use instead of creating a new one.
   * Used internally by {@link runPipelineFrom} to share context
   * between Pipeline factory flattening and stage execution.
   */
  ctx?: PipelineContext;
};

// ---------------------------------------------------------------------------
// Pipeline factory (nestable pipeline builder)
// ---------------------------------------------------------------------------

/**
 * A factory function that, given pipeline context and the source input,
 * returns an array of pipeline nodes (stages or nested sub-pipelines).
 *
 * Created via {@link Pipeline}. Nest pipelines arbitrarily — sub-pipelines
 * are flattened into the parent at runtime.
 */
export type PipelineFactory = {
  (ctx: PipelineContext, source: PipelineSource): PipelineNode[];
  /** @internal Marker for flattening. */
  __pipeline?: true;
};

/** A node in a pipeline tree — either a stage or a nested sub-pipeline. */
export type PipelineNode = PipelineStage<PipelineSource, PipelineResult> | PipelineFactory;
