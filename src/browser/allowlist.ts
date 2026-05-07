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

/** Whether this file may be uploaded at all (folder drops may include junk). */
export function isSupportedMediaUpload(file: { name: string; type?: string | null }): boolean {
  const mime = (file.type ?? "").toLowerCase();

  if (mime.startsWith("video/")) return true;
  if (mime.startsWith("audio/")) return true;
  if (mime.startsWith("image/")) return true;
  if (mime !== "" && mime !== "application/octet-stream") return false;

  const ext = fileExtensionLower(file.name);
  return (
    VIDEO_EXTENSIONS.has(ext) ||
    AUDIO_EXTENSIONS.has(ext) ||
    RASTER_IMAGE_EXTENSIONS.has(ext) ||
    VECTOR_IMAGE_EXTENSIONS.has(ext) ||
    RAW_EXTENSIONS.has(ext)
  );
}

/** Upload as original bytes (no JPEG transcode). */
export function isVideoLike(file: { name: string; type?: string | null }): boolean {
  const ext = fileExtensionLower(file.name);
  const mime = (file.type ?? "").toLowerCase();
  return mime.startsWith("video/") || VIDEO_EXTENSIONS.has(ext);
}

/** Whether the file looks like audio (by extension or MIME). */
export function isAudioLike(file: { name: string; type?: string | null }): boolean {
  const ext = fileExtensionLower(file.name);
  const mime = (file.type ?? "").toLowerCase();
  return mime.startsWith("audio/") || AUDIO_EXTENSIONS.has(ext);
}

/** Whether the file type should be uploaded as-is without JPEG transcoding. */
export function shouldUploadWithoutTranscode(file: {
  name: string;
  type?: string | null;
}): boolean {
  const ext = fileExtensionLower(file.name);
  const mime = (file.type ?? "").toLowerCase();

  if (mime.startsWith("video/") || mime.startsWith("audio/")) return true;
  if (VIDEO_EXTENSIONS.has(ext) || AUDIO_EXTENSIONS.has(ext)) return true;
  if (mime === "image/svg+xml" || VECTOR_IMAGE_EXTENSIONS.has(ext)) return true;
  return false;
}

/** Raster / RAW images that should become JPEG before upload. */
export function shouldCompressToJpeg(file: { name: string; type?: string | null }): boolean {
  const ext = fileExtensionLower(file.name);
  const mime = (file.type ?? "").toLowerCase();

  if (mime.startsWith("video/") || mime.startsWith("audio/")) return false;
  if (VIDEO_EXTENSIONS.has(ext) || AUDIO_EXTENSIONS.has(ext)) return false;
  if (mime === "image/svg+xml" || VECTOR_IMAGE_EXTENSIONS.has(ext)) return false;
  if (mime.startsWith("image/")) return true;
  if (RAW_EXTENSIONS.has(ext)) return true;
  if (RASTER_IMAGE_EXTENSIONS.has(ext)) return true;

  return false;
}

/** Whether the file is a camera RAW image (by extension). */
export function isCameraRawImage(file: { name: string; type?: string | null }): boolean {
  return RAW_EXTENSIONS.has(fileExtensionLower(file.name));
}

/** Whether the file is HEIC/HEIF (by extension or MIME). */
export function isHeicLike(file: { name: string; type?: string | null }): boolean {
  const ext = fileExtensionLower(file.name);
  const mime = (file.type ?? "").toLowerCase();
  return ext === ".heic" || ext === ".heif" || mime === "image/heic" || mime === "image/heif";
}

/** Whether the file is TIFF (by extension or MIME). */
export function isTiffLike(file: { name: string; type?: string | null }): boolean {
  const ext = fileExtensionLower(file.name);
  const mime = (file.type ?? "").toLowerCase();
  return ext === ".tif" || ext === ".tiff" || mime === "image/tiff";
}
