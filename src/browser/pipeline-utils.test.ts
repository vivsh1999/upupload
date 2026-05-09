import { describe, expect, it } from "vitest";
import {
  resolvePluginRefs,
  resolvePipeline,
  validatePipeline,
  PIPELINE_CURRENT_KEY,
  PIPELINE_CLASSIF_KEY,
  info,
  stem,
  toJpegName,
  toThumbName,
} from "./pipeline-utils";
import type { PipelineDef, PipelinePlugin, PluginRef } from "./pipeline-utils";
import type { ProcessingPlugin } from "../plugin/types";
import { Plugin } from "../plugin/plugin";
import { emptyResult } from "../core/result";
import type { PipelineSource } from "../core/types";

function plugin(id: string, supportedExt = ".jpg"): ProcessingPlugin<any> {
  return new Plugin({
    id,
    options: {},
    supports: (f) => f.name.endsWith(supportedExt),
    run: async () => emptyResult(),
  });
}

function source(name = "test.jpg", type = "image/jpeg"): PipelineSource {
  return { file: new Blob(["x"], { type }), name, type };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe("PIPELINE_CURRENT_KEY", () => {
  it("is the well-known string", () => {
    expect(PIPELINE_CURRENT_KEY).toBe("pipeline:current");
  });
});

describe("PIPELINE_CLASSIF_KEY", () => {
  it("is the well-known string", () => {
    expect(PIPELINE_CLASSIF_KEY).toBe("pipeline:classif");
  });
});

// ---------------------------------------------------------------------------
// info, stem, toJpegName, toThumbName
// ---------------------------------------------------------------------------

describe("info", () => {
  it("creates a PipelineInfoMessage with level, message, code", () => {
    expect(info("warn", "test", "T1")).toEqual({ level: "warn", message: "test", code: "T1" });
  });
  it("works without a code", () => {
    expect(info("info", "no code")).toEqual({ level: "info", message: "no code" });
  });
});

describe("stem", () => {
  it("returns the name without extension", () => {
    expect(stem("photo.jpg")).toBe("photo");
    expect(stem("archive.tar.gz")).toBe("archive.tar");
    expect(stem("noext")).toBe("noext");
  });
});

describe("toJpegName", () => {
  it("replaces extension with .jpg", () => {
    expect(toJpegName("photo.png")).toBe("photo.jpg");
    expect(toJpegName("img.heic")).toBe("img.jpg");
  });
});

describe("toThumbName", () => {
  it("replaces extension with .thumb.jpg", () => {
    expect(toThumbName("photo.png")).toBe("photo.thumb.jpg");
  });
});

// ---------------------------------------------------------------------------
// resolvePluginRefs
// ---------------------------------------------------------------------------

describe("resolvePluginRefs", () => {
  it("returns bare plugin instances as-is", () => {
    const p = plugin("my-plugin");
    const result = resolvePluginRefs([p]);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(p);
  });

  it("resolves a PluginRef to a plugin via defaults", () => {
    const p = plugin("jpeg-compressor");
    const ref: PluginRef = { id: "jpeg-compressor", opts: { variant: "thumb" }, defaults: p };
    const result = resolvePluginRefs([ref]);
    expect(result).toHaveLength(1);
    expect(result[0]!.options.variant).toBe("thumb");
  });

  it("resolves a PluginRef via registry lookup when defaults is absent", () => {
    const p = plugin("jpeg-compressor");
    const ref: PluginRef = { id: "jpeg-compressor", opts: { quality: 85 } };
    const result = resolvePluginRefs([ref], [p]);
    expect(result).toHaveLength(1);
  });

  it("throws when a PluginRef cannot be resolved", () => {
    const ref: PluginRef = { id: "missing-plugin" };
    expect(() => resolvePluginRefs([ref])).toThrow("missing-plugin");
  });

  it("uses .with() when the resolved plugin is a Plugin instance", () => {
    const p = plugin("my-plugin");
    const ref: PluginRef = { id: "my-plugin", opts: { quality: 95 }, defaults: p };
    const result = resolvePluginRefs([ref]);
    expect(result).toHaveLength(1);
    // Should have merged options
    expect(result[0]!.options.quality).toBe(95);
  });
});

// ---------------------------------------------------------------------------
// resolvePipeline
// ---------------------------------------------------------------------------

describe("resolvePipeline", () => {
  it("finds the first matching pipeline for a file", () => {
    const p = plugin("compressor");
    const defs: PipelineDef[] = [
      { id: "images", supports: (f) => f.type.startsWith("image/"), plugins: [p] },
    ];
    const result = resolvePipeline(defs, source("x.jpg", "image/jpeg"));
    expect(result).not.toBeNull();
    expect(result!.def.id).toBe("images");
    expect(result!.plugins).toHaveLength(1);
  });

  it("returns null when no pipeline matches", () => {
    const p = plugin("compressor");
    const defs: PipelineDef[] = [
      { id: "images", supports: (f) => f.type.startsWith("image/"), plugins: [p] },
    ];
    const result = resolvePipeline(defs, source("x.txt", "text/plain"));
    expect(result).toBeNull();
  });

  it("descends into nested pipelines to find the deepest match", () => {
    const p = plugin("compressor");
    const defs: PipelineDef[] = [
      {
        id: "media",
        pipelines: [
          {
            id: "photos",
            supports: (f) => f.type.startsWith("image/"),
            plugins: [p],
          },
        ],
      },
    ];
    const result = resolvePipeline(defs, source("x.jpg", "image/jpeg"));
    expect(result).not.toBeNull();
    expect(result!.def.id).toBe("photos");
  });

  it("skips parent pipelines that don't match when descending", () => {
    const p = plugin("compressor");
    const defs: PipelineDef[] = [
      {
        id: "media",
        supports: (f) => f.type.startsWith("image/"),
        pipelines: [{ id: "photos", plugins: [p] }],
      },
    ];
    const result = resolvePipeline(defs, source("x.txt", "text/plain"));
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// validatePipeline
// ---------------------------------------------------------------------------

describe("validatePipeline", () => {
  it("passes for a valid pipeline", () => {
    const defs: PipelineDef[] = [
      { id: "a", plugins: [{ id: "p" } as any] },
      { id: "b", pipelines: [{ id: "c", plugins: [{ id: "q" } as any] }] },
    ];
    expect(() => validatePipeline(defs)).not.toThrow();
  });

  it("throws on duplicate pipeline ids at the same level", () => {
    const defs: PipelineDef[] = [
      { id: "dup", plugins: [{ id: "p" } as any] },
      { id: "dup", plugins: [{ id: "q" } as any] },
    ];
    expect(() => validatePipeline(defs)).toThrow(/duplicate/i);
  });

  it("throws on duplicate pipeline ids in nested levels", () => {
    const defs: PipelineDef[] = [
      { id: "root", pipelines: [{ id: "dup", plugins: [{ id: "p" } as any] }] },
      { id: "dup", plugins: [{ id: "q" } as any] },
    ];
    expect(() => validatePipeline(defs)).toThrow(/duplicate/i);
  });

  it("throws on a pipeline with no plugins and no sub-pipelines", () => {
    const defs: PipelineDef[] = [{ id: "empty" }];
    expect(() => validatePipeline(defs)).toThrow(/no plugins/);
  });

  it("throws on a null plugin in the plugins array", () => {
    const defs: PipelineDef[] = [{ id: "bad", plugins: [null as any] }];
    expect(() => validatePipeline(defs)).toThrow(/null/);
  });
});
