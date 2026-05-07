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
};
