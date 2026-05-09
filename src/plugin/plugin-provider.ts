/** @module plugins/plugin-provider */
import type { ProcessingPlugin } from "./types";
import type { PluginRef } from "../browser/pipeline-utils";

// ---------------------------------------------------------------------------
// Type utilities
// ---------------------------------------------------------------------------

type KebabToCamel<S extends string> = S extends `${infer P}-${infer Q}`
  ? `${P}${Capitalize<KebabToCamel<Q>>}`
  : S;

type PluginMethod<T extends ProcessingPlugin<any>> = (
  opts?: Partial<T["options"]>,
) => TypedPluginRef<T["options"]>;

type PluginProviderType<T extends readonly ProcessingPlugin<any>[]> = {
  [K in T[number] as KebabToCamel<K["id"]>]: PluginMethod<K>;
};

// ---------------------------------------------------------------------------
// TypedPluginRef
// ---------------------------------------------------------------------------

/**
 * A typed reference to a registered plugin that carries the source plugin
 * instance for direct access to defaults and classifiers.
 *
 * Returned by {@link PluginProvider} methods. Compatible with
 * {@link import("../browser/pipeline-utils").PipelineDef.plugins} arrays —
 * the pipeline resolver reads `.defaults` to find the source plugin without
 * a separate registry lookup.
 *
 * @typeParam TOpts - Shape of the plugin's options.
 */
export interface TypedPluginRef<TOpts = Record<string, unknown>> extends PluginRef {
  id: string;
  /** Partial option overrides merged on top of the plugin's defaults. */
  opts?: Partial<TOpts>;
  /** Source plugin instance from the registry. */
  defaults: ProcessingPlugin<TOpts>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function kebabToMethodName(id: string): string {
  const cleaned = id.replace(/[:\-_./]/g, " ");
  return cleaned.replace(/\s+([a-zA-Z0-9])/g, (_, c) => c.toUpperCase()).replace(/\s+/g, "");
}

// ---------------------------------------------------------------------------
// PluginProvider
// ---------------------------------------------------------------------------

function createPluginProvider<T extends readonly ProcessingPlugin<any>[]>(
  plugins: T,
): PluginProvider<T> {
  const map = new Map<string, ProcessingPlugin<any>>();
  for (const p of plugins) {
    if (map.has(p.id)) {
      console.warn(`[PluginProvider] Duplicate plugin id "${p.id}" — using the last instance.`);
    }
    map.set(p.id, p);
  }

  const methods: Record<string, Function> = {};

  for (const plugin of plugins) {
    const methodName = kebabToMethodName(plugin.id);
    const pluginId = plugin.id;
    methods[methodName] = (opts?: Record<string, unknown>) => ({
      id: pluginId,
      ...(opts && Object.keys(opts).length > 0 ? { opts } : {}),
      defaults: plugin,
    });
  }

  const target = {
    plugins: [...map.values()],
    getPlugin: (id: string) => map.get(id),
    ...methods,
  };

  return target as unknown as PluginProvider<T>;
}

/**
 * Wraps a plugin registry into a fully typed provider that exposes methods
 * named after each plugin's ID (converted to camelCase).
 *
 * Each method returns a {@link TypedPluginRef} that carries the original
 * plugin instance (for `.defaults.supports()` etc.) and any overridden
 * options. Pipeline definitions can use these refs directly — the
 * pipeline resolver reads `.defaults` to find the source plugin without
 * a separate registry lookup.
 *
 * @example
 * ```ts
 * const pp = new PluginProvider([
 *   rawToJpeg,
 *   jpegCompressor.with({ quality: 80, maxLongEdge: 1920, maxSizeMB: 1 }),
 *   videoPoster.with({ maxEdge: 640 }),
 * ]);
 *
 * pp.rawToJpeg()                                    // → TypedPluginRef<RawToJpegPluginOptions>
 * pp.jpegCompressor({ variant: "client-proof" })    // → TypedPluginRef<JpegCompressorPluginOptions>
 * pp.videoPoster().defaults.supports(file)           // → access plugin classifier
 * ```
 */
export type PluginProvider<T extends readonly ProcessingPlugin<any>[]> = {
  readonly plugins: ProcessingPlugin<any>[];
  getPlugin(id: string): ProcessingPlugin<any> | undefined;
} & PluginProviderType<T>;

export const PluginProvider: new <T extends readonly ProcessingPlugin<any>[]>(
  plugins: T,
) => PluginProvider<T> = createPluginProvider as any;
