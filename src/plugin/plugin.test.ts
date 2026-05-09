import { describe, expect, it, vi } from "vitest";
import { Plugin } from "./plugin";
import { emptyResult } from "../core/result";
import type { FileClassification } from "./types";
import type { PipelineContext, PipelineSource } from "../core/types";

function source(name = "test.txt", type = "text/plain"): PipelineSource {
  return { file: new Blob(["x"], { type }), name, type };
}

function classif(overrides?: Partial<FileClassification>): FileClassification {
  return {
    ext: overrides?.ext ?? ".txt",
    mime: overrides?.mime ?? "text/plain",
    stemName: overrides?.stemName ?? "test",
    isVideo: overrides?.isVideo ?? false,
    isAudio: overrides?.isAudio ?? false,
    isSvg: overrides?.isSvg ?? false,
    size: overrides?.size ?? 0,
    lastModified: overrides?.lastModified ?? Date.now(),
  };
}

function ctx(): PipelineContext {
  const log = vi.fn();
  return { log, shared: new Map(), signal: undefined };
}

// ---------------------------------------------------------------------------
// Constructor
// ---------------------------------------------------------------------------

describe("Plugin constructor", () => {
  it("creates a plugin with id, name, options, supports", () => {
    const p = new Plugin({
      id: "my-plugin",
      options: { quality: 80 },
      supports: (f) => f.type?.startsWith("image/") ?? false,
      run: async () => emptyResult(),
    });
    expect(p.id).toBe("my-plugin");
    expect(p.name).toBe("my-plugin");
    expect(p.options).toEqual({ quality: 80 });
    expect(p.supports({ name: "x.jpg", type: "image/jpeg" })).toBe(true);
    expect(p.supports({ name: "x.txt", type: "text/plain" })).toBe(false);
  });

  it("uses custom name when provided", () => {
    const p = new Plugin({
      id: "p",
      name: "My Custom Plugin",
      options: {},
      supports: () => true,
      run: async () => emptyResult(),
    });
    expect(p.name).toBe("My Custom Plugin");
  });

  it("throws if neither createStages nor run is provided", () => {
    expect(
      () =>
        new Plugin({
          id: "bad",
          options: {},
          supports: () => true,
        } as any),
    ).toThrow();
  });

  it("accepts createStages returning multiple stages", () => {
    const p = new Plugin({
      id: "multi",
      options: {},
      supports: () => true,
      createStages: () => [
        { id: "a", run: async () => emptyResult() },
        { id: "b", run: async () => emptyResult() },
      ],
    });
    const stages = p.createStages(source(), {}, classif(), ctx());
    expect(stages).toHaveLength(2);
    expect(stages[0]!.id).toBe("a");
    expect(stages[1]!.id).toBe("b");
  });
});

// ---------------------------------------------------------------------------
// run shorthand
// ---------------------------------------------------------------------------

describe("run shorthand", () => {
  it("auto-wraps run into a single stage with the plugin's id", () => {
    const runFn = vi.fn(async () => emptyResult());
    const p = new Plugin({
      id: "auto-stage",
      options: {},
      supports: () => true,
      run: runFn,
    });
    const stages = p.createStages(source(), {}, classif(), ctx());
    expect(stages).toHaveLength(1);
    expect(stages[0]!.id).toBe("auto-stage");
  });

  it("passes input, opts, classif, ctx to the run function", async () => {
    const captured: any[] = [];
    const p = new Plugin({
      id: "capture",
      options: { mode: "test" as const },
      supports: () => true,
      run: async (input, opts, classif, ctx) => {
        captured.push({ input, opts, classif, ctx });
        return emptyResult();
      },
    });
    const src = source("test.txt");
    const cl = classif();
    const c = ctx();
    const stages = p.createStages(src, p.options, cl, c);
    await stages[0]!.run(src, c);
    expect(captured).toHaveLength(1);
    expect(captured[0]!.opts).toEqual({ mode: "test" });
    expect(captured[0]!.classif.ext).toBe(".txt");
  });
});

// ---------------------------------------------------------------------------
// .with()
// ---------------------------------------------------------------------------

describe(".with()", () => {
  it("creates a new plugin with merged options", () => {
    const base = new Plugin({
      id: "base",
      options: { quality: 80, maxSizeMB: 1 },
      supports: () => true,
      run: async () => emptyResult(),
    });
    const variant = base.with({ quality: 90 });
    expect(variant.options).toEqual({ quality: 90, maxSizeMB: 1 });
    expect(variant).not.toBe(base);
  });

  it("preserves sharedKeys from the base plugin", () => {
    const base = new Plugin({
      id: "base",
      options: {},
      sharedKeys: { output: "base:output" },
      supports: () => true,
      run: async () => emptyResult(),
    });
    const variant = base.with({});
    expect(variant.sharedKeys).toEqual({ output: "base:output" });
  });

  it("preserves supports function", () => {
    const base = new Plugin({
      id: "base",
      options: {},
      supports: (f) => f.name.endsWith(".jpg"),
      run: async () => emptyResult(),
    });
    const variant = base.with({});
    expect(variant.supports({ name: "x.jpg" })).toBe(true);
    expect(variant.supports({ name: "x.png" })).toBe(false);
  });

  it("preserves after/before constraints", () => {
    const base = new Plugin({
      id: "base",
      options: {},
      supports: () => true,
      after: ["other-plugin"],
      before: ["another-plugin"],
      run: async () => emptyResult(),
    });
    const variant = base.with({});
    expect(variant.after).toEqual(["other-plugin"]);
    expect(variant.before).toEqual(["another-plugin"]);
  });
});

// ---------------------------------------------------------------------------
// instanceId
// ---------------------------------------------------------------------------

describe(".with() instanceId", () => {
  it("uses `${id}:${instanceId}` as the new plugin id", () => {
    const base = new Plugin<{ variant: string }>({
      id: "encoder",
      options: { variant: "mp3" },
      supports: () => true,
      run: async () => emptyResult(),
    });
    const variant = base.with({ variant: "aac" }, { instanceId: "aac" });
    expect(variant.id).toBe("encoder:aac");
    expect(variant.name).toContain("aac");
  });

  it("creates stages with the instance-aware id", () => {
    const base = new Plugin<{ variant: string }>({
      id: "encoder",
      options: { variant: "mp3" },
      supports: () => true,
      run: async () => emptyResult(),
    });
    const v = base.with({ variant: "opus" }, { instanceId: "opus" });
    const stages = v.createStages(source(), v.options, classif(), ctx());
    expect(stages[0]!.id).toBe("encoder:opus");
  });

  it("each with() returns a distinct instance", () => {
    const base = new Plugin({
      id: "c",
      options: { quality: 80 },
      supports: () => true,
      run: async () => emptyResult(),
    });
    const a = base.with({ quality: 90 }, { instanceId: "hq" });
    const b = base.with({ quality: 70 }, { instanceId: "lq" });
    expect(a).not.toBe(b);
    expect(a.options.quality).toBe(90);
    expect(b.options.quality).toBe(70);
    expect(a.id).toBe("c:hq");
    expect(b.id).toBe("c:lq");
  });
});

// ---------------------------------------------------------------------------
// sharedKeys
// ---------------------------------------------------------------------------

describe("sharedKeys", () => {
  it("defaults to empty object when not provided", () => {
    const p = new Plugin({
      id: "no-keys",
      options: {},
      supports: () => true,
      run: async () => emptyResult(),
    });
    expect(p.sharedKeys).toEqual({});
  });

  it("returns the sharedKeys passed in constructor", () => {
    const p = new Plugin({
      id: "with-keys",
      options: {},
      supports: () => true,
      sharedKeys: { decoded: "raw-to-jpeg:decoded", output: "my:output" },
      run: async () => emptyResult(),
    });
    expect(p.sharedKeys.decoded).toBe("raw-to-jpeg:decoded");
    expect(p.sharedKeys.output).toBe("my:output");
  });
});

// ---------------------------------------------------------------------------
// preload
// ---------------------------------------------------------------------------

describe("preload", () => {
  it("calls the preload function when provided", () => {
    const fn = vi.fn();
    const p = new Plugin({
      id: "preloadable",
      options: {},
      supports: () => true,
      preload: fn,
      run: async () => emptyResult(),
    });
    p.preload();
    expect(fn).toHaveBeenCalledOnce();
  });

  it("does not throw when preload is not provided", () => {
    const p = new Plugin({
      id: "no-preload",
      options: {},
      supports: () => true,
      run: async () => emptyResult(),
    });
    expect(() => p.preload()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Integration: .with() + instanceId prevents duplicate stage warnings
// ---------------------------------------------------------------------------

describe("with() integration", () => {
  it("multi-instance plugins have unique ids", () => {
    const base = new Plugin<{ variant: string }>({
      id: "enc",
      options: { variant: "mp3" },
      supports: () => true,
      run: async () => emptyResult(),
    });
    const mp3 = base.with({ variant: "mp3" }, { instanceId: "mp3" });
    const aac = base.with({ variant: "aac" }, { instanceId: "aac" });
    expect(mp3.id).not.toBe(aac.id);
  });

  it("supports method works correctly after .with()", () => {
    const base = new Plugin({
      id: "filter",
      options: {},
      supports: (f) => f.name.endsWith(".wav"),
      run: async () => emptyResult(),
    });
    const v = base.with({}, { instanceId: "v1" });
    expect(v.supports({ name: "test.wav" })).toBe(true);
    expect(v.supports({ name: "test.mp3" })).toBe(false);
  });
});
