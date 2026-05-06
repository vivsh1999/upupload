/**
 * Maps each pipeline variant to a subdirectory under the TUS file store root
 * (`uploads/`). The server `namingFunction` prefixes upload IDs with this path
 * so originals, optimized JPEGs, and thumbnails land in separate folders.
 */
export const TUS_VARIANT_TO_SUBDIR = {
  original: "originals",
  optimized: "optimized",
  thumbnail: "thumbnails",
} as const;

export type TusPipelineVariant = keyof typeof TUS_VARIANT_TO_SUBDIR;

const ALLOWED = new Set<string>(Object.keys(TUS_VARIANT_TO_SUBDIR));

export function isTusPipelineVariant(
  value: string | null | undefined,
): value is TusPipelineVariant {
  return value != null && ALLOWED.has(value);
}

/** Reads `variant` (or legacy `__variant`) from TUS Creation metadata. */
export function variantFromTusMetadata(
  metadata?: Record<string, string | null>,
): TusPipelineVariant | null {
  const v = metadata?.variant ?? metadata?.__variant;
  return isTusPipelineVariant(v) ? v : null;
}
