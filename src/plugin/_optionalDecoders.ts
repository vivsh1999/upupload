import { blobToArrayBuffer, jpegFileFromImageData } from "./_rasterize";

async function optionalImport<TModule = unknown>(moduleName: string): Promise<TModule | null> {
  try {
    return await import(moduleName);
  } catch {
    return null;
  }
}

export async function tryDecodeHeicToJpegFile(source: File): Promise<File | null> {
  try {
    const mod = await optionalImport<{ default: unknown }>("heic-decode");
    if (!mod) throw new Error("missing");
    const decode = mod.default as unknown as (options: { buffer: ArrayBuffer }) => Promise<{
      width: number;
      height: number;
      data: Uint8ClampedArray;
    }>;
    const buffer = await blobToArrayBuffer(source);
    const img = await decode({ buffer });
    const out = await jpegFileFromImageData(
      img,
      `${source.name.replace(/\.(heic|heif)$/i, "")}.jpg`,
      { quality: 0.92 },
    );
    if (out) return out;
  } catch {}

  try {
    const mod = await optionalImport<{ default: unknown }>("heic2any");
    if (!mod) throw new Error("missing");
    const heic2any = mod.default as unknown as (options: {
      blob: Blob;
      toType?: string;
      quality?: number;
    }) => Promise<Blob | Blob[]>;
    const outBlob = await heic2any({ blob: source, toType: "image/jpeg", quality: 0.92 });
    const blob = Array.isArray(outBlob) ? outBlob[0] : outBlob;
    if (!blob) return null;
    return new File([blob], `${source.name.replace(/\.(heic|heif)$/i, "")}.jpg`, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } catch {
    return null;
  }
}

export async function tryDecodeTiffToJpegFile(source: File): Promise<File | null> {
  try {
    const UTIF = await optionalImport<any>("utif");
    if (!UTIF) throw new Error("missing");
    const buffer = await blobToArrayBuffer(source);
    const ifds = UTIF.decode(buffer);
    const first = ifds?.[0];
    if (!first) return null;
    UTIF.decodeImage(buffer, first);
    const rgba = UTIF.toRGBA8(first);
    const width = Number(first.width || first.t256);
    const height = Number(first.height || first.t257);
    if (!width || !height || !rgba?.length) return null;
    const data = new Uint8ClampedArray(
      rgba.buffer.slice(rgba.byteOffset, rgba.byteOffset + rgba.byteLength),
    );
    const out = await jpegFileFromImageData(
      { data, width, height },
      `${source.name.replace(/\.(tif|tiff)$/i, "")}.jpg`,
      { quality: 0.92 },
    );
    return out;
  } catch {
    return null;
  }
}
