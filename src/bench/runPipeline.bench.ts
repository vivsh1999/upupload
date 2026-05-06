import { bench, describe } from "vitest";

import type { PipelineDefinition, PipelineResult, PipelineSource } from "../core/types";
import { runPipeline } from "../core/runPipeline";

describe("runPipeline", () => {
  const source: PipelineSource = {
    file: new Blob(["x"], { type: "text/plain" }),
    name: "x.txt",
    type: "text/plain",
  };

  const def: PipelineDefinition<PipelineSource, PipelineResult> = {
    stages: [
      {
        id: "a",
        when: () => ({ run: true }),
        run: () => ({
          artifacts: [
            {
              variant: "one",
              file: new Blob(["1"]),
              filename: "one.bin",
              filetype: "application/octet-stream",
            },
          ],
          info: [{ level: "info", message: "a" }],
          removeFromQueue: false,
        }),
      },
      {
        id: "b",
        when: () => ({ run: true }),
        run: () => ({
          artifacts: [
            {
              variant: "two",
              file: new Blob(["2"]),
              filename: "two.bin",
              filetype: "application/octet-stream",
            },
          ],
          info: [],
          removeFromQueue: false,
        }),
      },
    ],
  };

  bench(
    "two-stage pipeline (async)",
    async () => {
      await runPipeline(source, def);
    },
    { time: 200 },
  );
});
