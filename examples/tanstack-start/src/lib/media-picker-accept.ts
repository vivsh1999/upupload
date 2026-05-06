/**
 * Broad `accept` for `<input type="file">` so the OS picker surfaces formats the
 * in-browser pipeline can handle (see `@vivsh1999/upupload` allowlist + optional
 * decoders: HEIC/TIFF, LibRaw RAW, raster JPEG/PNG/WebP/AVIF, video, audio).
 */
export const MEDIA_PICKER_ACCEPT = [
  "image/*",
  "video/*",
  "audio/*",
  ".heic",
  ".heif",
  ".avif",
  ".tif",
  ".tiff",
  ".cr2",
  ".cr3",
  ".nef",
  ".arw",
  ".dng",
  ".raf",
  ".rw2",
  ".orf",
  ".srw",
  ".pef",
  ".x3f",
  ".r3d",
  ".braw",
  ".ari",
].join(",");
