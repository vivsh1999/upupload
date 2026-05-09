import { describe, expect, it, vi } from "vitest";
import { emptyResult, artifact, warning, infoMessage } from "./result";
import {
  compose,
  stage,
  createTimingMiddleware,
  sharedGet,
  sharedSet,
  Pipeline,
  runPipelineFrom,
  flattenPipeline,
} from "./utils";
import type { PipelineContext, PipelineResult, PipelineSource } from "./types";
import { runPipeline } from "./runPipeline";

function source(name = "test.txt", type = "text/plain"): PipelineSource {
  return { file: new Blob(["x"], { type }), name, type };
}

function ctx(): PipelineContext {
  return { log: () => {}, shared: new Map() };
}

// ---------------------------------------------------------------------------
// result.ts
// ---------------------------------------------------------------------------

describe("emptyResult", () => {
  it("returns a PipelineResult with empty arrays and removeFromQueue: false", () => {
    const r = emptyResult();
    expect(r).toEqual({ artifacts: [], info: [], removeFromQueue: false });
    expect(r.skipGroup).toBeUndefined();
    expect(r.skipRemaining).toBeUndefined();
  });

  it("returns a fresh object each call", () => {
    expect(emptyResult()).not.toBe(emptyResult());
  });
});

describe("artifact", () => {
  it("builds a PipelineArtifact with given fields", () => {
    const blob = new Blob(["data"]);
    const a = artifact("thumb", blob, "thumb.jpg", "image/jpeg");
    expect(a.variant).toBe("thumb");
    expect(a.file).toBe(blob);
    expect(a.filename).toBe("thumb.jpg");
    expect(a.filetype).toBe("image/jpeg");
  });

  it("infers filetype from Blob type when omitted", () => {
    const blob = new Blob(["data"], { type: "image/png" });
    const a = artifact("png", blob, "img.png");
    expect(a.filetype).toBe("image/png");
  });

  it("defaults filetype to application/octet-stream when no type available", () => {
    const blob = new Blob(["data"], { type: "" });
    const a = artifact("raw", blob, "raw.bin");
    expect(a.filetype).toBe("application/octet-stream");
  });

  it("accepts extra options like relativePath and skip", () => {
    const blob = new Blob(["x"]);
    const a = artifact("opt", blob, "opt.jpg", "image/jpeg", {
      relativePath: "sub/opt.jpg",
      skip: true,
    });
    expect(a.relativePath).toBe("sub/opt.jpg");
    expect(a.skip).toBe(true);
  });
});

describe("warning", () => {
  it("returns a PipelineInfoMessage with level warn", () => {
    const w = warning("something went wrong", "ERR_001");
    expect(w).toEqual({ level: "warn", message: "something went wrong", code: "ERR_001" });
  });

  it("works without a code", () => {
    const w = warning("just a warning");
    expect(w.level).toBe("warn");
    expect(w.message).toBe("just a warning");
    expect(w.code).toBeUndefined();
  });
});

describe("infoMessage", () => {
  it("returns a PipelineInfoMessage with level info", () => {
    const m = infoMessage("all good", "OK");
    expect(m).toEqual({ level: "info", message: "all good", code: "OK" });
  });
});

// ---------------------------------------------------------------------------
// utils.ts
// ---------------------------------------------------------------------------

describe("compose", () => {
  it("concatenates stages from multiple definitions", () => {
    const def1 = stage("a", async () => emptyResult());
    const def2 = stage("b", async () => emptyResult());
    const merged = compose(def1, def2);
    expect(merged.stages.map((s) => s.id)).toEqual(["a", "b"]);
  });

  it("merges middleware arrays", () => {
    const mw1 = createTimingMiddleware();
    const mw2 = createTimingMiddleware();
    const a = { stages: [{ id: "x", run: async () => emptyResult() }], middleware: [mw1] };
    const b = { stages: [{ id: "y", run: async () => emptyResult() }], middleware: [mw2] };
    const merged = compose(a, b);
    expect(merged.middleware).toHaveLength(2);
    expect(merged.stages).toHaveLength(2);
  });

  it("omits middleware when none provided", () => {
    const a = { stages: [{ id: "x", run: async () => emptyResult() }] };
    const b = { stages: [{ id: "y", run: async () => emptyResult() }] };
    const merged = compose(a, b);
    expect(merged.middleware).toBeUndefined();
  });
});

describe("stage", () => {
  it("creates a single-stage definition from id + run", () => {
    const run = async () => emptyResult();
    const def = stage("test", run);
    expect(def.stages).toHaveLength(1);
    expect(def.stages[0]!.id).toBe("test");
    expect(def.stages[0]!.run).toBe(run);
  });

  it("creates a definition from a full stage object", () => {
    const run = async () => emptyResult();
    const def = stage({ id: "full", when: () => ({ run: true }), run });
    expect(def.stages).toHaveLength(1);
    expect(def.stages[0]!.id).toBe("full");
  });
});

describe("createTimingMiddleware", () => {
  it("wraps run and calls onTiming with the duration", async () => {
    const timings: [string, number][] = [];
    const mw = createTimingMiddleware((id, ms) => timings.push([id, ms]));
    const def = {
      stages: [{ id: "slow", run: async () => emptyResult() }],
      middleware: [mw],
    };
    await runPipeline(source(), def);
    expect(timings).toHaveLength(1);
    expect(timings[0]![0]).toBe("slow");
    expect(timings[0]![1]).toBeGreaterThanOrEqual(0);
  });

  it("does not require a callback", async () => {
    const mw = createTimingMiddleware();
    const def = { stages: [{ id: "x", run: async () => emptyResult() }], middleware: [mw] };
    await expect(runPipeline(source(), def)).resolves.toBeDefined();
  });
});

describe("sharedGet / sharedSet", () => {
  it("sharedSet writes and sharedGet reads typed values", () => {
    const map = new Map<string, unknown>();
    sharedSet(map, "key1", 42);
    sharedSet(map, "key2", "hello");
    expect(sharedGet<number>(map, "key1")).toBe(42);
    expect(sharedGet<string>(map, "key2")).toBe("hello");
  });

  it("sharedGet returns undefined for missing keys", () => {
    const map = new Map<string, unknown>();
    expect(sharedGet<string>(map, "missing")).toBeUndefined();
  });
});

describe("Pipeline / runPipelineFrom", () => {
  it("executes a nestable pipeline factory", async () => {
    const p = Pipeline((_ctx, _src) => [{ id: "stage1", run: async () => emptyResult() }]);
    const result = await runPipelineFrom(source(), p);
    expect(result.artifacts).toEqual([]);
  });

  it("flattens nested sub-pipelines", async () => {
    const inner = Pipeline((_ctx, _src) => [{ id: "inner", run: async () => emptyResult() }]);
    const outer = Pipeline((ctx, src) => [
      { id: "outer", run: async () => emptyResult() },
      ...inner(ctx, src),
    ]);
    const result = await runPipelineFrom(source(), outer);
    expect(result.artifacts).toEqual([]);
  });

  it("pre-populates shared state via factory before stages run", async () => {
    const p = Pipeline((ctx, _src) => {
      ctx.shared.set("preloaded", true);
      return [
        {
          id: "check",
          run: async (_input, ctx) => {
            const val = sharedGet<boolean>(ctx.shared, "preloaded");
            return val
              ? emptyResult()
              : {
                  artifacts: [],
                  info: [{ level: "warn", message: "not preloaded" }],
                  removeFromQueue: false,
                };
          },
        },
      ];
    });
    const result = await runPipelineFrom(source(), p);
    expect(result.info).toHaveLength(0);
  });
});

describe("flattenPipeline", () => {
  it("flattens nested pipelines into a flat stage array", () => {
    const inner = Pipeline((_ctx, _src) => [{ id: "inner", run: async () => emptyResult() }]);
    const outer = Pipeline((ctx, src) => [
      { id: "outer", run: async () => emptyResult() },
      ...inner(ctx, src),
    ]);
    const c = ctx();
    const stages = flattenPipeline(outer(c, source()), c, source());
    expect(stages.map((s) => s.id)).toEqual(["outer", "inner"]);
  });

  it("returns stages as-is for non-pipeline nodes", () => {
    const c = ctx();
    const stages = flattenPipeline([{ id: "a", run: async () => emptyResult() }], c, source());
    expect(stages).toHaveLength(1);
    expect(stages[0]!.id).toBe("a");
  });
});
