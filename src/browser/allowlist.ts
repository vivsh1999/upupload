/** Camera / cinema RAW extensions (often `application/octet-stream`). */
export const RAW_EXTENSIONS: Set<string> = new Set([
  ".r3d",
  ".braw",
  ".ari",
  ".dng",
  ".cr2",
  ".cr3",
  ".nef",
  ".arw",
  ".raf",
  ".rw2",
  ".orf",
  ".srw",
  ".pef",
  ".x3f",
]);

export const VIDEO_EXTENSIONS: ReadonlySet<string> = new Set([
  ".mp4",
  ".m4v",
  ".mkv",
  ".mov",
  ".webm",
  ".avi",
  ".wmv",
  ".mpg",
  ".mpeg",
  ".ogv",
  ".ts",
  ".m2ts",
  ".3gp",
  ".mxf",
]);

export const AUDIO_EXTENSIONS: ReadonlySet<string> = new Set([
  ".mp3",
  ".wav",
  ".flac",
  ".aac",
  ".m4a",
  ".ogg",
  ".opus",
  ".wma",
  ".aiff",
  ".aif",
]);

export const RASTER_IMAGE_EXTENSIONS: ReadonlySet<string> = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".bmp",
  ".tif",
  ".tiff",
  ".heic",
  ".heif",
  ".avif",
]);

export const VECTOR_IMAGE_EXTENSIONS: ReadonlySet<string> = new Set([".svg"]);

/** Extract the lowercase file extension from a filename. */
export function fileExtensionLower(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i).toLowerCase() : "";
}
