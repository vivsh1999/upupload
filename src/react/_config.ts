/**
 * Initial `BrowserPipelineOptions` resolution for the React hook.
 *
 * @module react/_config
 */
import { DEFAULT_BROWSER_PIPELINE_OPTIONS } from "../browser/pipeline";
import type { BrowserPipelineOptions } from "../browser/pipeline";

/**
 * Build the hook's initial pipeline options from its `pipelineConfig` prop:
 * documented defaults, overridden by whatever the consumer supplied.
 *
 * Every field is forwarded (not just `logLevel`), so options such as
 * `useWorker` actually reach the browser pipeline.
 *
 * @param pipelineConfig - Optional partial override supplied by the consumer.
 * @returns The complete initial options object.
 *
 * @example
 * ```ts
 * resolveInitialConfig({ useWorker: true });
 * // { logLevel: "silent", useWorker: true }
 * ```
 */
export function resolveInitialConfig(
  pipelineConfig?: Partial<BrowserPipelineOptions>,
): BrowserPipelineOptions {
  return { ...DEFAULT_BROWSER_PIPELINE_OPTIONS, ...pipelineConfig };
}
