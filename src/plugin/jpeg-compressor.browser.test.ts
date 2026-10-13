/**
 * Browser-mode integration tests for `jpegCompressor`'s one-decode multi-variant
 * mode. These need a real `createImageBitmap` + `OffscreenCanvas`; run with
 * `pnpm run test:browser`.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { jpegCompressor } from "./jpeg-compressor";
import type { JpegCompressorVariant } from "./jpeg-compressor";
import { mockFileClassification, mockPipelineContext, mockPipelineSource } from "./test-utils";
import type { PipelineResult } from "../core/types";

/** Deterministic seeded noise so JPEG sizes are reproducible across runs. */
function seededNoise(width: number, height: number, seed = 1234): Uint8ClampedArray<ArrayBuffer> {
  let state = seed;
  const next = () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return (state >>> 8) & 0xff;
  };
  const data = new Uint8ClampedArray(new ArrayBuffer(width * height * 4));
  for (let i = 0; i < data.length; i += 4) {
    data[i] = next();
    data[i + 1] = next();
    data[i + 2] = next();
    data[i + 3] = 255;
  }
  return data;
}

/** A high-detail JPEG, so downscaling and quality bisection have real work to do. */
async function makeJpegFile(width: number, height: number): Promise<File> {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d")!;
  ctx.putImageData(new ImageData(seededNoise(width, height), width, height), 0, 0);
  const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.95 });
  return new File([blob], "photo.jpg", { type: "image/jpeg", lastModified: 1 });
}

async function runVariants(file: File, variants: JpegCompressorVariant[]): Promise<PipelineResult> {
  const plugin = jpegCompressor.with({ quality: 80, maxLongEdge: 2560, maxSizeMB: 1, variants });
  const source = mockPipelineSource({ file, name: "photo.jpg", type: "image/jpeg" });
  const classif = mockFileClassification({ ext: ".jpg", mime: "image/jpeg", stemName: "photo" });
  const ctx = mockPipelineContext();
  const stages = plugin.createStages(source, plugin.options, classif, ctx);
  return stages[0]!.run(source, ctx);
}

async function dimensions(blob: Blob): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(blob);
  const size = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return size;
}

describe("jpegCompressor multi-variant (browser)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("emits every variant from exactly one decode", async () => {
    const file = await makeJpegFile(1600, 1200);
    const decodeSpy = vi.spyOn(globalThis, "createImageBitmap");

    const result = await runVariants(file, [
      { variant: "outputFile", quality: 82, maxLongEdge: 1024, maxSizeMB: 1 },
      { variant: "thumb", quality: 60, maxLongEdge: 256, maxSizeMB: 0.25 },
    ]);

    expect(decodeSpy).toHaveBeenCalledTimes(1);
    decodeSpy.mockRestore();

    expect(result.artifacts.map((a) => a.variant)).toEqual(["outputFile", "thumb"]);
    expect(result.artifacts.map((a) => a.filename)).toEqual([
      "photo.outputFile.jpg",
      "photo.thumb.jpg",
    ]);
    for (const art of result.artifacts) {
      expect(art.file.type).toBe("image/jpeg");
      expect(art.file.size).toBeGreaterThan(0);
    }
  });

  it("resizes each variant to its own longest edge, preserving aspect ratio", async () => {
    const file = await makeJpegFile(1600, 1200);

    const result = await runVariants(file, [
      { variant: "large", quality: 82, maxLongEdge: 800 },
      { variant: "small", quality: 70, maxLongEdge: 200 },
    ]);

    expect(await dimensions(result.artifacts[0]!.file)).toEqual({ width: 800, height: 600 });
    expect(await dimensions(result.artifacts[1]!.file)).toEqual({ width: 200, height: 150 });
  });

  it("keeps the source dimensions when no longest edge is set", async () => {
    const file = await makeJpegFile(1200, 900);

    const result = await runVariants(file, [{ variant: "full", quality: 80 }]);

    expect(await dimensions(result.artifacts[0]!.file)).toEqual({ width: 1200, height: 900 });
  });

  it("shrinks a variant that exceeds its maxSizeMB instead of failing", async () => {
    const file = await makeJpegFile(300, 200);

    const artifacts = (
      await runVariants(file, [
        { variant: "loose", quality: 90, maxLongEdge: 300, maxSizeMB: 10 },
        { variant: "tight", quality: 90, maxLongEdge: 300, maxSizeMB: 0.03 },
      ])
    ).artifacts.map((a) => a.file);

    const loose = artifacts[0]!;
    const tight = artifacts[1]!;
    expect(tight.size).toBeLessThan(loose.size);
    expect(tight.size).toBeLessThanOrEqual(0.03 * 1024 * 1024);
  });
});
