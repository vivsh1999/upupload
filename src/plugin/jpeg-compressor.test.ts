import { beforeEach, describe, expect, it, vi } from "vitest";
import { jpegCompressor } from "./jpeg-compressor";
import { mockFileClassification, mockPipelineContext, mockPipelineSource } from "./test-utils";

const imageCompression = vi.fn();

vi.mock("browser-image-compression", () => ({
  default: (...args: unknown[]) => imageCompression(...args),
}));

function compressedFile(): File {
  return new File([new Uint8Array([1, 2, 3])], "photo.jpg", { type: "image/jpeg" });
}

async function runCompressor(
  overrides: Parameters<typeof jpegCompressor.with>[0] = {},
  ctx = mockPipelineContext(),
) {
  const plugin = jpegCompressor.with({
    quality: 82,
    maxLongEdge: 2560,
    maxSizeMB: 1,
    ...overrides,
  });
  const source = mockPipelineSource({ name: "photo.jpg", type: "image/jpeg" });
  const classif = mockFileClassification({ ext: ".jpg", mime: "image/jpeg" });
  const stages = plugin.createStages(source, plugin.options, classif, ctx);
  return stages[0]!.run(source, ctx);
}

describe("jpeg-compressor", () => {
  beforeEach(() => {
    imageCompression.mockReset();
    imageCompression.mockResolvedValue(compressedFile());
  });

  it("passes the configured options through to browser-image-compression", async () => {
    await runCompressor();

    const [, options] = imageCompression.mock.calls[0]!;
    expect(options).toMatchObject({
      maxSizeMB: 1,
      maxWidthOrHeight: 2560,
      useWebWorker: true,
      maxIteration: 12,
      fileType: "image/jpeg",
      initialQuality: 0.82,
    });
  });

  it("forwards libURL and exifOrientation when provided", async () => {
    await runCompressor({
      libURL: "https://example.test/browser-image-compression.js",
      exifOrientation: 6,
    });

    const [, options] = imageCompression.mock.calls[0]!;
    expect(options).toMatchObject({
      libURL: "https://example.test/browser-image-compression.js",
      exifOrientation: 6,
    });
  });

  it("omits libURL and exifOrientation when not configured", async () => {
    await runCompressor();

    const [, options] = imageCompression.mock.calls[0]!;
    expect(options).not.toHaveProperty("libURL");
    expect(options).not.toHaveProperty("exifOrientation");
  });

  it("honours useWebWorker and maxIteration overrides", async () => {
    await runCompressor({ useWebWorker: false, maxIteration: 4 });

    const [, options] = imageCompression.mock.calls[0]!;
    expect(options).toMatchObject({ useWebWorker: false, maxIteration: 4 });
  });

  it("emits an artifact for the configured variant", async () => {
    const result = await runCompressor({ variant: "thumb" });

    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts[0]!.variant).toBe("thumb");
  });

  it("does not match non-image files", () => {
    expect(jpegCompressor.supports({ name: "notes.txt", type: "text/plain" })).toBe(false);
  });
});
