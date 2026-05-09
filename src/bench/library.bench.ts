import { bench, describe } from "vitest";
import { emptyResult, artifact, warning, infoMessage } from "../core/result";
import { compose, stage, sharedGet, sharedSet } from "../core/utils";
import { Plugin } from "../plugin/plugin";
import { PluginProvider } from "../plugin/plugin-provider";
import type { PipelineDefinition, PipelineResult, PipelineSource } from "../core/types";
import { runPipeline } from "../core/runPipeline";
import { validatePipeline } from "../browser/pipeline-utils";
import type { PipelineDef } from "../browser/pipeline-utils";

// ---------------------------------------------------------------------------
// Result helpers
// ---------------------------------------------------------------------------

describe("result helpers", () => {
  bench("emptyResult", () => {
    emptyResult();
  });

  bench("artifact", () => {
    artifact("thumb", new Blob(["x"]), "thumb.jpg", "image/jpeg");
  });

  bench("warning", () => {
    warning("warn message", "CODE");
  });

  bench("infoMessage", () => {
    infoMessage("info message", "CODE");
  });
});

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
});

// ---------------------------------------------------------------------------
// compose / stage
// ---------------------------------------------------------------------------

describe("compose / stage", () => {
  bench("stage() by id+run", () => {
    stage("test", async () => emptyResult());
  });

  bench("compose() 3 defs", () => {
    const a = stage("a", async () => emptyResult());
    const b = stage("b", async () => emptyResult());
    const c = stage("c", async () => emptyResult());
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
// validatePipeline
// ---------------------------------------------------------------------------

describe("validatePipeline", () => {
  const valid: PipelineDef[] = [
    {
      id: "media",
      pipelines: [
        { id: "photos", plugins: [{ id: "compressor" } as any] },
        { id: "videos", plugins: [{ id: "poster" } as any] },
      ],
    },
    { id: "audio", plugins: [{ id: "tagger" } as any] },
  ];

  bench("validatePipeline (valid)", () => {
    validatePipeline(valid);
  });
});

// ---------------------------------------------------------------------------
// Pipeline: skipGroup, skipRemaining, removeFromQueue
// ---------------------------------------------------------------------------

describe("pipeline control flow", () => {
  const source: PipelineSource = {
    file: new Blob(["x"], { type: "text/plain" }),
    name: "x.txt",
    type: "text/plain",
  };

  bench("skipGroup", async () => {
    const def: PipelineDefinition<PipelineSource, PipelineResult> = {
      stages: [
        {
          id: "decide",
          run: async () => ({
            artifacts: [],
            info: [],
            removeFromQueue: false,
            skipGroup: "noise",
          }),
        },
        {
          id: "skipped",
          group: "noise",
          run: async () => {
            throw new Error("should not run");
          },
        },
      ],
    };
    await runPipeline(source, def);
  });

  bench("skipRemaining", async () => {
    const def: PipelineDefinition<PipelineSource, PipelineResult> = {
      stages: [
        {
          id: "stop",
          run: async () => ({
            artifacts: [],
            info: [],
            removeFromQueue: false,
            skipRemaining: true,
          }),
        },
        {
          id: "never",
          run: async () => {
            throw new Error("should not run");
          },
        },
      ],
    };
    await runPipeline(source, def);
  });

  bench("removeFromQueue", async () => {
    const def: PipelineDefinition<PipelineSource, PipelineResult> = {
      stages: [
        { id: "reject", run: async () => ({ artifacts: [], info: [], removeFromQueue: true }) },
        {
          id: "never",
          run: async () => {
            throw new Error("should not run");
          },
        },
      ],
    };
    await runPipeline(source, def);
  });
});

// ---------------------------------------------------------------------------
// Pipeline: parallel stages
// ---------------------------------------------------------------------------

describe("parallel stages", () => {
  const source: PipelineSource = {
    file: new Blob(["x"], { type: "text/plain" }),
    name: "x.txt",
    type: "text/plain",
  };

  bench("3 parallel stages", async () => {
    const def: PipelineDefinition<PipelineSource, PipelineResult> = {
      stages: [
        {
          id: "a",
          parallel: true,
          run: async () => ({ artifacts: [], info: [], removeFromQueue: false }),
        },
        {
          id: "b",
          parallel: true,
          run: async () => ({ artifacts: [], info: [], removeFromQueue: false }),
        },
        {
          id: "c",
          parallel: true,
          run: async () => ({ artifacts: [], info: [], removeFromQueue: false }),
        },
      ],
    };
    await runPipeline(source, def);
  });
});

// ---------------------------------------------------------------------------
// Pipeline: dependsOn
// ---------------------------------------------------------------------------

describe("dependsOn", () => {
  const source: PipelineSource = {
    file: new Blob(["x"], { type: "text/plain" }),
    name: "x.txt",
    type: "text/plain",
  };

  bench("2 stages with dependsOn", async () => {
    const def: PipelineDefinition<PipelineSource, PipelineResult> = {
      stages: [
        { id: "prep", run: async () => ({ artifacts: [], info: [], removeFromQueue: false }) },
        {
          id: "process",
          dependsOn: ["prep"],
          run: async () => ({ artifacts: [], info: [], removeFromQueue: false }),
        },
      ],
    };
    await runPipeline(source, def);
  });
});
