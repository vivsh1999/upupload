import { fileExtensionLower } from "./allowlist";
import { blobToArrayBuffer, jpegFileFromImageData } from "./rasterize";

async function optionalImport<TModule = unknown>(moduleName: string): Promise<TModule | null> {
  try {
    // Avoid bundlers trying to resolve optional dependencies at build time.
    // eslint-disable-next-line no-new-func
    const importer = new Function("m", "return import(m)") as (m: string) => Promise<TModule>;
    return await importer(moduleName);
  } catch {
    return null;
  }
}

export function isHeicLike(file: { name: string; type?: string | null }) {
  const ext = fileExtensionLower(file.name);
  const mime = (file.type ?? "").toLowerCase();
  return ext === ".heic" || ext === ".heif" || mime === "image/heic" || mime === "image/heif";
}

export function isTiffLike(file: { name: string; type?: string | null }) {
  const ext = fileExtensionLower(file.name);
  const mime = (file.type ?? "").toLowerCase();
  return ext === ".tif" || ext === ".tiff" || mime === "image/tiff";
}

/**
 * Try to decode HEIC/HEIF into a browser-decodable JPEG File.
 *
 * Uses optional dependencies if present:
 * - `heic-decode` (libheif-js) → ImageData → canvas → jpeg
 * - fallback: `heic2any` → jpeg blob
 */
export async function tryDecodeHeicToJpegFile(source: File): Promise<File | null> {
  // First: heic-decode (small, returns raw pixels)
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
      {
        quality: 0.92,
      },
    );
    if (out) return out;
  } catch {
    // optional dependency missing or decode failed
  }

  // Second: heic2any (large bundle, but works in many setups)
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

/**
 * Try to decode TIFF into a browser-decodable JPEG File using optional `utif`.
 */
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
      {
        quality: 0.92,
      },
    );
    return out;
  } catch {
    return null;
  }
}
