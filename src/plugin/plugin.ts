/** @module plugins */
import type { FileClassification, ProcessingPlugin } from "./types";
import type { PipelineContext, PipelineResult, PipelineSource, PipelineStage } from "../core/types";

/**
 * A processing plugin that contributes pipeline stages for specific file types.
 *
 * This is the single canonical way to create plugins — replaces both
 * `definePlugin()` and ad-hoc factory functions.
 *
 * @typeParam TOpts - The shape of plugin options.
 *
 * @example
 * ```ts
 * const watermark = new Plugin<{ opacity: number }>({
 *   id: "watermark",
 *   options: { opacity: 0.5 },
 *   supports: (file) => file.type?.startsWith("image/") ?? false,
 *   run: async (input, opts, classif, ctx) => {
 *     // opts.opacity is typed
 *     return emptyResult();
 *   },
 * });
 * ```
 */
export class Plugin<TOpts = Record<string, unknown>> implements ProcessingPlugin<TOpts> {
  readonly id: string;
  readonly name: string;
  readonly options: TOpts;
  readonly sharedKeys: Readonly<Record<string, string>>;
  readonly after?: string[];
  readonly before?: string[];

  private _supports: ProcessingPlugin<TOpts>["supports"];
  private _createStages?: ProcessingPlugin<TOpts>["createStages"];
  private _runFn?: (
    input: PipelineSource,
    opts: TOpts,
    classif: FileClassification,
    ctx: PipelineContext,
  ) => Promise<PipelineResult> | PipelineResult;
  private _preload?: ProcessingPlugin<TOpts>["preload"];

  constructor(config: {
    /** Unique plugin ID (kebab-case recommended). */
    id: string;
    /** Human-readable name for logs. Defaults to `id`. */
    name?: string;
    /** Plugin's typed configuration. */
    options: TOpts;
    /** Quick classifier — does this plugin handle this file? */
    supports: ProcessingPlugin<TOpts>["supports"];
    /**
     * Return pipeline stages for this file.
     * When not provided, a single stage is created from `run` using `id` as the stage ID.
     */
    createStages?: ProcessingPlugin<TOpts>["createStages"];
    /**
     * Single-stage shorthand. When provided without `createStages`, the plugin auto-wraps
     * this function into `[{ id, run: (input, ctx) => this.run(input, opts, classif, ctx) }]`.
     * The function receives the same arguments as `ProcessingPlugin.createStages` but
     * returns a single `PipelineResult` instead of an array of stages.
     */
    run?: (
      input: PipelineSource,
      opts: TOpts,
      classif: FileClassification,
      ctx: PipelineContext,
    ) => Promise<PipelineResult> | PipelineResult;
    /** Shared context keys this plugin writes to. */
    sharedKeys?: Record<string, string>;
    /** IDs of plugins whose stages must run before this plugin's stages. */
    after?: string[];
    /** IDs of plugins whose stages must run after this plugin's stages. */
    before?: string[];
    /** Pre-warm decoders / WASM / etc. */
    preload?: ProcessingPlugin<TOpts>["preload"];
  }) {
    this.id = config.id;
    this.name = config.name ?? config.id;
    this.options = config.options;
    this.sharedKeys = config.sharedKeys ?? {};
    this.after = config.after;
    this.before = config.before;
    this._supports = config.supports;
    this._preload = config.preload;

    if (config.createStages) {
      this._createStages = config.createStages;
      this._runFn = undefined;
    } else if (config.run) {
      this._createStages = undefined;
      this._runFn = config.run;
    } else {
      throw new Error(
        `Plugin "${config.id}" requires either \`createStages\` or \`run\` in its config.`,
      );
    }
  }

  supports(file: { name: string; type?: string | null }): boolean {
    return this._supports(file);
  }

  createStages(
    input: PipelineSource,
    opts: TOpts,
    classif: FileClassification,
    ctx: PipelineContext,
  ): PipelineStage<PipelineSource, PipelineResult>[] {
    if (this._runFn) {
      const fn = this._runFn;
      return [{ id: this.id, run: async () => fn(input, opts, classif, ctx) }];
    }
    // Both _runFn and _createStages can't be undefined — constructor enforces this
    return this._createStages!(input, opts, classif, ctx);
  }

  /**
   * Create a new plugin instance with partially overridden options.
   *
   * When `instanceId` is provided, the new instance uses `"${id}:${instanceId}"` as its
   * stage ID, making it uniquely identifiable in multi-instance setups.
   *
   * @example
   * ```ts
   * const display = watermarkPlugin.with({ opacity: 0.5 });
   * const thumbnail = watermarkPlugin.with({ opacity: 0.3, position: "center" });
   * const mp3 = audioEncoderPlugin.with({ variant: "mp3" }, { instanceId: "mp3" });
   * ```
   */
  with(overrides: Partial<TOpts>, options?: { instanceId?: string }): Plugin<TOpts> {
    const instanceId = options?.instanceId;
    const merged = { ...this.options, ...overrides };
    const newId = instanceId ? `${this.id}:${instanceId}` : this.id;
    const newName = instanceId ? `${this.name} (${instanceId})` : this.name;

    return new Plugin<TOpts>({
      id: newId as any,
      name: newName,
      options: merged,
      supports: this._supports,
      createStages: this._createStages,
      run: this._runFn,
      sharedKeys: { ...this.sharedKeys },
      after: this.after,
      before: this.before,
      preload: this._preload,
    });
  }

  preload(): void {
    this._preload?.();
  }
}
