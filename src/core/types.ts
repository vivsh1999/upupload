export type PipelineVariant = string;

export type PipelineSource = {
  file: File | Blob;
  name: string;
  type: string;
  relativePath?: string;
};

export type PipelineArtifact = {
  variant: PipelineVariant;
  file: File | Blob;
  /** Basename for upload metadata `filename` (includes extension). */
  filename: string;
  /** MIME for upload metadata `filetype`. */
  filetype: string;
  relativePath?: string;
};

export type PipelineInfoMessage = {
  level: "info" | "warn";
  message: string;
  code?: string;
};

export type PipelineResult = {
  artifacts: PipelineArtifact[];
  info: PipelineInfoMessage[];
  /**
   * True when the source should be removed from the queue (e.g. junk files in
   * folder drops). False when we keep the row but it has no uploadable outputs.
   */
  removeFromQueue: boolean;
};

export type PipelineLogger = (
  level: "debug" | "info" | "warn" | "error",
  message: string,
  extra?: unknown,
) => void;

export type PipelineContext = {
  log: PipelineLogger;
};

export type StageDecision = { run: true } | { run: false; reason?: string; code?: string };

export type PipelineStage<I, O> = {
  id: string;
  when: (input: I, ctx: PipelineContext) => Promise<StageDecision> | StageDecision;
  run: (input: I, ctx: PipelineContext) => Promise<O> | O;
  onError?: (
    error: unknown,
    input: I,
    ctx: PipelineContext,
  ) =>
    | Promise<
        | { action: "throw" }
        | { action: "skip"; info?: PipelineInfoMessage }
        | { action: "fallback"; value: O; info?: PipelineInfoMessage }
      >
    | { action: "throw" }
    | { action: "skip"; info?: PipelineInfoMessage }
    | { action: "fallback"; value: O; info?: PipelineInfoMessage };
};

export type PipelineDefinition<I, O> = {
  stages: Array<PipelineStage<I, O>>;
};
