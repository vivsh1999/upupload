/**
 * Web Worker pool for executing intensive image processing (resizing, JPEG
 * compression) on background threads using OffscreenCanvas and createImageBitmap.
 *
 * Jobs are dispatched one **per source file**: a batch job decodes the source
 * once and encodes every requested variant, so a file's variants always share a
 * single decode and stay on one thread. Concurrent files are spread across a
 * small pool (`min(4, hardwareConcurrency)`) rather than serialised onto a
 * single worker.
 *
 * @module browser/worker-client
 */

import type { JpegVariantJob } from "../plugin/_jpegVariants";

/** A JPEG encoded inside the worker. */
export interface WorkerVariantResult {
  variant: string;
  filename: string;
  blob: Blob;
}

/**
 * The self-contained worker code as a stringified function to ensure 100% bundler compatibility and offline support.
 */
const WORKER_CODE = `
function fitWithin(width, height, maxLongEdge) {
  if (!maxLongEdge || maxLongEdge <= 0) return { width: width, height: height };
  if (width <= maxLongEdge && height <= maxLongEdge) return { width: width, height: height };
  if (width > height) {
    return { width: maxLongEdge, height: Math.max(1, Math.round((height * maxLongEdge) / width)) };
  }
  return { width: Math.max(1, Math.round((width * maxLongEdge) / height)), height: maxLongEdge };
}

async function encodeVariant(bitmap, spec) {
  // 1. Calculate aspect-ratio preserved dimensions from the shared decode.
  const dims = fitWithin(bitmap.width, bitmap.height, spec.maxLongEdge);

  // 2. Draw to OffscreenCanvas.
  const canvas = new OffscreenCanvas(dims.width, dims.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Could not acquire 2D context from OffscreenCanvas");
  }
  ctx.drawImage(bitmap, 0, 0, dims.width, dims.height);

  // 3. Compress to JPEG Blob with the target quality.
  let blob = await canvas.convertToBlob({ type: "image/jpeg", quality: spec.quality });

  // 4. High-performance Binary Search for the size constraint (bisection).
  if (spec.maxSizeMB && spec.maxSizeMB > 0) {
    const maxBytes = spec.maxSizeMB * 1024 * 1024;
    if (blob.size > maxBytes) {
      let low = 0.05;
      let high = spec.quality;
      let bestBlob = blob;
      for (let iter = 0; iter < 6; iter++) {
        const mid = (low + high) / 2;
        const tempBlob = await canvas.convertToBlob({ type: "image/jpeg", quality: mid });
        if (tempBlob.size <= maxBytes) {
          bestBlob = tempBlob;
          low = mid + 0.01;
        } else {
          high = mid - 0.01;
        }
        if (low >= high) break;
      }
      blob = bestBlob;
    }
  }

  return blob;
}

self.onmessage = async (e) => {
  const { id, file, variants } = e.data;
  try {
    // Decode the source ONCE (EXIF orientation applied) and share it across variants.
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const results = [];
    try {
      for (const spec of variants) {
        const blob = await encodeVariant(bitmap, spec);
        results.push({ variant: spec.variant, filename: spec.filename, blob: blob });
      }
    } finally {
      bitmap.close(); // Free GPU memory immediately
    }
    self.postMessage({ id: id, success: true, results: results });
  } catch (err) {
    self.postMessage({ id: id, success: false, error: err instanceof Error ? err.message : String(err) });
  }
};
`;

interface WorkerSlot {
  worker: Worker;
  inflight: number;
}

let pool: WorkerSlot[] = [];
const pendingResolves = new Map<
  string,
  {
    resolve: (results: WorkerVariantResult[]) => void;
    reject: (err: Error) => void;
  }
>();
let messageCounter = 0;

/** Target pool size: `min(4, hardwareConcurrency)`, defaulting to 4 when unknown. */
function poolTargetSize(): number {
  const hardwareConcurrency =
    typeof navigator !== "undefined" ? navigator.hardwareConcurrency : undefined;
  if (hardwareConcurrency && hardwareConcurrency > 0) {
    return Math.max(1, Math.min(4, hardwareConcurrency));
  }
  return 4;
}

function createSlot(): WorkerSlot {
  const blob = new Blob([WORKER_CODE], { type: "application/javascript" });
  const url = URL.createObjectURL(blob);
  const worker = new Worker(url);
  const slot: WorkerSlot = { worker, inflight: 0 };

  worker.onmessage = (e) => {
    slot.inflight = Math.max(0, slot.inflight - 1);

    const { id, success, results, error } = e.data;
    const pending = pendingResolves.get(id);
    if (!pending) return;
    pendingResolves.delete(id);

    if (success) {
      pending.resolve(results as WorkerVariantResult[]);
    } else {
      pending.reject(new Error(error || "Worker processing failed."));
    }
  };

  return slot;
}

/**
 * Pick the worker to run the next job on: an idle one if available, otherwise a
 * freshly spawned one while the pool is still growing, otherwise the least
 * loaded worker.
 */
function acquireSlot(): WorkerSlot {
  for (const slot of pool) {
    if (slot.inflight === 0) return slot;
  }
  if (pool.length < poolTargetSize()) {
    const slot = createSlot();
    pool.push(slot);
    return slot;
  }

  let leastLoaded = pool[0]!;
  for (const slot of pool) {
    if (slot.inflight < leastLoaded.inflight) leastLoaded = slot;
  }
  return leastLoaded;
}

function dispatchJob(job: {
  file: File | Blob;
  variants: JpegVariantJob[];
}): Promise<WorkerVariantResult[]> {
  return new Promise<WorkerVariantResult[]>((resolve, reject) => {
    let slot: WorkerSlot;
    try {
      slot = acquireSlot();
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
      return;
    }

    messageCounter++;
    const id = `msg-${messageCounter}-${Date.now()}`;
    pendingResolves.set(id, { resolve, reject });
    slot.inflight++;

    try {
      slot.worker.postMessage({ id, file: job.file, variants: job.variants });
    } catch (err) {
      slot.inflight = Math.max(0, slot.inflight - 1);
      pendingResolves.delete(id);
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

/**
 * Check if the browser supports OffscreenCanvas inside Web Workers.
 *
 * @returns True if supported, false otherwise.
 */
export function isOffscreenWorkerSupported(): boolean {
  return (
    typeof Worker !== "undefined" &&
    typeof OffscreenCanvas !== "undefined" &&
    typeof createImageBitmap !== "undefined" &&
    typeof URL !== "undefined" &&
    typeof Blob !== "undefined"
  );
}

/**
 * Encode several JPEG variants of one source file inside a single worker job.
 *
 * The source is decoded once and every variant is resized/encoded from that
 * decode, so the caller keeps a file's variants on one thread.
 *
 * @param file - The source file or blob to compress
 * @param variants - Variants to emit, sharing one decode
 * @returns One result per variant, in the same order
 */
export function compressVariantsInWorker(
  file: File | Blob,
  variants: JpegVariantJob[],
): Promise<WorkerVariantResult[]> {
  if (variants.length === 0) return Promise.resolve([]);
  return dispatchJob({ file, variants });
}

/**
 * Offload image compression and resizing to a background Web Worker.
 *
 * @param file - The source file or blob to compress
 * @param options - Compression settings
 * @returns A promise that resolves to the compressed JPEG Blob
 */
export async function compressImageInWorker(
  file: File | Blob,
  options: {
    quality: number;
    maxLongEdge?: number;
    maxSizeMB?: number;
    filename: string;
    variant: string;
  },
): Promise<Blob> {
  const [first] = await compressVariantsInWorker(file, [
    {
      variant: options.variant,
      filename: options.filename,
      quality: options.quality,
      ...(options.maxLongEdge !== undefined ? { maxLongEdge: options.maxLongEdge } : {}),
      ...(options.maxSizeMB !== undefined ? { maxSizeMB: options.maxSizeMB } : {}),
    },
  ]);

  if (!first) throw new Error("Worker processing returned no result.");
  return first.blob;
}

/**
 * Terminate every pooled worker and drop queued bookkeeping.
 * Intended for teardown in tests and long-lived hosts that want the threads back.
 */
export function terminateWorkerPool(): void {
  for (const slot of pool) {
    slot.worker.terminate();
  }
  pool = [];
  pendingResolves.clear();
  messageCounter = 0;
}
