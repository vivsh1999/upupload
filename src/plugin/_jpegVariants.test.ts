import { beforeEach, describe, expect, it, vi } from "vitest";
import { encodeJpegVariants } from "./_jpegVariants";

const canvases = vi.hoisted(
  () =>
    [] as Array<{
      width: number;
      height: number;
      drawImage: ReturnType<typeof vi.fn>;
      toBlob: ReturnType<typeof vi.fn>;
    }>,
);

vi.mock("../browser/canvas", () => ({
  createCanvas: vi.fn((width: number, height: number) => {
    const drawImage = vi.fn();
    const toBlob = vi.fn(async () => new Blob(["encoded"], { type: "image/jpeg" }));
    canvases.push({ width, height, drawImage, toBlob });
    return {
      canvas: { width, height },
      getContext: () => ({ drawImage }),
      toBlob,
    };
  }),
}));

const createImageBitmapMock = vi.fn();

function source(): Blob {
  return new Blob(["source"], { type: "image/jpeg" });
}

describe("encodeJpegVariants", () => {
  beforeEach(() => {
    canvases.length = 0;
    createImageBitmapMock.mockReset();
    createImageBitmapMock.mockResolvedValue({ width: 4032, height: 3024, close: vi.fn() });
    vi.stubGlobal("createImageBitmap", createImageBitmapMock);
  });

  it("returns nothing and decodes nothing for an empty job list", async () => {
    await expect(encodeJpegVariants(source(), [])).resolves.toEqual([]);
    expect(createImageBitmapMock).not.toHaveBeenCalled();
  });

  it("decodes once and encodes every variant from that single decode", async () => {
    const result = await encodeJpegVariants(source(), [
      { variant: "web", filename: "photo.web.jpg", quality: 0.82, maxLongEdge: 2560 },
      { variant: "thumb", filename: "photo.thumb.jpg", quality: 0.6, maxLongEdge: 400 },
    ]);

    expect(createImageBitmapMock).toHaveBeenCalledTimes(1);
    expect(createImageBitmapMock).toHaveBeenCalledWith(expect.any(Blob), {
      imageOrientation: "from-image",
    });
    expect(canvases).toHaveLength(2);
    expect(result.map((item) => item.variant)).toEqual(["web", "thumb"]);
    expect(result.map((item) => item.filename)).toEqual(["photo.web.jpg", "photo.thumb.jpg"]);
    expect(result[0]!.file).toBeInstanceOf(File);
    expect(result[0]!.file.type).toBe("image/jpeg");
  });

  it("resizes each variant from the shared decode to its own longest edge", async () => {
    await encodeJpegVariants(source(), [
      { variant: "web", filename: "photo.web.jpg", quality: 0.82, maxLongEdge: 2560 },
      { variant: "thumb", filename: "photo.thumb.jpg", quality: 0.6, maxLongEdge: 400 },
      { variant: "full", filename: "photo.full.jpg", quality: 0.9 },
    ]);

    // 4032×3024 source, aspect preserved.
    expect(canvases[0]!.width).toBe(2560);
    expect(canvases[0]!.height).toBe(1920);
    expect(canvases[1]!.width).toBe(400);
    expect(canvases[1]!.height).toBe(300);
    expect(canvases[2]!.width).toBe(4032);
    expect(canvases[2]!.height).toBe(3024);

    for (const canvas of canvases) {
      expect(canvas.drawImage).toHaveBeenCalledWith(
        expect.anything(),
        0,
        0,
        canvas.width,
        canvas.height,
      );
    }
  });

  it("bisects quality down when a variant exceeds its maxSizeMB", async () => {
    // Every encode is oversized, so the search must run and settle on the smallest.
    let size = 5_000_000;
    canvases.length = 0;
    const { createCanvas } = await import("../browser/canvas");
    vi.mocked(createCanvas).mockImplementation((width: number, height: number) => {
      const drawImage = vi.fn();
      const toBlob = vi.fn(async (_type: string, quality: number) => {
        const bytes = Math.round(size * quality);
        return new Blob([new Uint8Array(Math.min(bytes, 1000))], { type: "image/jpeg" });
      });
      canvases.push({ width, height, drawImage, toBlob });
      return { canvas: { width, height }, getContext: () => ({ drawImage }), toBlob } as any;
    });

    const result = await encodeJpegVariants(source(), [
      { variant: "thumb", filename: "photo.thumb.jpg", quality: 0.9, maxSizeMB: 0.0001 },
    ]);

    expect(result).toHaveLength(1);
    // initial encode + bisection re-encodes
    expect(canvases[0]!.toBlob.mock.calls.length).toBeGreaterThan(1);
    size = 0;
  });

  it("falls back to an <img> decode when createImageBitmap is unavailable", async () => {
    vi.stubGlobal("createImageBitmap", undefined);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

    class MockImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      naturalWidth = 800;
      naturalHeight = 600;
      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal("Image", MockImage);

    const result = await encodeJpegVariants(source(), [
      { variant: "thumb", filename: "photo.thumb.jpg", quality: 0.6, maxLongEdge: 400 },
    ]);

    expect(createImageBitmapMock).not.toHaveBeenCalled();
    expect(canvases[0]!.width).toBe(400);
    expect(canvases[0]!.height).toBe(300);
    expect(result).toHaveLength(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock");
  });
});
