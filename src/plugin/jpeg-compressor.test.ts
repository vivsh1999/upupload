import { beforeEach, describe, expect, it, vi } from "vitest";
import { jpegCompressor } from "./jpeg-compressor";
import { encodeJpegVariants } from "./_jpegVariants";
import { compressVariantsInWorker, isOffscreenWorkerSupported } from "../browser/worker-client";
import { mockFileClassification, mockPipelineContext, mockPipelineSource } from "./test-utils";

const imageCompression = vi.fn();

vi.mock("browser-image-compression", () => ({
  default: (...args: unknown[]) => imageCompression(...args),
}));

vi.mock("./_jpegVariants", () => ({ encodeJpegVariants: vi.fn() }));

vi.mock("../browser/worker-client", () => ({
  isOffscreenWorkerSupported: vi.fn(() => false),
  compressImageInWorker: vi.fn(),
  compressVariantsInWorker: vi.fn(),
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
    vi.mocked(encodeJpegVariants).mockReset();
    vi.mocked(compressVariantsInWorker).mockReset();
    vi.mocked(isOffscreenWorkerSupported).mockReset().mockReturnValue(false);
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

  describe("multi-variant mode", () => {
    it("emits one artifact per configured variant from a single decode", async () => {
      vi.mocked(encodeJpegVariants).mockImplementation(async (_input, jobs) =>
        jobs.map((job) => ({
          variant: job.variant,
          filename: job.filename,
          file: new File([job.variant], job.filename, { type: "image/jpeg" }),
        })),
      );

      const result = await runCompressor({
        variants: [
          { variant: "outputFile", quality: 82, maxLongEdge: 2560, maxSizeMB: 1 },
          { variant: "thumb", quality: 60, maxLongEdge: 400, maxSizeMB: 0.25 },
        ],
      });

      expect(result.artifacts.map((a) => a.variant)).toEqual(["outputFile", "thumb"]);
      expect(result.artifacts.map((a) => a.filename)).toEqual([
        "mock.outputFile.jpg",
        "mock.thumb.jpg",
      ]);

      // The whole point: one decode for both variants → one encoder call.
      expect(encodeJpegVariants).toHaveBeenCalledTimes(1);
      const [, jobs] = vi.mocked(encodeJpegVariants).mock.calls[0]!;
      expect(jobs).toEqual([
        {
          variant: "outputFile",
          filename: "mock.outputFile.jpg",
          quality: 0.82,
          maxLongEdge: 2560,
          maxSizeMB: 1,
        },
        {
          variant: "thumb",
          filename: "mock.thumb.jpg",
          quality: 0.6,
          maxLongEdge: 400,
          maxSizeMB: 0.25,
        },
      ]);
      // The single-variant browser-image-compression path is not used at all.
      expect(imageCompression).not.toHaveBeenCalled();
    });

    it("falls back to the plugin options for unspecified variant fields", async () => {
      vi.mocked(encodeJpegVariants).mockResolvedValue([]);

      await runCompressor({ variants: [{ variant: "thumb" }] });

      const [, jobs] = vi.mocked(encodeJpegVariants).mock.calls[0]!;
      expect(jobs).toEqual([
        {
          variant: "thumb",
          filename: "mock.thumb.jpg",
          quality: 0.82,
          maxLongEdge: 2560,
          maxSizeMB: 1,
        },
      ]);
    });

    it("encodes variants through the worker pool when useWorker is enabled", async () => {
      vi.mocked(isOffscreenWorkerSupported).mockReturnValue(true);
      vi.mocked(compressVariantsInWorker).mockResolvedValue([
        { variant: "thumb", filename: "photo.thumb.jpg", blob: new Blob(["t"]) },
      ]);

      const result = await runCompressor(
        { variants: [{ variant: "thumb", quality: 60, maxLongEdge: 400 }] },
        mockPipelineContext({ shared: new Map([["pipeline:useWorker", true]]) }),
      );

      expect(compressVariantsInWorker).toHaveBeenCalledTimes(1);
      expect(encodeJpegVariants).not.toHaveBeenCalled();
      expect(result.artifacts[0]!.variant).toBe("thumb");
    });

    it("falls back to the main thread when the worker pool rejects", async () => {
      vi.mocked(isOffscreenWorkerSupported).mockReturnValue(true);
      vi.mocked(compressVariantsInWorker).mockRejectedValue(new Error("no worker"));
      vi.mocked(encodeJpegVariants).mockImplementation(async (_input, jobs) =>
        jobs.map((job) => ({
          variant: job.variant,
          filename: job.filename,
          file: new File([job.variant], job.filename, { type: "image/jpeg" }),
        })),
      );

      const result = await runCompressor(
        { variants: [{ variant: "web" }] },
        mockPipelineContext({ shared: new Map([["pipeline:useWorker", true]]) }),
      );

      expect(encodeJpegVariants).toHaveBeenCalledTimes(1);
      expect(result.artifacts).toHaveLength(1);
    });

    it("warns instead of throwing when variant encoding fails outright", async () => {
      vi.mocked(encodeJpegVariants).mockRejectedValue(new Error("decode failed"));

      const result = await runCompressor({ variants: [{ variant: "web" }] });

      expect(result.artifacts).toHaveLength(0);
      expect(result.info[0]?.code).toBe("variant_failed");
      expect(result.removeFromQueue).toBe(false);
    });
  });
});
