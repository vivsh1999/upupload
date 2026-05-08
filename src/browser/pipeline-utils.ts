import type { PipelineInfoMessage, PipelineSource } from "../core/types";
import type { ProcessingPlugin } from "../plugin/types";

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
 *     plugins: [createRawToJpegPlugin(), createJpegCompressorPlugin(…)],
 *   },
 *   {
 *     id: "raster-photo",
 *     supports: (f) => isSupportedMediaUpload(f) && !isCameraRawImage(f),
 *     plugins: [createJpegCompressorPlugin(…)],
 *   },
 *   {
 *     id: "video",
 *     supports: (f) => isVideoLike(f),
 *     plugins: [createVideoPosterPlugin()],
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
}

/**
 * A single entry in a pipeline's plugin list.
 * Can be a concrete plugin instance or a reference to one by ID.
 */
export type PipelinePlugin = ProcessingPlugin<any> | PluginRef;

export interface PipelineDef {
  /** Unique identifier for this pipeline (used in logs & debugging). */
  id: string;
  /** Classifier — does this pipeline handle this file? */
  supports(file: PipelineSource): boolean;
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
  if (!registry) {
    // No registry — assume everything is a bare instance
    return plugins as ProcessingPlugin<any>[];
  }

  return plugins.map((p) => {
    if (isPluginInstance(p)) return p;

    const plugin = registry.find((r) => r.id === p.id);
    if (!plugin) {
      throw new Error(
        `Plugin "${p.id}" referenced in pipeline but not found in the plugin registry. ` +
          "Make sure to pass it via the `plugins` option.",
      );
    }
    if (!p.opts || Object.keys(p.opts).length === 0) return plugin;
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
    if (!def.supports(file)) continue;
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
