import type { DefaultBrowserPipelineOptions } from "../browser/pipeline-utils";
import type { ProcessingPlugin } from "./types";

/**
 * Create a {@link ProcessingPlugin} with less boilerplate.
 *
 * @example
 * ```ts
 * const watermark = definePlugin("watermark", {
 *   name: "Watermark Plugin",
 *   supports: (file) => file.type?.startsWith("image/") ?? false,
 *   stages: (input, opts, classif, ctx) => [
 *     stage("apply-watermark", async () => {
 *       // ...
 *       return { artifacts: [], info: [], removeFromQueue: false };
 *     }),
 *   ],
 * });
 * ```
 */
export function definePlugin<TOpts = DefaultBrowserPipelineOptions>(
  id: string,
  config: {
    /** Human-readable name for logs and tooling. Defaults to `id`. */
    name?: string;
    /** Quick classifier — does this plugin handle this file? */
    supports: ProcessingPlugin<TOpts>["supports"];
    /** Return pipeline stages for this file. */
    stages: ProcessingPlugin<TOpts>["createStages"];
    /** IDs of plugins whose stages must run before this plugin's stages. */
    after?: string[];
    /** IDs of plugins whose stages must run after this plugin's stages. */
    before?: string[];
    /** Pre-warm decoders / WASM / etc. */
    preload?: ProcessingPlugin<TOpts>["preload"];
  },
): ProcessingPlugin<TOpts> {
  return {
    id,
    name: config.name ?? id,
    supports: config.supports,
    createStages: config.stages,
    after: config.after,
    before: config.before,
    preload: config.preload,
  };
}
