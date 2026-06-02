import { describe, expect, it, vi } from "vitest";
import { runDefaultBrowserPipeline } from "./pipeline";
import { PIPELINE_CURRENT_KEY, PIPELINE_CLASSIF_KEY } from "./pipeline-utils";
import { Plugin } from "../plugin/plugin";
import { emptyResult, artifact } from "../core/result";
import type { PipelineSource } from "../core/types";

function source(name = "photo.jpg", type = "image/jpeg"): PipelineSource {
  return { file: new File(["fake-image-data"], name, { type }), name, type };
}

function audioSource(name = "track.mp3", type = "audio/mpeg"): PipelineSource {
  return { file: new File(["fake-audio"], name, { type }), name, type };
}

function videoSource(name = "clip.mp4", type = "video/mp4"): PipelineSource {
  return { file: new File(["fake-video"], name, { type }), name, type };
}

// ---------------------------------------------------------------------------
// Default behavior
// ---------------------------------------------------------------------------

describe("runDefaultBrowserPipeline", () => {
  it("returns original artifact even with no plugins", async () => {
    const result = await runDefaultBrowserPipeline(source(), {});
    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts[0]!.variant).toBe("original");
  });

  it("removes from queue for non-media files", async () => {
    const result = await runDefaultBrowserPipeline(
      {
        file: new File(["x"], "notes.txt", { type: "text/plain" }),
        name: "notes.txt",
        type: "text/plain",
      },
      {},
    );
    expect(result.removeFromQueue).toBe(true);
  });

  it("passes source through for media files", async () => {
    const result = await runDefaultBrowserPipeline(source(), {});
    expect(result.removeFromQueue).toBe(false);
    expect(result.artifacts).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Plugin execution
// ---------------------------------------------------------------------------

describe("plugin execution", () => {
  it("executes matched plugins and includes their artifacts", async () => {
    const testPlugin = new Plugin({
      id: "test-plugin",
      options: {},
      supports: (f) => f.type?.startsWith("image/") ?? false,
      run: async () => ({
        artifacts: [artifact("test-variant", new Blob(["out"]), "out.jpg", "image/jpeg")],
        info: [],
        removeFromQueue: false,
      }),
    });

    const result = await runDefaultBrowserPipeline(source(), {}, { plugins: [testPlugin] });
    expect(result.artifacts.map((a) => a.variant)).toContain("test-variant");
  });

  it("skips plugins that don't match the file", async () => {
    const fn = vi.fn();
    const testPlugin = new Plugin({
      id: "audio-only",
      options: {},
      supports: (f) => f.type?.startsWith("audio/") ?? false,
      run: async () => {
        fn();
        return emptyResult();
      },
    });

    await runDefaultBrowserPipeline(
      source("photo.jpg", "image/jpeg"),
      {},
      { plugins: [testPlugin] },
    );
    expect(fn).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Pipeline definitions
// ---------------------------------------------------------------------------

describe("pipeline definitions", () => {
  it("selects the matching pipeline definition", async () => {
    const audioP = new Plugin({
      id: "audio-plugin",
      options: {},
      supports: () => true,
      run: async () => ({
        artifacts: [artifact("audio-out", new Blob(["a"]), "a.mp3", "audio/mpeg")],
        info: [],
        removeFromQueue: false,
      }),
    });

    const result = await runDefaultBrowserPipeline(
      audioSource(),
      {},
      {
        plugins: [audioP],
        pipeline: [
          {
            id: "audio-pipe",
            supports: (f) => f.type.startsWith("audio/"),
            plugins: [{ id: "audio-plugin", defaults: audioP }],
          },
        ],
      },
    );
    expect(result.artifacts.map((a) => a.variant)).toContain("audio-out");
  });

  it("returns removeFromQueue when no pipeline matches", async () => {
    const result = await runDefaultBrowserPipeline(
      source(),
      {},
      {
        pipeline: [{ id: "audio-only", supports: (f) => f.type.startsWith("audio/"), plugins: [] }],
      },
    );
    expect(result.removeFromQueue).toBe(true);
    expect(result.info).toHaveLength(1);
    expect(result.info[0]!.code).toBe("no_pipeline");
  });
});

// ---------------------------------------------------------------------------
// Shared context: PIPELINE_CURRENT_KEY
// ---------------------------------------------------------------------------

describe("PIPELINE_CURRENT_KEY", () => {
  it("is set by the original stage", async () => {
    const checkPlugin = new Plugin({
      id: "check-plugin",
      options: {},
      supports: () => true,
      run: async (input, _opts, _classif, ctx) => {
        const current = ctx.shared.get(PIPELINE_CURRENT_KEY) as Blob | undefined;
        if (current) {
          return {
            artifacts: [artifact("checked", current, input.name, input.type)],
            info: [],
            removeFromQueue: false,
          };
        }
        return emptyResult();
      },
    });

    const result = await runDefaultBrowserPipeline(source(), {}, { plugins: [checkPlugin] });
    // The check plugin should have produced an artifact from the shared context
    const checked = result.artifacts.find((a) => a.variant === "checked");
    expect(checked).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Shared context: PIPELINE_CLASSIF_KEY
// ---------------------------------------------------------------------------

describe("PIPELINE_CLASSIF_KEY", () => {
  it("is available in shared context during stage run", async () => {
    const checkPlugin = new Plugin({
      id: "classif-check",
      options: {},
      supports: () => true,
      run: async (_input, _opts, _classif, ctx) => {
        const classif = ctx.shared.get(PIPELINE_CLASSIF_KEY) as any;
        if (classif && classif.ext === ".jpg") {
          return {
            artifacts: [artifact("classif-ok", new Blob(["ok"]), "ok.jpg", "image/jpeg")],
            info: [],
            removeFromQueue: false,
          };
        }
        return emptyResult();
      },
    });

    const result = await runDefaultBrowserPipeline(
      source("photo.jpg", "image/jpeg"),
      {},
      { plugins: [checkPlugin] },
    );
    expect(result.artifacts.map((a) => a.variant)).toContain("classif-ok");
  });
});

// ---------------------------------------------------------------------------
// Video / Audio file handling
// ---------------------------------------------------------------------------

describe("media type handling", () => {
  it("processes video files", async () => {
    const posterPlugin = new Plugin({
      id: "video-poster",
      options: {},
      supports: (f) => f.type?.startsWith("video/") ?? false,
      run: async () => ({
        artifacts: [artifact("poster", new Blob(["img"]), "poster.jpg", "image/jpeg")],
        info: [],
        removeFromQueue: false,
      }),
    });

    const result = await runDefaultBrowserPipeline(videoSource(), {}, { plugins: [posterPlugin] });
    expect(result.artifacts.map((a) => a.variant)).toContain("poster");
  });

  it("processes audio files", async () => {
    const audioPlugin = new Plugin({
      id: "audio-tagger",
      options: {},
      supports: (f) => f.type?.startsWith("audio/") ?? false,
      run: async () => ({
        artifacts: [artifact("tagged", new Blob(["meta"]), "tagged.mp3", "audio/mpeg")],
        info: [],
        removeFromQueue: false,
      }),
    });

    const result = await runDefaultBrowserPipeline(audioSource(), {}, { plugins: [audioPlugin] });
    expect(result.artifacts.map((a) => a.variant)).toContain("tagged");
  });
});

// ---------------------------------------------------------------------------
// Debug logging
// ---------------------------------------------------------------------------

describe("debug logging", () => {
  it("processes normally when debug is enabled", async () => {
    const result = await runDefaultBrowserPipeline(source(), { logLevel: "debug" });
    expect(result.removeFromQueue).toBe(false);
    expect(result.artifacts).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// AbortSignal
// ---------------------------------------------------------------------------

describe("AbortSignal", () => {
  it("aborts mid-pipeline and returns partial result", async () => {
    const controller = new AbortController();
    controller.abort();

    const result = await runDefaultBrowserPipeline(source(), {}, { signal: controller.signal });
    expect(result).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Plugin ordering (topological sort)
// ---------------------------------------------------------------------------

describe("plugin ordering", () => {
  it("runs after/before constraints in correct order", async () => {
    const order: string[] = [];

    const first = new Plugin({
      id: "first-plugin",
      options: {},
      supports: () => true,
      run: async () => {
        order.push("first");
        return emptyResult();
      },
    });

    const second = new Plugin({
      id: "second-plugin",
      options: {},
      supports: () => true,
      after: ["first-plugin"],
      run: async () => {
        order.push("second");
        return emptyResult();
      },
    });

    await runDefaultBrowserPipeline(source(), {}, { plugins: [second, first] });
    expect(order).toEqual(["first", "second"]);
  });
});
