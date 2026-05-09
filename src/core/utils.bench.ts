import { bench, describe } from "vitest";
import { compose, stage, sharedGet, sharedSet, createTimingMiddleware, Pipeline, flattenPipeline, runPipelineFrom } from "./utils";
import type { PipelineContext, PipelineSource, PipelineStage, PipelineResult } from "./types";

const ctx: PipelineContext = { log: () => {}, shared: new Map() };
const source: PipelineSource = { file: new Blob(["x"]), name: "x.txt", type: "text/plain" };

// ---------------------------------------------------------------------------
// compose / stage
// ---------------------------------------------------------------------------

describe("compose / stage", () => {
  bench("stage() by id+run", () => {
    stage("test", async () => ({ artifacts: [], info: [], removeFromQueue: false }));
  });

  bench("compose() 3 defs", () => {
    const a = stage("a", async () => ({ artifacts: [], info: [], removeFromQueue: false }));
    const b = stage("b", async () => ({ artifacts: [], info: [], removeFromQueue: false }));
    const c = stage("c", async () => ({ artifacts: [], info: [], removeFromQueue: false }));
    compose(a, b, c);
  });
});

// ---------------------------------------------------------------------------
// sharedGet / sharedSet
// ---------------------------------------------------------------------------

describe("sharedGet / sharedSet", () => {
  const map = new Map<string, unknown>();

  bench("sharedSet + sharedGet", () => {
    sharedSet(map, "key", "value");
    sharedGet<string>(map, "key");
  });
});

// ---------------------------------------------------------------------------
// createTimingMiddleware
// ---------------------------------------------------------------------------

describe("createTimingMiddleware", () => {
  const stage: PipelineStage<PipelineSource, PipelineResult> = {
    id: "test",
    run: async () => ({ artifacts: [], info: [], removeFromQueue: false }),
  };

  bench("wrap and run — no callback", async () => {
    const mw = createTimingMiddleware();
    const wrapped = mw(stage, 0, [stage]);
    await wrapped.run(source, ctx);
  });

  bench("wrap and run — with callback", async () => {
    const cb = (_id: string, _ms: number) => {};
    const mw = createTimingMiddleware(cb);
    const wrapped = mw(stage, 0, [stage]);
    await wrapped.run(source, ctx);
  });
});

// ---------------------------------------------------------------------------
// Pipeline factory
// ---------------------------------------------------------------------------

describe("Pipeline factory", () => {
  bench("Pipeline() — 3 stages", () => {
    Pipeline((_ctx, _source) => [
      { id: "a", run: async () => ({ artifacts: [], info: [], removeFromQueue: false }) },
      { id: "b", run: async () => ({ artifacts: [], info: [], removeFromQueue: false }) },
      { id: "c", run: async () => ({ artifacts: [], info: [], removeFromQueue: false }) },
    ]);
  });
});

// ---------------------------------------------------------------------------
// flattenPipeline
// ---------------------------------------------------------------------------

describe("flattenPipeline", () => {
  bench("10 flat stages", () => {
    const nodes: PipelineStage<PipelineSource, PipelineResult>[] = [];
    for (let i = 0; i < 10; i++) {
      nodes.push({
        id: `s${i}`,
        run: async () => ({ artifacts: [], info: [], removeFromQueue: false }),
      });
    }
    flattenPipeline(nodes, ctx, source);
  });

  bench("3 nested sub-pipelines (depth 3)", () => {
    const inner3 = Pipeline((_ctx, _source) => [
      { id: "i3", run: async () => ({ artifacts: [], info: [], removeFromQueue: false }) },
    ]);
    const inner2 = Pipeline((_ctx, _source) => [
      { id: "i2", run: async () => ({ artifacts: [], info: [], removeFromQueue: false }) },
      inner3,
    ]);
    const inner1 = Pipeline((_ctx, _source) => [
      { id: "i1", run: async () => ({ artifacts: [], info: [], removeFromQueue: false }) },
      inner2,
    ]);
    flattenPipeline([inner1], ctx, source);
  });
});

// ---------------------------------------------------------------------------
// runPipelineFrom
// ---------------------------------------------------------------------------

describe("runPipelineFrom", () => {
  bench("3 stages via factory", async () => {
    const factory = Pipeline((_ctx, _source) => [
      { id: "a", run: async () => ({ artifacts: [], info: [], removeFromQueue: false }) },
      { id: "b", run: async () => ({ artifacts: [], info: [], removeFromQueue: false }) },
      { id: "c", run: async () => ({ artifacts: [], info: [], removeFromQueue: false }) },
    ]);
    await runPipelineFrom(source, factory);
  });
});
