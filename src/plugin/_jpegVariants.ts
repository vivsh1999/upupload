/**
 * Main-thread multi-variant JPEG encoder.
 *
 * Decodes the source image **once** and encodes one JPEG per requested variant,
 * so an N-variant upload pays a single decode + one resize/encode per variant
 * instead of N decodes of the same source.
 *
 * This is the sibling of `browser/worker-client`'s batch job: the same
 * {@link JpegVariantJob} contract is used on both paths, so a pipeline can move
 * between the main thread and a worker pool without changing its declarations.
 *
 * EXIF orientation is applied by the decode itself (`imageOrientation:
 * "from-image"`), so callers do not have to supply `exifOrientation`.
 *
 * @module plugins/_jpegVariants
 */

import { createCanvas } from "../browser/canvas";

/**
 * One requested output variant.
 *
 * `quality` is a 0–1 JPEG quality fraction (the pipeline-facing option is 1–100
 * and is divided before the job is created).
 */
export interface JpegVariantJob {
  /** Artifact variant name (e.g. `"outputFile"`, `"thumb"`). */
  variant: string;
  /** Output filename including extension. */
  filename: string;
  /** JPEG quality as a 0–1 fraction. */
  quality: number;
  /** Longest-edge cap in px. Omit to keep the source dimensions. */
  maxLongEdge?: number;
  /** Soft size cap in MB — quality is bisected down until the output fits. */
  maxSizeMB?: number;
}

/** A JPEG produced from the shared decode. */
export interface EncodedJpegVariant {
  /** Artifact variant name. */
  variant: string;
  /** Output filename. */
  filename: string;
  /** Encoded JPEG file. */
  file: File;
}

type EncodeToBlob = (type: string, quality: number) => Promise<Blob | null>;

interface DecodedSource {
  source: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
}

/** Aspect-preserving longest-edge fit. Returns the source dims when unconstrained. */
function fitWithin(
  width: number,
  height: number,
  maxLongEdge: number | undefined,
): { width: number; height: number } {
  if (!maxLongEdge || maxLongEdge <= 0) return { width, height };
  if (width <= maxLongEdge && height <= maxLongEdge) return { width, height };
  if (width > height) {
    return {
      width: maxLongEdge,
      height: Math.max(1, Math.round((height * maxLongEdge) / width)),
    };
  }
  return {
    width: Math.max(1, Math.round((width * maxLongEdge) / height)),
    height: maxLongEdge,
  };
}

/**
 * Decode a blob once, preferring `createImageBitmap` (which applies EXIF
 * orientation) and falling back to an `<img>` element where it is unavailable.
 */
async function decodeOnce(input: Blob): Promise<DecodedSource> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(input, { imageOrientation: "from-image" });
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close(),
      };
    } catch {
      // Fall through to the <img> decoder.
    }
  }

  if (typeof Image === "undefined" || typeof URL === "undefined") {
    throw new Error("No image decoder is available in this environment.");
  }

  const url = URL.createObjectURL(input);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("Failed to decode image"));
      element.src = url;
    });
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      release: () => URL.revokeObjectURL(url),
    };
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
}

/** Bisect quality down until the encoded blob fits inside `maxBytes`. */
async function shrinkToSize(
  toBlob: EncodeToBlob,
  initial: Blob,
  initialQuality: number,
  maxBytes: number,
): Promise<Blob> {
  if (initial.size <= maxBytes) return initial;

  let low = 0.05;
  let high = Math.min(initialQuality, 0.95);
  let best = initial;

  for (let iter = 0; iter < 6; iter++) {
    const mid = (low + high) / 2;
    const candidate = await toBlob("image/jpeg", mid);
    if (!candidate) break;

    if (candidate.size <= maxBytes) {
      best = candidate;
      low = mid + 0.01;
    } else {
      high = mid - 0.01;
    }
    if (low >= high) break;
  }

  return best;
}

/**
 * Decode `input` once and encode every job.
 *
 * @param input - Source image blob (or a previously decoded file from the shared context).
 * @param jobs - Variants to emit. Each is resized from the single shared decode.
 * @returns One encoded file per job, in the same order.
 *
 * @example
 * ```ts
 * const [web, thumb] = await encodeJpegVariants(sourceFile, [
 *   { variant: "outputFile", filename: "photo.outputFile.jpg", quality: 0.82, maxLongEdge: 2560 },
 *   { variant: "thumb", filename: "photo.thumb.jpg", quality: 0.6, maxLongEdge: 400 },
 * ]);
 * ```
 */
export async function encodeJpegVariants(
  input: Blob,
  jobs: JpegVariantJob[],
): Promise<EncodedJpegVariant[]> {
  if (jobs.length === 0) return [];

  const decoded = await decodeOnce(input);
  try {
    const out: EncodedJpegVariant[] = [];
    for (const job of jobs) {
      const dims = fitWithin(decoded.width, decoded.height, job.maxLongEdge);
      const { getContext, toBlob } = createCanvas(dims.width, dims.height);

      const ctx = getContext();
      if (!ctx) throw new Error("Could not acquire a 2D context to encode JPEG variants.");
      ctx.drawImage(decoded.source, 0, 0, dims.width, dims.height);

      let blob = await toBlob("image/jpeg", job.quality);
      if (!blob) throw new Error("Canvas JPEG encoding returned no blob.");
      if (job.maxSizeMB !== undefined && job.maxSizeMB > 0) {
        blob = await shrinkToSize(toBlob, blob, job.quality, job.maxSizeMB * 1024 * 1024);
      }

      out.push({
        variant: job.variant,
        filename: job.filename,
        file: new File([blob], job.filename, { type: "image/jpeg", lastModified: Date.now() }),
      });
    }
    return out;
  } finally {
    decoded.release();
  }
}
