/**
 * Web Worker runner for executing intensive image processing (resizing, JPEG compression)
 * on a background thread using OffscreenCanvas and createImageBitmap.
 *
 * @module browser/worker-client
 */

/**
 * The self-contained worker code as a stringified function to ensure 100% bundler compatibility and offline support.
 */
const WORKER_CODE = `
self.onmessage = async (e) => {
  const { id, file, quality, maxLongEdge, maxSizeMB, filename, variant } = e.data;
  try {
    // 1. Decode image asynchronously using modern background decoding API
    const bitmap = await createImageBitmap(file);
    let width = bitmap.width;
    let height = bitmap.height;

    // 2. Calculate aspect-ratio preserved dimensions
    if (maxLongEdge && maxLongEdge > 0) {
      if (width > maxLongEdge || height > maxLongEdge) {
        if (width > height) {
          height = Math.round((height * maxLongEdge) / width);
          width = maxLongEdge;
        } else {
          width = Math.round((width * maxLongEdge) / height);
          height = maxLongEdge;
        }
      }
    }

    // 3. Draw to OffscreenCanvas
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Could not acquire 2D context from OffscreenCanvas");
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close(); // Free GPU memory immediately

    // 4. Compress to JPEG Blob with target quality
    let blob = await canvas.convertToBlob({ type: "image/jpeg", quality });

    // 5. High-performance Binary Search for size constraint (bisection)
    if (maxSizeMB && maxSizeMB > 0) {
      const maxBytes = maxSizeMB * 1024 * 1024;
      if (blob.size > maxBytes) {
        let low = 0.05;
        let high = quality;
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

    self.postMessage({ id, success: true, blob, filename, variant });
  } catch (err) {
    self.postMessage({ id, success: false, error: err instanceof Error ? err.message : String(err) });
  }
};
`;

let workerInstance: Worker | null = null;
const pendingResolves = new Map<
  string,
  { resolve: (blob: Blob) => void; reject: (err: Error) => void }
>();
let messageCounter = 0;

function getWorker(): Worker {
  if (!workerInstance) {
    const blob = new Blob([WORKER_CODE], { type: "application/javascript" });
    const url = URL.createObjectURL(blob);
    workerInstance = new Worker(url);

    workerInstance.onmessage = (e) => {
      const { id, success, blob, error } = e.data;
      const promise = pendingResolves.get(id);
      if (!promise) return;
      pendingResolves.delete(id);

      if (success) {
        promise.resolve(blob);
      } else {
        promise.reject(new Error(error || "Worker processing failed."));
      }
    };
  }
  return workerInstance;
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
 * Offload image compression and resizing to the background Web Worker.
 *
 * @param file - The source file or blob to compress
 * @param options - Compression settings
 * @returns A promise that resolves to the compressed JPEG Blob
 */
export function compressImageInWorker(
  file: File | Blob,
  options: {
    quality: number;
    maxLongEdge?: number;
    maxSizeMB?: number;
    filename: string;
    variant: string;
  },
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      const worker = getWorker();
      messageCounter++;
      const id = `msg-${messageCounter}-${Date.now()}`;
      pendingResolves.set(id, { resolve, reject });

      worker.postMessage({
        id,
        file,
        quality: options.quality,
        maxLongEdge: options.maxLongEdge,
        maxSizeMB: options.maxSizeMB,
        filename: options.filename,
        variant: options.variant,
      });
    } catch (err) {
      reject(err);
    }
  });
}
