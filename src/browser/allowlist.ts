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

const VIDEO_EXTENSIONS = new Set([
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

const AUDIO_EXTENSIONS = new Set([
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

const RASTER_IMAGE_EXTENSIONS = new Set([
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

const VECTOR_IMAGE_EXTENSIONS = new Set([".svg"]);

/** Extract the lowercase file extension from a filename. */
export function fileExtensionLower(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i).toLowerCase() : "";
}

/** Whether this file may be uploaded at all (folder drops may include junk). */
export function isSupportedMediaUpload(file: { name: string; type?: string | null }): boolean {
  const ext = fileExtensionLower(file.name);
  const mime = (file.type ?? "").toLowerCase();

  if (mime.startsWith("video/")) return true;
  if (mime.startsWith("audio/")) return true;
  if (mime.startsWith("image/")) return true;

  if (
    VIDEO_EXTENSIONS.has(ext) ||
    AUDIO_EXTENSIONS.has(ext) ||
    RASTER_IMAGE_EXTENSIONS.has(ext) ||
    VECTOR_IMAGE_EXTENSIONS.has(ext) ||
    RAW_EXTENSIONS.has(ext)
  ) {
    return true;
  }

  if (mime === "application/octet-stream") {
    return (
      VIDEO_EXTENSIONS.has(ext) ||
      AUDIO_EXTENSIONS.has(ext) ||
      RASTER_IMAGE_EXTENSIONS.has(ext) ||
      VECTOR_IMAGE_EXTENSIONS.has(ext) ||
      RAW_EXTENSIONS.has(ext)
    );
  }

  return false;
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
  if (shouldUploadWithoutTranscode(file)) return false;

  const ext = fileExtensionLower(file.name);
  const mime = (file.type ?? "").toLowerCase();

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
