import { beforeAll, bench, describe } from "vitest";
import { DEFAULT_BROWSER_PIPELINE_OPTIONS, runDefaultBrowserPipeline } from "../browser/pipeline";
import type { PipelineSource } from "../core/types";
import { createJpegCompressorPlugin } from "../plugin/jpeg-compressor";
import { createRawToJpegPlugin } from "../plugin/raw-to-jpeg";

declare global {
  var __MEDIA_PIPELINE_DOM_CANVAS: boolean | undefined;
}

const DOM_CANVAS = !!globalThis.__MEDIA_PIPELINE_DOM_CANVAS;

async function createTestImageFile(
  width: number,
  height: number,
  filename: string,
  type: string,
): Promise<File> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "red");
  gradient.addColorStop(0.5, "green");
  gradient.addColorStop(1, "blue");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  for (let i = 0; i < 100; i++) {
    ctx.fillStyle = `hsl(${i * 7}, 80%, 50%)`;
    ctx.beginPath();
    ctx.arc(Math.random() * width, Math.random() * height, Math.random() * 20 + 3, 0, Math.PI * 2);
    ctx.fill();
  }
  const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), type));
  return new File([blob], filename, { type, lastModified: Date.now() });
}

// ---------------------------------------------------------------------------
// RAW (DNG) → optimized JPEG
// ---------------------------------------------------------------------------

const DEFAULT_DNG_URL = "https://filesamples.com/samples/image/dng/sample1.dng";

function benchRawFixtureUrl(): string {
  const proc = (
    globalThis as unknown as {
      process?: { env?: Record<string, string | undefined> };
    }
  ).process;
  return proc?.env?.MEDIA_PIPELINE_BENCH_RAW_URL ?? DEFAULT_DNG_URL;
}

describe.skipIf(!DOM_CANVAS)("RAW (DNG) → optimized JPEG", () => {
  let source: PipelineSource;
  beforeAll(async () => {
    const url = benchRawFixtureUrl();
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Bench fixture fetch failed (${res.status}): ${url}`);
    const buf = await res.arrayBuffer();
    const file = new File([buf], "bench-sample.dng", { type: "application/octet-stream" });
    source = { file, name: "bench-sample.dng", type: "application/octet-stream" };
    // Pre-warm decoders
    createRawToJpegPlugin().preload?.();
    createJpegCompressorPlugin({
      variant: "optimized",
      quality: 90,
      maxLongEdge: 3840,
      maxSizeMB: 1,
    }).preload?.();
  }, 240_000);

  bench(
    "runDefaultBrowserPipeline",
    async () => {
      const out = await runDefaultBrowserPipeline(source, DEFAULT_BROWSER_PIPELINE_OPTIONS, {
        plugins: [
          createRawToJpegPlugin(),
          createJpegCompressorPlugin({
            variant: "optimized",
            quality: 90,
            maxLongEdge: 3840,
            maxSizeMB: 1,
          }),
        ],
      });

      // ---------------------------------------------------------------------------
      // Raster JPEG → optimized JPEG
      // ---------------------------------------------------------------------------

      describe.skipIf(!DOM_CANVAS)("Raster JPEG → optimized JPEG", () => {
        let source: PipelineSource;
        beforeAll(async () => {
          const file = await createTestImageFile(1920, 1080, "photo.jpg", "image/jpeg");
          source = { file, name: "photo.jpg", type: "image/jpeg" };
          createJpegCompressorPlugin({
            variant: "optimized",
            quality: 90,
            maxLongEdge: 3840,
            maxSizeMB: 1,
          }).preload?.();
        }, 30_000);

        bench(
          "runDefaultBrowserPipeline",
          async () => {
            const out = await runDefaultBrowserPipeline(source, DEFAULT_BROWSER_PIPELINE_OPTIONS, {
              plugins: [
                createJpegCompressorPlugin({
                  variant: "optimized",
                  quality: 90,
                  maxLongEdge: 3840,
                  maxSizeMB: 1,
                }),
              ],
            });
            const optimized = out.artifacts.find((a) => a.variant === "optimized");
            if (!optimized) {
              const codes = out.info.map((i) => i.code).filter(Boolean);
              throw new Error(`Expected optimized JPEG (codes: ${codes.join(", ") || "none"})`);
            }
          },
          { time: 30_000 },
        );
      });

      // ---------------------------------------------------------------------------
      // Raster PNG → optimized JPEG + thumbnail
      // ---------------------------------------------------------------------------

      describe.skipIf(!DOM_CANVAS)("Raster PNG → optimized JPEG + thumbnail", () => {
        let source: PipelineSource;
        beforeAll(async () => {
          const file = await createTestImageFile(1920, 1080, "photo.png", "image/png");
          source = { file, name: "photo.png", type: "image/png" };
          createJpegCompressorPlugin({
            variant: "optimized",
            quality: 90,
            maxLongEdge: 3840,
            maxSizeMB: 1,
          }).preload?.();
          createJpegCompressorPlugin({
            variant: "thumbnail",
            quality: 78,
            maxLongEdge: 640,
            maxSizeMB: 0.25,
          }).preload?.();
        }, 30_000);

        bench(
          "runDefaultBrowserPipeline",
          async () => {
            const out = await runDefaultBrowserPipeline(source, DEFAULT_BROWSER_PIPELINE_OPTIONS, {
              plugins: [
                createJpegCompressorPlugin({
                  variant: "optimized",
                  quality: 90,
                  maxLongEdge: 3840,
                  maxSizeMB: 1,
                }),
                createJpegCompressorPlugin({
                  variant: "thumbnail",
                  quality: 78,
                  maxLongEdge: 640,
                  maxSizeMB: 0.25,
                }),
              ],
            });
            const optimized = out.artifacts.find((a) => a.variant === "optimized");
            const thumbnail = out.artifacts.find((a) => a.variant === "thumbnail");
            if (!optimized || !thumbnail) {
              const codes = out.info.map((i) => i.code).filter(Boolean);
              throw new Error(
                `Expected optimized + thumbnail (codes: ${codes.join(", ") || "none"})`,
              );
            }
          },
          { time: 30_000 },
        );
      });

      // ---------------------------------------------------------------------------
      // Large PNG → optimized JPEG with maxLongEdge constraint
      // ---------------------------------------------------------------------------

      describe.skipIf(!DOM_CANVAS)("Large PNG → optimized JPEG (maxLongEdge=1920)", () => {
        let source: PipelineSource;
        beforeAll(async () => {
          const file = await createTestImageFile(4000, 3000, "large.png", "image/png");
          source = { file, name: "large.png", type: "image/png" };
          createJpegCompressorPlugin({
            variant: "optimized",
            quality: 90,
            maxLongEdge: 1920,
            maxSizeMB: 1,
          }).preload?.();
        }, 30_000);

        bench(
          "runDefaultBrowserPipeline",
          async () => {
            const out = await runDefaultBrowserPipeline(source, DEFAULT_BROWSER_PIPELINE_OPTIONS, {
              plugins: [
                createJpegCompressorPlugin({
                  variant: "optimized",
                  quality: 90,
                  maxLongEdge: 1920,
                  maxSizeMB: 1,
                }),
              ],
            });
            const optimized = out.artifacts.find((a) => a.variant === "optimized");
            if (!optimized) {
              const codes = out.info.map((i) => i.code).filter(Boolean);
              throw new Error(`Expected optimized artifact (codes: ${codes.join(", ") || "none"})`);
            }
          },
          { time: 60_000 },
        );
      });

      // ---------------------------------------------------------------------------
      // Thumbnail-only pipeline (no optimized output)
      // ---------------------------------------------------------------------------

      describe.skipIf(!DOM_CANVAS)("PNG → thumbnail only", () => {
        let source: PipelineSource;
        beforeAll(async () => {
          const file = await createTestImageFile(1920, 1080, "photo.png", "image/png");
          source = { file, name: "photo.png", type: "image/png" };
          createJpegCompressorPlugin({
            variant: "thumbnail",
            quality: 78,
            maxLongEdge: 640,
            maxSizeMB: 0.25,
          }).preload?.();
        }, 30_000);

        bench(
          "runDefaultBrowserPipeline",
          async () => {
            const out = await runDefaultBrowserPipeline(source, DEFAULT_BROWSER_PIPELINE_OPTIONS, {
              plugins: [
                createJpegCompressorPlugin({
                  variant: "thumbnail",
                  quality: 78,
                  maxLongEdge: 640,
                  maxSizeMB: 0.25,
                }),
              ],
            });
            const thumbnail = out.artifacts.find((a) => a.variant === "thumbnail");
            if (!thumbnail) {
              const codes = out.info.map((i) => i.code).filter(Boolean);
              throw new Error(`Expected thumbnail (codes: ${codes.join(", ") || "none"})`);
            }
          },
          { time: 30_000 },
        );
      });
      const optimized = out.artifacts.find((a) => a.variant === "optimized");
      if (!optimized) {
        const codes = out.info.map((i) => i.code).filter(Boolean);
        throw new Error(
          `Expected optimized JPEG artifact (info codes: ${codes.join(", ") || "none"})`,
        );
      }
      if (optimized.file.size > 1.1 * 1024 * 1024) {
        throw new Error(`Expected optimized size ≤ ~1 MB; got ${optimized.file.size} bytes`);
      }
    },
    { time: 120_000 },
  );
});

// ---------------------------------------------------------------------------
// Raster JPEG → optimized JPEG
// ---------------------------------------------------------------------------

describe.skipIf(!DOM_CANVAS)("Raster JPEG → optimized JPEG", () => {
  let source: PipelineSource;
  beforeAll(async () => {
    const file = await createTestImageFile(1920, 1080, "photo.jpg", "image/jpeg");
    source = { file, name: "photo.jpg", type: "image/jpeg" };
    createJpegCompressorPlugin({
      variant: "optimized",
      quality: 90,
      maxLongEdge: 3840,
      maxSizeMB: 1,
    }).preload?.();
  }, 30_000);

  bench(
    "runDefaultBrowserPipeline",
    async () => {
      const out = await runDefaultBrowserPipeline(source, DEFAULT_BROWSER_PIPELINE_OPTIONS, {
        plugins: [
          createJpegCompressorPlugin({
            variant: "optimized",
            quality: 90,
            maxLongEdge: 3840,
            maxSizeMB: 1,
          }),
        ],
      });
      const optimized = out.artifacts.find((a) => a.variant === "optimized");
      if (!optimized) {
        const codes = out.info.map((i) => i.code).filter(Boolean);
        throw new Error(`Expected optimized JPEG (codes: ${codes.join(", ") || "none"})`);
      }
    },
    { time: 30_000 },
  );
});

// ---------------------------------------------------------------------------
// Raster PNG → optimized JPEG + thumbnail
// ---------------------------------------------------------------------------

describe.skipIf(!DOM_CANVAS)("Raster PNG → optimized JPEG + thumbnail", () => {
  let source: PipelineSource;
  beforeAll(async () => {
    const file = await createTestImageFile(1920, 1080, "photo.png", "image/png");
    source = { file, name: "photo.png", type: "image/png" };
    createJpegCompressorPlugin({
      variant: "optimized",
      quality: 90,
      maxLongEdge: 3840,
      maxSizeMB: 1,
    }).preload?.();
    createJpegCompressorPlugin({
      variant: "thumbnail",
      quality: 78,
      maxLongEdge: 640,
      maxSizeMB: 0.25,
    }).preload?.();
  }, 30_000);

  bench(
    "runDefaultBrowserPipeline",
    async () => {
      const out = await runDefaultBrowserPipeline(source, DEFAULT_BROWSER_PIPELINE_OPTIONS, {
        plugins: [
          createJpegCompressorPlugin({
            variant: "optimized",
            quality: 90,
            maxLongEdge: 3840,
            maxSizeMB: 1,
          }),
          createJpegCompressorPlugin({
            variant: "thumbnail",
            quality: 78,
            maxLongEdge: 640,
            maxSizeMB: 0.25,
          }),
        ],
      });
      const optimized = out.artifacts.find((a) => a.variant === "optimized");
      const thumbnail = out.artifacts.find((a) => a.variant === "thumbnail");
      if (!optimized || !thumbnail) {
        const codes = out.info.map((i) => i.code).filter(Boolean);
        throw new Error(`Expected optimized + thumbnail (codes: ${codes.join(", ") || "none"})`);
      }
    },
    { time: 30_000 },
  );
});

// ---------------------------------------------------------------------------
// Large PNG → optimized JPEG with maxLongEdge constraint
// ---------------------------------------------------------------------------

describe.skipIf(!DOM_CANVAS)("Large PNG → optimized JPEG (maxLongEdge=1920)", () => {
  let source: PipelineSource;
  beforeAll(async () => {
    const file = await createTestImageFile(4000, 3000, "large.png", "image/png");
    source = { file, name: "large.png", type: "image/png" };
    createJpegCompressorPlugin({
      variant: "optimized",
      quality: 90,
      maxLongEdge: 1920,
      maxSizeMB: 1,
    }).preload?.();
  }, 30_000);

  bench(
    "runDefaultBrowserPipeline",
    async () => {
      const out = await runDefaultBrowserPipeline(source, DEFAULT_BROWSER_PIPELINE_OPTIONS, {
        plugins: [
          createJpegCompressorPlugin({
            variant: "optimized",
            quality: 90,
            maxLongEdge: 1920,
            maxSizeMB: 1,
          }),
        ],
      });
      const optimized = out.artifacts.find((a) => a.variant === "optimized");
      if (!optimized) {
        const codes = out.info.map((i) => i.code).filter(Boolean);
        throw new Error(`Expected optimized artifact (codes: ${codes.join(", ") || "none"})`);
      }
    },
    { time: 60_000 },
  );
});

// ---------------------------------------------------------------------------
// Thumbnail-only pipeline (no optimized output)
// ---------------------------------------------------------------------------

describe.skipIf(!DOM_CANVAS)("PNG → thumbnail only", () => {
  let source: PipelineSource;
  beforeAll(async () => {
    const file = await createTestImageFile(1920, 1080, "photo.png", "image/png");
    source = { file, name: "photo.png", type: "image/png" };
    createJpegCompressorPlugin({
      variant: "thumbnail",
      quality: 78,
      maxLongEdge: 640,
      maxSizeMB: 0.25,
    }).preload?.();
  }, 30_000);

  bench(
    "runDefaultBrowserPipeline",
    async () => {
      const out = await runDefaultBrowserPipeline(source, DEFAULT_BROWSER_PIPELINE_OPTIONS, {
        plugins: [
          createJpegCompressorPlugin({
            variant: "thumbnail",
            quality: 78,
            maxLongEdge: 640,
            maxSizeMB: 0.25,
          }),
        ],
      });
      const thumbnail = out.artifacts.find((a) => a.variant === "thumbnail");
      if (!thumbnail) {
        const codes = out.info.map((i) => i.code).filter(Boolean);
        throw new Error(`Expected thumbnail (codes: ${codes.join(", ") || "none"})`);
      }
    },
    { time: 30_000 },
  );
});
