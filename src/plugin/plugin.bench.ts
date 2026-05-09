import { bench, describe } from "vitest";
import { Plugin } from "./plugin";
import { PluginProvider } from "./plugin-provider";
import { emptyResult } from "../core/result";

// ---------------------------------------------------------------------------
// Plugin class
// ---------------------------------------------------------------------------

describe("Plugin class", () => {
  const basePlugin = new Plugin({
    id: "bench-plugin",
    options: { quality: 80 },
    supports: () => true,
    run: async () => emptyResult(),
  });

  bench("new Plugin() with run shorthand", () => {
    new Plugin({
      id: "p",
      options: {},
      supports: () => true,
      run: async () => emptyResult(),
    });
  });

  bench("Plugin.supports()", () => {
    basePlugin.supports({ name: "test.jpg", type: "image/jpeg" });
  });

  bench("Plugin.with()", () => {
    basePlugin.with({ quality: 90 });
  });

  bench("Plugin.with() with instanceId", () => {
    basePlugin.with({ quality: 90 }, { instanceId: "hq" });
  });

  bench("Plugin.createStages()", () => {
    const ctx = { log: () => {}, shared: new Map() };
    basePlugin.createStages(
      { file: new Blob(), name: "x", type: "image/jpeg" },
      { quality: 80 },
      {
        ext: ".jpg",
        mime: "image/jpeg",
        stemName: "x",
        isVideo: false,
        isAudio: false,
        isSvg: false,
        size: 0,
        lastModified: 0,
      },
      ctx as any,
    );
  });
});

// ---------------------------------------------------------------------------
// PluginProvider
// ---------------------------------------------------------------------------

describe("PluginProvider", () => {
  const a = new Plugin({
    id: "alpha",
    options: {},
    supports: () => true,
    run: async () => emptyResult(),
  });
  const b = new Plugin({
    id: "beta-compressor",
    options: { quality: 80 },
    supports: () => true,
    run: async () => emptyResult(),
  });
  const c = new Plugin({
    id: "gamma-decoder",
    options: {},
    supports: () => true,
    run: async () => emptyResult(),
  });

  bench("new PluginProvider()", () => {
    new PluginProvider([a, b, c]);
  });

  bench("PluginProvider camelCase method", () => {
    const pp = new PluginProvider([a, b, c]);
    (pp as any).betaCompressor({ variant: "thumb" });
  });

  bench("PluginProvider.getPlugin() — found", () => {
    const pp = new PluginProvider([a, b, c]);
    pp.getPlugin("beta-compressor");
  });

  bench("PluginProvider.getPlugin() — not found", () => {
    const pp = new PluginProvider([a, b, c]);
    pp.getPlugin("nonexistent");
  });
});
