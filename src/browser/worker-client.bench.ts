import { beforeAll, bench, describe } from "vitest";
import { runDefaultBrowserPipeline } from "./pipeline";
import type { PipelineSource } from "../core/types";
import { jpegCompressor } from "../plugin/jpeg-compressor";

const HAS_WORKER_SUPPORT =
  typeof Worker !== "undefined" &&
  typeof OffscreenCanvas !== "undefined" &&
  typeof createImageBitmap !== "undefined";

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
  const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), type));
  return new File([blob], filename, { type, lastModified: Date.now() });
}

describe.skipIf(!HAS_WORKER_SUPPORT)("Web Worker vs Main Thread Compression", () => {
  let source: PipelineSource;
  let plugin: typeof jpegCompressor;

  beforeAll(async () => {
    const file = await createTestImageFile(1920, 1080, "photo.jpg", "image/jpeg");
    source = { file, name: "photo.jpg", type: "image/jpeg" };
    plugin = jpegCompressor.with({
      variant: "optimized",
      quality: 85,
      maxLongEdge: 1920,
      maxSizeMB: 1,
    });
  });

  bench(
    "Main-Thread standard Canvas compression",
    async () => {
      await runDefaultBrowserPipeline(
        source,
        { useWorker: false },
        {
          plugins: [plugin],
        },
      );
    },
    { time: 10_000 },
  );

  bench(
    "Web Worker background thread compression",
    async () => {
      await runDefaultBrowserPipeline(
        source,
        { useWorker: true },
        {
          plugins: [plugin],
        },
      );
    },
    { time: 10_000 },
  );
});
