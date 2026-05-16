import type { PipelineInfoMessage, PipelineSource } from "../core/types";
import type { ProcessingPlugin } from "../plugin/types";
import { Plugin } from "../plugin/plugin";

// ---------------------------------------------------------------------------
// Generic shared-context keys
// ---------------------------------------------------------------------------

export { PIPELINE_CURRENT_KEY } from "../core/constants";

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

/**
 * Tuning options for browser pipeline execution.
 *
 * @example
 * ```ts
 * import { runDefaultBrowserPipeline } from "@vivsh1999/upupload/browser";
 *
 * await runDefaultBrowserPipeline(source, { debug: true });
 * ```
 */
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
 * import { fileExtensionLower, RAW_EXTENSIONS } from "@vivsh1999/upupload/browser";
 *
 * const pipelines: PipelineDef[] = [
 *   {
 *     id: "raw-photo",
 *     supports: (f) => RAW_EXTENSIONS.has(fileExtensionLower(f.name)),
 *     plugins: [rawToJpeg, jpegCompressor.with({ quality: 80 })],
 *   },
 *   {
 *     id: "raster-photo",
 *     supports: (f) => !RAW_EXTENSIONS.has(fileExtensionLower(f.name)),
 *     plugins: [jpegCompressor.with({ quality: 80 })],
 *   },
 *   {
 *     id: "video",
 *     // supports omitted — matches all files, videoPoster.supports() filters
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
const EMPTY_PLUGINS: PipelinePlugin[] = [];

export function resolvePluginRefs(
  plugins: PipelinePlugin[],
  registry?: ProcessingPlugin<any>[],
): ProcessingPlugin<any>[] {
  const count = plugins.length;
  const result = new Array<ProcessingPlugin<any>>(count);
  for (let i = 0; i < count; i++) {
    const p = plugins[i]!;
    if (isPluginInstance(p)) {
      result[i] = p;
      continue;
    }

    const plugin = p.defaults ?? registry?.find((r) => r.id === p.id);
    if (!plugin) {
      throw new Error(
        `Plugin "${p.id}" referenced in pipeline but not found in the plugin registry. ` +
          "Make sure to pass it via the `plugins` option.",
      );
    }
    if (!p.opts) {
      result[i] = plugin;
      continue;
    }
    let hasOpts = false;
    for (const _k in p.opts) {
      hasOpts = true;
      break;
    }
    if (!hasOpts) {
      result[i] = plugin;
      continue;
    }
    if (plugin instanceof Plugin) {
      result[i] = plugin.with(p.opts as any);
      continue;
    }
    result[i] = { ...plugin, options: { ...plugin.options, ...p.opts } };
  }
  return result;
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
    const resolved = resolvePluginRefs(def.plugins ?? EMPTY_PLUGINS, registry);
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
    path.push(def.id);
    const fullPath = [...path];
    const existing = ids.get(def.id);
    if (existing) {
      path.pop();
      throw new Error(
        `Duplicate pipeline id "${def.id}" at [${fullPath.join(", ")}] ` +
          `— first defined at [${existing.join(", ")}]`,
      );
    }
    ids.set(def.id, fullPath);
    if (def.pipelines) {
      collectPipelineIds(def.pipelines, path, ids);
    }
    path.pop();
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
      path.push(def.id);
      const hasPlugins = def.plugins !== undefined && def.plugins.length > 0;
      const hasChildren = def.pipelines !== undefined && def.pipelines.length > 0;

      if (!hasPlugins && !hasChildren) {
        const errorPath = path.join(", ");
        path.pop();
        throw new Error(
          `Pipeline "${def.id}" at [${errorPath}] has no plugins and no ` +
            `sub-pipelines — it will never produce output.`,
        );
      }

      if (def.plugins) {
        for (let i = 0; i < def.plugins.length; i++) {
          const p = def.plugins[i]!;
          if (!p) {
            const errorPath = path.join(", ");
            path.pop();
            throw new Error(
              `Pipeline "${def.id}" at [${errorPath}] has a null/undefined ` +
                `plugin at index ${i}.`,
            );
          }
        }
      }

      if (def.pipelines) {
        walk(def.pipelines, path);
      }
      path.pop();
    }
  }

  walk(defs, []);
}
