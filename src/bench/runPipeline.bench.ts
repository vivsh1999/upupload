import { bench, describe } from "vitest";
import type { PipelineDefinition, PipelineResult, PipelineSource } from "../core/types";
import { runPipeline } from "../core/runPipeline";

function delay(ms = 0): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function stageResult(id: string): PipelineResult {
  return {
    artifacts: [
      {
        variant: id,
        file: new Blob([id]),
        filename: `${id}.bin`,
        filetype: "application/octet-stream",
      },
    ],
    info: [],
    removeFromQueue: false,
  };
}

describe("runPipeline", () => {
  const source: PipelineSource = {
    file: new Blob(["x"], { type: "text/plain" }),
    name: "x.txt",
    type: "text/plain",
  };

  bench(
    "7 async stages (like real pipeline)",
    async () => {
      const def: PipelineDefinition<PipelineSource, PipelineResult> = {
        stages: ["a", "b", "c", "d", "e", "f", "g"].map((id) => ({
          id,
          run: async () => {
            await delay();
            return stageResult(id);
          },
        })),
      };
      await runPipeline(source, def);
    },
    { time: 5_000 },
  );

  bench(
    "7 stages with half skipped (when returns false)",
    async () => {
      let toggle = false;
      const def: PipelineDefinition<PipelineSource, PipelineResult> = {
        stages: ["a", "b", "c", "d", "e", "f", "g"].map((id) => ({
          id,
          when: () => {
            toggle = !toggle;
            return { run: toggle };
          },
          run: async () => {
            await delay();
            return stageResult(id);
          },
        })),
      };
      await runPipeline(source, def);
    },
    { time: 5_000 },
  );

  bench(
    "stage error → onError fallback",
    async () => {
      const def: PipelineDefinition<PipelineSource, PipelineResult> = {
        stages: [
          {
            id: "good",
            run: async () => {
              await delay();
              return stageResult("good");
            },
          },
          {
            id: "bad",
            run: async () => {
              await delay();
              throw new Error("stage failure");
            },
            onError: () => ({
              action: "fallback" as const,
              value: stageResult("fallback"),
            }),
          },
          {
            id: "also-good",
            run: async () => {
              await delay();
              return stageResult("also-good");
            },
          },
        ],
      };
      await runPipeline(source, def);
    },
    { time: 5_000 },
  );

  bench(
    "stage error → onError skip",
    async () => {
      const def: PipelineDefinition<PipelineSource, PipelineResult> = {
        stages: [
          {
            id: "good",
            run: async () => {
              await delay();
              return stageResult("good");
            },
          },
          {
            id: "skip-me",
            run: async () => {
              await delay();
              throw new Error("skip this");
            },
            onError: () => ({ action: "skip" as const }),
          },
          {
            id: "also-good",
            run: async () => {
              await delay();
              return stageResult("also-good");
            },
          },
        ],
      };
      await runPipeline(source, def);
    },
    { time: 5_000 },
  );
});
