import { describe, expect, it } from "vitest";
import { isOffscreenCanvasSupported, createCanvas } from "./canvas";

const HAS_CANVAS_2D = (() => {
  try {
    const c = document.createElement("canvas");
    return !!c.getContext("2d");
  } catch {
    return false;
  }
})();

describe("isOffscreenCanvasSupported", () => {
  it("returns a boolean", () => {
    const result = isOffscreenCanvasSupported();
    expect(typeof result).toBe("boolean");
  });
});

describe("createCanvas", () => {
  it("returns an object with canvas, getContext, and toBlob", () => {
    const result = createCanvas(100, 200);
    expect(result.canvas).toBeDefined();
    expect(typeof result.getContext).toBe("function");
    expect(typeof result.toBlob).toBe("function");
  });

  it("creates a canvas with the specified dimensions", () => {
    const { canvas } = createCanvas(640, 480);
    expect(canvas.width).toBe(640);
    expect(canvas.height).toBe(480);
  });

  it.skipIf(!HAS_CANVAS_2D)("getContext returns a 2d rendering context", () => {
    const { getContext } = createCanvas(100, 100);
    const cctx = getContext();
    expect(cctx).toBeTruthy();
  });

  it.skipIf(!HAS_CANVAS_2D)("toBlob produces a PNG blob", async () => {
    const { getContext, toBlob } = createCanvas(50, 50);
    const cctx = getContext()!;
    cctx.fillStyle = "red";
    cctx.fillRect(0, 0, 50, 50);
    const blob = await toBlob("image/png");
    expect(blob).toBeInstanceOf(Blob);
    expect(blob!.type).toBe("image/png");
  });

  it.skipIf(!HAS_CANVAS_2D)("toBlob produces a JPEG blob with quality", async () => {
    const { getContext, toBlob } = createCanvas(50, 50);
    const cctx = getContext()!;
    cctx.fillStyle = "blue";
    cctx.fillRect(0, 0, 50, 50);
    const blob = await toBlob("image/jpeg", 0.8);
    expect(blob).toBeInstanceOf(Blob);
  });
});
