import { describe, expect, it, vi } from "vitest";
import { PluginProvider } from "./plugin-provider";
import type { ProcessingPlugin } from "./types";
import { Plugin } from "./plugin";
import { emptyResult } from "../core/result";

function makePlugin(id: string, opts?: Record<string, unknown>): ProcessingPlugin<any> {
  return new Plugin({
    id,
    name: id,
    options: opts ?? {},
    supports: () => true,
    run: async () => emptyResult(),
  });
}

// ---------------------------------------------------------------------------
// Basic construction
// ---------------------------------------------------------------------------

describe("PluginProvider", () => {
  it("creates a provider from an array of plugins", () => {
    const a = makePlugin("audio-normalizer");
    const b = makePlugin("silence-trimmer");
    const pp = new PluginProvider([a, b]);
    expect(pp.plugins).toHaveLength(2);
  });

  it("exposes .plugins with registered plugins", () => {
    const p = makePlugin("test");
    const pp = new PluginProvider([p]);
    expect(pp.plugins).toContain(p);
  });

  it("exposes getPlugin to retrieve by id", () => {
    const p = makePlugin("my-plugin");
    const pp = new PluginProvider([p]);
    const found = pp.getPlugin("my-plugin");
    expect(found).toBe(p);
    expect(pp.getPlugin("does-not-exist")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Typed methods
// ---------------------------------------------------------------------------

describe("PluginProvider typed methods", () => {
  it("generates camelCase methods from kebab-case plugin ids", () => {
    const raw = makePlugin("raw-to-jpeg");
    const comp = makePlugin("jpeg-compressor", { quality: 80 });
    const pp = new PluginProvider([raw, comp]);
    expect(typeof (pp as any).rawToJpeg).toBe("function");
    expect(typeof (pp as any).jpegCompressor).toBe("function");
  });

  it("returns a TypedPluginRef from each method call", () => {
    const p = makePlugin("jpeg-compressor", { quality: 80 });
    const pp = new PluginProvider([p]);
    const ref = (pp as any).jpegCompressor({ variant: "thumb" });
    expect(ref.id).toBe("jpeg-compressor");
    expect(ref.opts).toEqual({ variant: "thumb" });
    expect(ref.defaults).toBe(p);
  });

  it("omits opts from the ref when no overrides given", () => {
    const p = makePlugin("raw-to-jpeg");
    const pp = new PluginProvider([p]);
    const ref = (pp as any).rawToJpeg();
    expect(ref.id).toBe("raw-to-jpeg");
    expect(ref.opts).toBeUndefined();
    expect(ref.defaults).toBe(p);
  });

  it("method return has access to the source plugin via .defaults", () => {
    const p = makePlugin("video-poster", { maxEdge: 640 });
    const pp = new PluginProvider([p]);
    const ref = (pp as any).videoPoster();
    expect(ref.defaults.options.maxEdge).toBe(640);
    expect(typeof ref.defaults.supports).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// Duplicate handling
// ---------------------------------------------------------------------------

describe("PluginProvider duplicate handling", () => {
  it("warns on duplicate ids and uses the last instance", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const a = makePlugin("dup");
    const b = makePlugin("dup");
    const pp = new PluginProvider([a, b]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Duplicate plugin id "dup"'));
    expect(pp.getPlugin("dup")).toBe(b);
    warn.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Integration: real plugin instances
// ---------------------------------------------------------------------------

describe("PluginProvider with real plugins", () => {
  it("works with the built-in pattern (with())", () => {
    const base = new Plugin({
      id: "audio-encoder",
      options: { variant: "mp3", bitrate: 128 },
      supports: () => true,
      run: async () => emptyResult(),
    });
    const mp3 = base.with({ variant: "mp3" }, { instanceId: "mp3" });
    const aac = base.with({ variant: "aac" }, { instanceId: "aac" });
    const pp = new PluginProvider([mp3, aac]);
    expect(pp.plugins).toHaveLength(2);
    // Converting "audio-encoder:mp3" → camelCase → "audioEncoderMp3"
    const ref1 = (pp as any).audioEncoderMp3();
    const ref2 = (pp as any).audioEncoderAac();
    expect(ref1.defaults.id).toContain("audio-encoder:mp3");
    expect(ref2.defaults.id).toContain("audio-encoder:aac");
  });
});

// ---------------------------------------------------------------------------
// Async/await safety
// ---------------------------------------------------------------------------

describe("PluginProvider async safety", () => {
  it("awaiting the provider does not silently hang (no then trap)", async () => {
    const p = makePlugin("test");
    const pp = new PluginProvider([p]);
    // The replacement of Proxy with explicit methods means `then` is undefined,
    // so `await` returns the value as-is instead of silently returning undefined.
    const awaited = await pp;
    expect(awaited).toBe(pp);
  });
});
