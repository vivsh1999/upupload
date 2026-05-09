/** @module plugins */
export type { FileClassification, ProcessingPlugin } from "./types";
export { Plugin } from "./plugin";
export { rawToJpeg } from "./raw-to-jpeg";
export type { RawToJpegPluginOptions } from "./raw-to-jpeg";
export { jpegCompressor } from "./jpeg-compressor";
export type { JpegCompressorPluginOptions } from "./jpeg-compressor";
export { videoPoster } from "./video-poster";
export type { VideoPosterPluginOptions } from "./video-poster";
export { PluginProvider } from "./plugin-provider";
export type { TypedPluginRef } from "./plugin-provider";
