import { bench, describe } from "vitest";
import {
  isAudioLike,
  isCameraRawImage,
  isSupportedMediaUpload,
  isVideoLike,
  shouldCompressToJpeg,
  shouldUploadWithoutTranscode,
} from "../browser/allowlist";
import { isHeicLike, isTiffLike } from "../browser/optionalDecoders";

describe("isSupportedMediaUpload", () => {
  const video = { name: "clip.mov", type: "video/quicktime" };
  const raw = { name: "still.cr3", type: "application/octet-stream" };
  const svg = { name: "graphic.svg", type: "image/svg+xml" };
  const raster = { name: "photo.png", type: "image/png" };
  const audio = { name: "track.mp3", type: "audio/mpeg" };
  const junk = { name: "readme.txt", type: "text/plain" };

  bench("video (MIME match)", () => {
    isSupportedMediaUpload(video);
  });
  bench("RAW octet-stream (extension match)", () => {
    isSupportedMediaUpload(raw);
  });
  bench("SVG (MIME match)", () => {
    isSupportedMediaUpload(svg);
  });
  bench("raster image (MIME match)", () => {
    isSupportedMediaUpload(raster);
  });
  bench("audio (MIME match)", () => {
    isSupportedMediaUpload(audio);
  });
  bench("reject (text/plain)", () => {
    isSupportedMediaUpload(junk);
  });
});

describe("isVideoLike", () => {
  bench("by MIME", () => {
    isVideoLike({ name: "clip.mov", type: "video/quicktime" });
  });
  bench("by extension", () => {
    isVideoLike({ name: "clip.mp4", type: "application/octet-stream" });
  });
  bench("false (image)", () => {
    isVideoLike({ name: "photo.png", type: "image/png" });
  });
});

describe("isAudioLike", () => {
  bench("by MIME", () => {
    isAudioLike({ name: "track.flac", type: "audio/flac" });
  });
  bench("by extension", () => {
    isAudioLike({ name: "track.mp3", type: "application/octet-stream" });
  });
  bench("false (image)", () => {
    isAudioLike({ name: "photo.png", type: "image/png" });
  });
});

describe("isCameraRawImage", () => {
  const extensions = [
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
  ];
  bench("RAW extension — true", () => {
    for (const ext of extensions) {
      isCameraRawImage({ name: `photo${ext}`, type: "application/octet-stream" });
    }
  });
  bench("non-RAW extension — false", () => {
    isCameraRawImage({ name: "photo.jpg", type: "image/jpeg" });
  });
});

describe("isHeicLike", () => {
  bench(".heic extension — true", () => {
    isHeicLike({ name: "photo.heic", type: "application/octet-stream" });
  });
  bench("image/heif MIME — true", () => {
    isHeicLike({ name: "photo.unknown", type: "image/heif" });
  });
  bench("false (PNG)", () => {
    isHeicLike({ name: "photo.png", type: "image/png" });
  });
});

describe("isTiffLike", () => {
  bench(".tif extension — true", () => {
    isTiffLike({ name: "scan.tif", type: "application/octet-stream" });
  });
  bench(".tiff extension — true", () => {
    isTiffLike({ name: "scan.tiff", type: "application/octet-stream" });
  });
  bench("image/tiff MIME — true", () => {
    isTiffLike({ name: "scan.unknown", type: "image/tiff" });
  });
  bench("false (JPEG)", () => {
    isTiffLike({ name: "photo.jpg", type: "image/jpeg" });
  });
});

describe("shouldUploadWithoutTranscode", () => {
  bench("video — true", () => {
    shouldUploadWithoutTranscode({ name: "clip.mov", type: "video/quicktime" });
  });
  bench("audio — true", () => {
    shouldUploadWithoutTranscode({ name: "track.flac", type: "audio/flac" });
  });
  bench("SVG — true", () => {
    shouldUploadWithoutTranscode({ name: "graphic.svg", type: "image/svg+xml" });
  });
  bench("raster PNG — false", () => {
    shouldUploadWithoutTranscode({ name: "photo.png", type: "image/png" });
  });
});

describe("shouldCompressToJpeg", () => {
  bench("RAW extension — true", () => {
    shouldCompressToJpeg({ name: "still.cr3", type: "application/octet-stream" });
  });
  bench("raster PNG — true", () => {
    shouldCompressToJpeg({ name: "photo.png", type: "image/png" });
  });
  bench("SVG — false", () => {
    shouldCompressToJpeg({ name: "graphic.svg", type: "image/svg+xml" });
  });
  bench("audio — false", () => {
    shouldCompressToJpeg({ name: "track.mp3", type: "audio/mpeg" });
  });
});
