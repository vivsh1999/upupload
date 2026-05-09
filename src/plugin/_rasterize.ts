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

  const q = options?.quality ?? 0.92;
  const now = Date.now();

  if (HAS_OFFSCREEN_CANVAS) {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const imageData = makeImageData(data, width, height);
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

  const imageData = makeImageData(data, width, height);
  ctx.putImageData(imageData, 0, 0);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((b) => resolve(b), "image/jpeg", q);
  });
  if (!blob) return null;
  return new File([blob], filename, { type: "image/jpeg", lastModified: now });
}
