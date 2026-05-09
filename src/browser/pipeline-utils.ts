import type { PipelineInfoMessage, PipelineSource } from "../core/types";
import type { ProcessingPlugin } from "../plugin/types";
import { Plugin } from "../plugin/plugin";

// ---------------------------------------------------------------------------
// Generic shared-context keys
// ---------------------------------------------------------------------------

/**
 * Well-known shared context key for the "current working file".
 *
 * Every stage that processes a file should write its output to this key.
 * Downstream stages that need the most recently processed file read from it.
 * This allows plugins to chain generically without knowing each other's keys.
 *
 * @example
 * ```ts
 * // Upstream stage (e.g. raw-to-jpeg):
 * ctx.shared.set(PIPELINE_CURRENT_KEY, decodedFile);
 *
 * // Downstream stage (e.g. watermark):
 * const current = ctx.shared.get(PIPELINE_CURRENT_KEY) as File | undefined
 *   ?? input.file;
 * ```
 */
export const PIPELINE_CURRENT_KEY = "pipeline:current";

/**
 * Reserved shared context key for the file's {@link FileClassification}.
 *
 * The browser pipeline sets this before any plugin stages run, so that
 * stage `run()` functions can access the classification without capturing
 * it via closure in `createStages()`.
 *
 * @example
 * ```ts
 * const classif = ctx.shared.get(PIPELINE_CLASSIF_KEY) as FileClassification;
 * console.log(classif.stemName, classif.ext);
 * ```
 */
export const PIPELINE_CLASSIF_KEY = "pipeline:classif";

// ---------------------------------------------------------------------------
// Options type & defaults
// ---------------------------------------------------------------------------

export type BrowserPipelineOptions = {
  /** Enable debug logging to console. */
  debug?: boolean;
};

export const DEFAULT_BROWSER_PIPELINE_OPTIONS: BrowserPipelineOptions = {
  debug: false,
};

// ---------------------------------------------------------------------------
// Pipeline definition (per-type routing)
// ---------------------------------------------------------------------------

/**
 * A pipeline definition selects file types by a `supports()` classifier and
 * runs the given plugins against matching files. Use with
 * {@link runDefaultBrowserPipeline} to define per-type processing paths.
 *
 * @example
 * ```ts
 * const pipelines: PipelineDef[] = [
 *   {
 *     id: "raw-photo",
 *     supports: (f) => isCameraRawImage(f),
 *     plugins: [rawToJpeg, jpegCompressor.with({ quality: 80 })],
 *   },
 *   {
 *     id: "raster-photo",
 *     supports: (f) => isSupportedMediaUpload(f) && !isCameraRawImage(f),
 *     plugins: [jpegCompressor.with({ quality: 80 })],
 *   },
 *   {
 *     id: "video",
 *     supports: (f) => isVideoLike(f),
 *     plugins: [videoPoster],
 *   },
 * ];
 * ```
 */
/**
 * A reference to a plugin by ID, with optional overrides for its options.
 * Used inside {@link PipelineDef.plugins} to decouple plugin registration
 * from pipeline configuration.
 *
 * @example
 * ```ts
 * { id: "jpeg-compressor", opts: { variant: "client-proof", quality: 85 } }
 * ```
 */
export interface PluginRef {
  /** ID of the registered plugin to use. */
  id: string;
  /** Override options merged on top of the plugin's default options. */
  opts?: Record<string, unknown>;
  /**
   * Reference to the source plugin instance.
   * Set automatically by {@link PluginProvider} — avoids registry lookup.
   */
  defaults?: ProcessingPlugin<any>;
}

/**
 * A single entry in a pipeline's plugin list.
 * Can be a concrete plugin instance or a reference to one by ID.
 */
export type PipelinePlugin = ProcessingPlugin<any> | PluginRef;

export interface PipelineDef {
  /** Unique identifier for this pipeline (used in logs & debugging). */
  id: string;
  /**
   * Classifier — does this pipeline handle this file?
   * When omitted, the pipeline matches all files. File filtering is then
   * handled by each plugin's own `supports()` method.
   */
  supports?(file: PipelineSource): boolean;
  /**
   * Plugins to run for files matching this pipeline.
   * Each entry is either a concrete plugin instance or a reference
   * to a registered plugin by ID with optional option overrides.
   */
  plugins?: PipelinePlugin[];
  /**
   * Nested sub-pipelines for recursive routing.
   * When a pipeline matches and has sub-pipelines, the router descends
   * into them to find the deepest matching leaf.
   */
  pipelines?: PipelineDef[];
}

function isPluginInstance(p: PipelinePlugin): p is ProcessingPlugin<any> {
  return typeof (p as ProcessingPlugin<any>).supports === "function";
}

/**
 * Resolve an array of {@link PipelinePlugin} entries against a plugin
 * registry. Plugin references (`{ id, opts }`) are resolved to concrete
 * plugin instances with merged options; bare instances are returned as-is.
 */
export function resolvePluginRefs(
  plugins: PipelinePlugin[],
  registry?: ProcessingPlugin<any>[],
): ProcessingPlugin<any>[] {
  return plugins.map((p) => {
    if (isPluginInstance(p)) return p;

    const plugin = p.defaults ?? registry?.find((r) => r.id === p.id);
    if (!plugin) {
      throw new Error(
        `Plugin "${p.id}" referenced in pipeline but not found in the plugin registry. ` +
          "Make sure to pass it via the `plugins` option.",
      );
    }
    if (!p.opts || Object.keys(p.opts).length === 0) return plugin;
    if (plugin instanceof Plugin) return plugin.with(p.opts as any);
    return { ...plugin, options: { ...plugin.options, ...p.opts } };
  });
}

/**
 * Find the deepest matching leaf pipeline in a tree of PipelineDefs.
 * Returns the leaf pipeline and its resolved plugins.
 */
export function resolvePipeline(
  pipelines: PipelineDef[],
  file: PipelineSource,
  registry?: ProcessingPlugin<any>[],
): { def: PipelineDef; plugins: ProcessingPlugin<any>[] } | null {
  for (const def of pipelines) {
    if (def.supports && !def.supports(file)) continue;
    if (def.pipelines && def.pipelines.length > 0) {
      const child = resolvePipeline(def.pipelines, file, registry);
      if (child) return child;
    }
    const resolved = resolvePluginRefs(def.plugins ?? [], registry);
    return { def, plugins: resolved };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Filename helpers
// ---------------------------------------------------------------------------

export function stem(name: string) {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(0, i) : name;
}

/** Replace the extension of a filename with .jpg. */
export function toJpegName(originalName: string): string {
  return `${stem(originalName)}.jpg`;
}

/** Replace the extension with .thumb.jpg for thumbnail outputs. */
export function toThumbName(originalName: string): string {
  return `${stem(originalName)}.thumb.jpg`;
}

// ---------------------------------------------------------------------------
// Pipeline helpers
// ---------------------------------------------------------------------------

export function info(
  level: PipelineInfoMessage["level"],
  message: string,
  code?: string,
): PipelineInfoMessage {
  return { level, message, code };
}

// ---------------------------------------------------------------------------
// Pipeline validation
// ---------------------------------------------------------------------------

export interface ValidationError {
  path: string[];
  message: string;
}

function collectPipelineIds(defs: PipelineDef[], path: string[], ids: Map<string, string[]>): void {
  for (const def of defs) {
    const fullPath = [...path, def.id];
    const existing = ids.get(def.id);
    if (existing) {
      throw new Error(
        `Duplicate pipeline id "${def.id}" at [${fullPath.join(", ")}] ` +
          `— first defined at [${existing.join(", ")}]`,
      );
    }
    ids.set(def.id, fullPath);
    if (def.pipelines) {
      collectPipelineIds(def.pipelines, fullPath, ids);
    }
  }
}

/**
 * Validate an array of PipelineDefs for common configuration errors.
 * Throws on the first validation error found.
 *
 * Checks performed:
 * - No duplicate pipeline IDs at any level
 * - No pipelines with both `plugins` and `pipelines` empty (dead branches)
 * - Plugins array, when present, contains only valid entries
 */
export function validatePipeline(defs: PipelineDef[]): void {
  const ids = new Map<string, string[]>();
  collectPipelineIds(defs, [], ids);

  function walk(defs: PipelineDef[], path: string[]): void {
    for (const def of defs) {
      const fullPath = [...path, def.id];
      const hasPlugins = def.plugins !== undefined && def.plugins.length > 0;
      const hasChildren = def.pipelines !== undefined && def.pipelines.length > 0;

      if (!hasPlugins && !hasChildren) {
        throw new Error(
          `Pipeline "${def.id}" at [${fullPath.join(", ")}] has no plugins and no ` +
            `sub-pipelines — it will never produce output.`,
        );
      }

      if (def.plugins) {
        for (let i = 0; i < def.plugins.length; i++) {
          const p = def.plugins[i]!;
          if (!p) {
            throw new Error(
              `Pipeline "${def.id}" at [${fullPath.join(", ")}] has a null/undefined ` +
                `plugin at index ${i}.`,
            );
          }
        }
      }

      if (def.pipelines) {
        walk(def.pipelines, fullPath);
      }
    }
  }

  walk(defs, []);
}
