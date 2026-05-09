type LibRawImagePayload = {
  data: Uint8ClampedArray | Uint8Array;
  width: number;
  height: number;
  colors?: number;
  bits?: number;
};

type LibRawCtor = new () => {
  open: (data: Uint8Array, settings?: Record<string, unknown>) => Promise<void>;
  imageData: () => Promise<LibRawImagePayload>;
  close?: () => Promise<void> | void;
  delete?: () => Promise<void> | void;
  recycle?: () => Promise<void> | void;
  free?: () => Promise<void> | void;
};

const LW = "libraw-wasm";

let libRawCtorPromise: Promise<LibRawCtor> | null = null;

function getLibRawCtor() {
  if (!libRawCtorPromise) {
    libRawCtorPromise = import(LW).then((m: { default: LibRawCtor }) => m.default);
  }
  return libRawCtorPromise;
}

export function preloadRawDecoder() {
  void getLibRawCtor();
}

const HAS_OFFSCREEN_CANVAS = typeof OffscreenCanvas !== "undefined";

const NOOP_LOG: (message: string, extra?: unknown) => void = () => {};

function rgbaImageDataFromRgbOrRgba(
  pixels: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
): ImageData | null {
  const n = width * height;
  const need3 = n * 3;
  const need4 = n * 4;
  if (pixels.length < need3 && pixels.length < need4) return null;

  if (pixels.length >= need4) {
    if (pixels instanceof Uint8ClampedArray && pixels.length === need4) {
      const img = new ImageData(width, height);
      img.data.set(pixels);
      return img;
    }
    const out = new Uint8ClampedArray(need4);
    out.set(pixels.subarray(0, need4));
    return new ImageData(out, width, height);
  }

  const out = new Uint8ClampedArray(n * 4);
  let src = 0;
  let dst = 0;
  for (let i = 0; i < n; i++) {
    out[dst] = pixels[src]!;
    out[dst + 1] = pixels[src + 1]!;
    out[dst + 2] = pixels[src + 2]!;
    out[dst + 3] = 255;
    src += 3;
    dst += 4;
  }
  return new ImageData(out, width, height);
}

async function rasterFileFromDecodedPixels(
  pixels: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  filename: string,
  outputQuality: number,
): Promise<File | null> {
  const imageData = rgbaImageDataFromRgbOrRgba(pixels, width, height);
  if (!imageData) return null;

  const q = Math.min(1, Math.max(0.7, outputQuality));
  const now = Date.now();

  if (HAS_OFFSCREEN_CANVAS) {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.putImageData(imageData, 0, 0);
      try {
        const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: q });
        return new File([blob], filename, { type: "image/jpeg", lastModified: now });
      } catch {}
    }
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.putImageData(imageData, 0, 0);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/jpeg", q),
  );
  if (!blob) return null;
  return new File([blob], filename, { type: "image/jpeg", lastModified: now });
}

const defaultLibRawOpenSettings: Record<string, unknown> = {
  outputColor: 1,
  outputBps: 8,
  useCameraWb: true,
  useCameraMatrix: 1,
  userQual: 3,
  halfSize: false,
};

export async function decodeCameraRawToJpegFile(
  source: File,
  options: { outFilename: string; outputQuality?: number; debug?: boolean },
): Promise<File | null> {
  const log: (message: string, extra?: unknown) => void = options.debug
    ? (message, extra) => console.info("[raw-decode]", message, extra ?? "")
    : NOOP_LOG;

  let raw: InstanceType<LibRawCtor> | null = null;
  try {
    const LibRaw = await getLibRawCtor();
    raw = new LibRaw();
    let buffer: Uint8Array | null = new Uint8Array(await source.arrayBuffer());
    await raw.open(buffer, defaultLibRawOpenSettings);
    buffer = null;
    const img = (await raw.imageData()) as LibRawImagePayload;
    const width = img.width;
    const height = img.height;
    const pixels = img.data;

    if (!width || !height || !pixels?.length) {
      log("LibRaw imageData missing dimensions or buffer.", img);
      return null;
    }

    if (pixels.length < width * height * 3) {
      log("Pixel buffer smaller than expected", { width, height, length: pixels.length });
      return null;
    }

    return await rasterFileFromDecodedPixels(
      pixels,
      width,
      height,
      options.outFilename,
      options.outputQuality ?? 0.98,
    );
  } catch (err) {
    log("LibRaw WASM threw.", err);
    return null;
  } finally {
    if (raw) {
      await Promise.all([raw.close?.(), raw.delete?.(), raw.recycle?.(), raw.free?.()]);
    }
  }
}
