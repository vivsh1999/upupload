export async function blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  return await blob.arrayBuffer();
}

function hasOffscreenCanvas() {
  return typeof OffscreenCanvas !== "undefined";
}

export async function jpegFileFromImageData(
  image: { data: Uint8ClampedArray; width: number; height: number },
  filename: string,
  options?: { quality?: number },
): Promise<File | null> {
  const { width, height, data } = image;
  if (!width || !height || !data?.length) return null;

  const q = options?.quality ?? 0.92;

  if (hasOffscreenCanvas()) {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const imageData = ctx.createImageData(width, height);
      imageData.data.set(data);
      ctx.putImageData(imageData, 0, 0);
      try {
        const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: q });
        return new File([blob], filename, { type: "image/jpeg", lastModified: Date.now() });
      } catch {}
    }
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const imageData = ctx.createImageData(width, height);
  imageData.data.set(data);
  ctx.putImageData(imageData, 0, 0);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((b) => resolve(b), "image/jpeg", q);
  });
  if (!blob) return null;
  return new File([blob], filename, { type: "image/jpeg", lastModified: Date.now() });
}
