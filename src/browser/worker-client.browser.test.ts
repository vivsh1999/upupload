/**
 * Browser-mode integration tests for the pooled worker dispatch in
 * `worker-client`. These run the real inlined worker code against real
 * `OffscreenCanvas` / `createImageBitmap`; run with `pnpm run test:browser`.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  compressImageInWorker,
  compressVariantsInWorker,
  isOffscreenWorkerSupported,
  terminateWorkerPool,
} from "./worker-client";

function makeJpegBlob(width: number, height: number, seed = 7): Promise<Blob> {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#123456";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = `hsl(${seed * 13} 80% 60%)`;
  ctx.fillRect(0, 0, Math.floor(width / 2), Math.floor(height / 2));
  return canvas.convertToBlob({ type: "image/jpeg", quality: 0.9 });
}

async function dimensions(blob: Blob): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(blob);
  const size = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return size;
}

function poolTargetSize(): number {
  const hc = typeof navigator !== "undefined" ? navigator.hardwareConcurrency : undefined;
  return hc && hc > 0 ? Math.max(1, Math.min(4, hc)) : 4;
}

/** Count real `Worker` constructions so pool growth is observable. */
function trackWorkerConstructions(): { created: () => number; restore: () => void } {
  const Original = globalThis.Worker;
  let created = 0;

  class CountingWorker extends Original {
    constructor(url: string | URL, options?: WorkerOptions) {
      super(url, options);
      created++;
    }
  }

  (globalThis as { Worker: typeof Worker }).Worker = CountingWorker;
  return {
    created: () => created,
    restore: () => {
      (globalThis as { Worker: typeof Worker }).Worker = Original;
    },
  };
}

describe("worker-client pool (browser)", () => {
  beforeEach(() => {
    terminateWorkerPool();
  });

  afterEach(() => {
    terminateWorkerPool();
  });

  it("reports OffscreenCanvas worker support in Chromium", () => {
    expect(isOffscreenWorkerSupported()).toBe(true);
  });

  it("compresses a single variant on a background worker", async () => {
    const file = await makeJpegBlob(1200, 900);

    const blob = await compressImageInWorker(file, {
      quality: 0.7,
      maxLongEdge: 512,
      filename: "photo.optimized.jpg",
      variant: "optimized",
    });

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("image/jpeg");
    expect(await dimensions(blob)).toEqual({ width: 512, height: 384 });
  });

  it("encodes several variants from one decode inside a single job", async () => {
    const file = await makeJpegBlob(1200, 900);

    const results = await compressVariantsInWorker(file, [
      { variant: "web", filename: "photo.web.jpg", quality: 0.82, maxLongEdge: 640 },
      { variant: "thumb", filename: "photo.thumb.jpg", quality: 0.6, maxLongEdge: 160 },
    ]);

    expect(results.map((r) => r.variant)).toEqual(["web", "thumb"]);
    expect(results.map((r) => r.filename)).toEqual(["photo.web.jpg", "photo.thumb.jpg"]);
    expect(await dimensions(results[0]!.blob)).toEqual({ width: 640, height: 480 });
    expect(await dimensions(results[1]!.blob)).toEqual({ width: 160, height: 120 });
  });

  it("grows the pool for concurrent files instead of serialising on one worker", async () => {
    const target = poolTargetSize();
    const tracker = trackWorkerConstructions();
    const files = await Promise.all([0, 1, 2].map((i) => makeJpegBlob(900, 600, i)));

    try {
      const pending = files.map((file) =>
        compressVariantsInWorker(file, [
          { variant: "web", filename: "photo.web.jpg", quality: 0.8, maxLongEdge: 512 },
        ]),
      );

      // Three synchronous dispatches must have spread across the pool, capped
      // by both the pending job count and min(4, hardwareConcurrency).
      expect(tracker.created()).toBe(Math.min(3, target));

      const results = await Promise.all(pending);
      expect(results).toHaveLength(3);
      for (const [i, res] of results.entries()) {
        expect(res[0]!.variant).toBe("web");
        expect(await dimensions(res[0]!.blob)).toEqual({ width: 512, height: 341 });
        expect(files[i]!.size).toBeGreaterThan(0);
      }
    } finally {
      tracker.restore();
    }
  });

  it("reuses an idle worker for sequential jobs", async () => {
    const tracker = trackWorkerConstructions();
    const file = await makeJpegBlob(600, 400);

    try {
      const specs = [{ variant: "web", filename: "photo.web.jpg", quality: 0.8, maxLongEdge: 200 }];

      await compressVariantsInWorker(file, specs);
      const afterFirst = tracker.created();

      await compressVariantsInWorker(file, specs);
      expect(tracker.created()).toBe(afterFirst);
    } finally {
      tracker.restore();
    }
  });
});
