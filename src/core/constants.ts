/** @module core/constants */

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
