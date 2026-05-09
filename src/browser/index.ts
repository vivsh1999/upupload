/** @module browser */
export * from "./allowlist";
export * from "./pipeline";
export type { FileClassification, ProcessingPlugin } from "../plugin/types";
export { Plugin } from "../plugin/plugin";
export { PluginProvider } from "../plugin/plugin-provider";
export type { TypedPluginRef } from "../plugin/plugin-provider";
export { audioBufferToWav, acquireAudioContext, isMediaRecorderSupported } from "./audio";
export { isOffscreenCanvasSupported, createCanvas } from "./canvas";
