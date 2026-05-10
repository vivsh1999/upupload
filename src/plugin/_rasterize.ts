export function blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  return blob.arrayBuffer();
}

const HAS_OFFSCREEN_CANVAS = typeof OffscreenCanvas !== "undefined";

function makeImageData(data: Uint8ClampedArray, width: number, height: number): ImageData {
  const img = new ImageData(width, height);
  img.data.set(data);
  return img;
}

export async function jpegFileFromImageData(
  image: { data: Uint8ClampedArray; width: number; height: number },
  filename: string,
  options?: { quality?: number },
): Promise<File | null> {
  const { width, height, data } = image;
  if (!width || !height || !data?.length) return null;

  return encodeCanvasToJpeg(
    { width, height },
    filename,
    (_canvas, ctx) => {
      const imageData = makeImageData(data, width, height);
      ctx.putImageData(imageData, 0, 0);
    },
    options,
  );
}

async function encodeCanvasToJpeg(
  dims: { width: number; height: number },
  filename: string,
  draw: (
    canvas: HTMLCanvasElement | OffscreenCanvas,
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  ) => void,
  options?: { quality?: number },
): Promise<File | null> {
  const { width, height } = dims;
  const q = options?.quality ?? 0.92;
  const now = Date.now();

  if (HAS_OFFSCREEN_CANVAS) {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (ctx) {
      draw(canvas, ctx);
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

  draw(canvas, ctx);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((b) => resolve(b), "image/jpeg", q);
  });
  if (!blob) return null;
  return new File([blob], filename, { type: "image/jpeg", lastModified: now });
}

/**
 * Compress an image blob to JPEG using Canvas API.
 * Used as fallback when `browser-image-compression` is unavailable.
 * Supports max dimension constraint and iterative quality reduction for max size.
 */
export async function jpegFileFromBlob(
  blob: Blob,
  filename: string,
  options?: {
    quality?: number;
    maxWidthOrHeight?: number;
    maxSizeBytes?: number;
  },
): Promise<File | null> {
  const q = options?.quality ?? 0.92;
  const maxDim = options?.maxWidthOrHeight;
  const maxBytes = options?.maxSizeBytes;

  let imgBitmap: ImageBitmap | null = null;
  let imgElement: HTMLImageElement | null = null;
  let naturalWidth: number;
  let naturalHeight: number;

  try {
    imgBitmap = await createImageBitmap(blob);
    naturalWidth = imgBitmap.width;
    naturalHeight = imgBitmap.height;
  } catch {
    imgElement = await loadImageElement(blob);
    naturalWidth = imgElement.naturalWidth;
    naturalHeight = imgElement.naturalHeight;
  }

  let w = naturalWidth;
  let h = naturalHeight;

  if (maxDim && maxDim > 0) {
    if (w > h) {
      if (w > maxDim) {
        h = Math.round((h * maxDim) / w);
        w = maxDim;
      }
    } else {
      if (h > maxDim) {
        w = Math.round((w * maxDim) / h);
        h = maxDim;
      }
    }
  }

  const draw = (
    _canvas: HTMLCanvasElement | OffscreenCanvas,
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  ) => {
    if (imgBitmap) {
      ctx.drawImage(imgBitmap, 0, 0, w, h);
    } else if (imgElement) {
      ctx.drawImage(imgElement, 0, 0, w, h);
    }
  };

  const targetQ = maxBytes ? await findQualityForSize(w, h, draw, maxBytes, q) : q;
  const result = await encodeCanvasToJpeg({ width: w, height: h }, filename, draw, {
    quality: targetQ,
  });

  imgBitmap?.close();
  return result;
}

async function findQualityForSize(
  width: number,
  height: number,
  draw: (
    canvas: HTMLCanvasElement | OffscreenCanvas,
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  ) => void,
  maxBytes: number,
  initialQ: number,
): Promise<number> {
  if (initialQ <= 0.05) return initialQ;

  let low = 0.05;
  let high = Math.min(initialQ, 0.95);
  let bestQ = high;
  const imageType = "image/jpeg";

  for (let iter = 0; iter < 10; iter++) {
    const mid = (low + high) / 2;
    let size: number;

    if (HAS_OFFSCREEN_CANVAS) {
      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext("2d");
      if (!ctx) break;
      draw(canvas, ctx);
      try {
        const b = await canvas.convertToBlob({ type: imageType, quality: mid });
        size = b.size;
      } catch {
        break;
      }
    } else {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) break;
      draw(canvas, ctx);
      size = await new Promise<number>((resolve) => {
        canvas.toBlob((b) => resolve(b?.size ?? 0), imageType, mid);
      });
    }

    if (size === 0) break;

    if (size <= maxBytes) {
      bestQ = mid;
      low = mid + 0.01;
    } else {
      high = mid - 0.01;
    }

    if (low >= high) break;
  }

  return bestQ;
}

function loadImageElement(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to decode image"));
    img.src = URL.createObjectURL(blob);
  });
}
