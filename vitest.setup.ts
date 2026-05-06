import type { Canvas } from "canvas";

declare global {
  // eslint-disable-next-line no-var
  var __MEDIA_PIPELINE_DOM_CANVAS: boolean | undefined;
}

/**
 * jsdom does not implement canvas 2d / toBlob. When native `canvas` (node-canvas)
 * is installed and built for the current platform, back DOM canvases so image
 * code can run under Vitest. If bindings are missing, RAW-related benchmarks
 * are skipped.
 */
globalThis.__MEDIA_PIPELINE_DOM_CANVAS = await (async (): Promise<boolean> => {
  try {
    const { createCanvas } = await import("canvas");
    const probe = createCanvas(1, 1).getContext("2d");
    if (!probe) return false;

    const backing = new WeakMap<HTMLCanvasElement, Canvas>();

    function ensureBacking(el: HTMLCanvasElement): Canvas {
      const w = Math.max(1, el.width || 300);
      const h = Math.max(1, el.height || 150);
      let c = backing.get(el);
      if (!c) {
        c = createCanvas(w, h);
        backing.set(el, c);
      } else if (c.width !== w || c.height !== h) {
        c.width = w;
        c.height = h;
      }
      return c;
    }

    const proto = globalThis.HTMLCanvasElement?.prototype;
    if (!proto) return false;

    proto.getContext = function (this: HTMLCanvasElement, type: string, ...args: unknown[]) {
      if (type === "2d") {
        const c = ensureBacking(this);
        return c.getContext("2d", ...(args as [])) as CanvasRenderingContext2D | null;
      }
      return null;
    };

    proto.toBlob = function (
      this: HTMLCanvasElement,
      callback: (blob: Blob | null) => void,
      type?: string,
      quality?: number,
    ) {
      const c = backing.get(this);
      if (!c) {
        callback(null);
        return;
      }
      try {
        const mime = type || "image/png";
        if (mime === "image/jpeg" || mime === "image/jpg") {
          const q = quality === undefined ? 0.92 : quality;
          const buf = c.toBuffer("image/jpeg", { quality: q });
          callback(new Blob([buf], { type: mime }));
          return;
        }
        const buf = c.toBuffer("image/png");
        callback(new Blob([buf], { type: mime }));
      } catch {
        callback(null);
      }
    };

    return true;
  } catch {
    return false;
  }
})();
