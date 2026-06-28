/** @module browser/canvas */

export function isOffscreenCanvasSupported(): boolean {
  return typeof OffscreenCanvas !== "undefined";
}

export function createCanvas(
  width: number,
  height: number,
): {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  getContext: () => CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  toBlob: (type?: string, quality?: number) => Promise<Blob | null>;
} {
  const useOffscreen = isOffscreenCanvasSupported();
  const canvas = useOffscreen
    ? new OffscreenCanvas(width, height)
    : (() => {
        const c = document.createElement("canvas");
        c.width = width;
        c.height = height;
        return c;
      })();

  return {
    canvas,
    getContext: () =>
      canvas.getContext("2d") as
        | CanvasRenderingContext2D
        | OffscreenCanvasRenderingContext2D
        | null,
    toBlob: async (type = "image/png", quality?: number) => {
      if (canvas instanceof OffscreenCanvas) {
        return canvas.convertToBlob({ type, ...(quality !== undefined ? { quality } : {}) });
      }
      return new Promise<Blob | null>((resolve) =>
        (canvas as HTMLCanvasElement).toBlob((b) => resolve(b), type, quality),
      );
    },
  };
}
