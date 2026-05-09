# Pipeline Engine

Stages run in this fixed order:

| Stage                | Condition        | What it does                                                                                 |
| -------------------- | ---------------- | -------------------------------------------------------------------------------------------- |
| `validate-allowlist` | Always           | Rejects non-media files (exe, txt, etc.)                                                     |
| `original`           | Always           | Passes source file through as `original` variant                                             |
| _plugin stages_      | Per `supports()` | Stages contributed by matched plugins (topologically sorted by `after`/`before` constraints) |

After all stages run, any artifact with `skip: true` is filtered from the result.

## Stage Features

Each stage supports these optional properties:

| Property    | Type       | Description                                                                               |
| ----------- | ---------- | ----------------------------------------------------------------------------------------- |
| `parallel`  | `boolean`  | When `true`, runs concurrently with adjacent parallel stages (batched via `Promise.all`). |
| `dependsOn` | `string[]` | IDs of stages that must complete before this stage runs.                                  |
| `group`     | `string`   | Named group for conditional skipping. See `skipGroup` on the result.                      |

## Result Features

The accumulated `PipelineResult` supports:

| Property        | Type                 | Description                                       |
| --------------- | -------------------- | ------------------------------------------------- |
| `skipGroup`     | `string \| string[]` | Skip all unexecuted stages in the given group(s). |
| `skipRemaining` | `boolean`            | Halt all remaining unexecuted stages.             |

## Result Helpers

Import from `@vivsh1999/upupload/core` to reduce boilerplate:

```ts
import { emptyResult, artifact, warning, infoMessage } from "@vivsh1999/upupload/core";

// Return an empty result (common for virtual stages):
return emptyResult();

// Build a single artifact:
return {
  artifacts: [artifact("thumb", blob, "thumb.jpg", "image/jpeg")],
  info: [],
  removeFromQueue: false,
};

// Build a warning message:
return {
  artifacts: [],
  info: [warning("Processing failed", "err_code")],
  removeFromQueue: false,
};
```

## Validating Pipeline Definitions

Import `validatePipeline` to catch configuration errors early:

```ts
import { validatePipeline } from "@vivsh1999/upupload/browser";

const defs = [{ id: "photos", plugins: [jpegCompressor.with({ quality: 80 })] }];

// Throws on: duplicate IDs, dead branches (no plugins, no children), null entries
validatePipeline(defs);
```

## Features

- **Shared context bag** (`ctx.shared: Map<string, unknown>`) — stages and plugins communicate by reading/writing shared keys. The reserved keys are:
  - `pipeline:current` (`PIPELINE_CURRENT_KEY`) — current working file
  - `pipeline:classif` (`PIPELINE_CLASSIF_KEY`) — the file's `FileClassification`
- **AbortSignal support** — pipelines can be cancelled mid-flight.
- **Stage middleware** — `PipelineDefinition.middleware` transforms every stage (timing, monitoring, etc.).
- **Progress events** — `PipelineOptions.onProgress` fires `start`/`end` per stage.
- **Retry on error** — error handler supports `{ action: "retry"; maxRetries; delayMs? }`.
- **Accumulated result in `when()`** — stage guards receive the current accumulated `PipelineResult`.
- **Parallel execution** — stages with `parallel: true` run concurrently in batches.
- **Dependency ordering** — stages declare `dependsOn` for explicit ordering constraints.
- **Group skipping** — stages belong to named `group`s; a stage can `skipGroup` to disable an entire phase.
- **Skip remaining** — `skipRemaining: true` halts all remaining stages.
- **Cycle detection** — circular `after`/`before` dependencies throw with the cycle path.
- **Duplicate stage ID detection** — two plugins producing the same stage ID throw with disambiguation guidance.

## Utilities

```ts
import {
  compose, stage, createTimingMiddleware,
  sharedGet, sharedSet,
  Pipeline, runPipelineFrom, flattenPipeline,
} from "@vivsh1999/upupload/core";

// Compose multiple definitions into one
const fullDef = compose(def1, def2);

// Shorthand — unconditional stage (always runs)
const def = stage("resize", async (input, ctx) => emptyResult());

// Full stage with guard (receives accumulated result)
const def = stage({
  id: "resize",
  when: (input, ctx, current) => ({ run: current.artifacts.length === 0 }),
  run: async (input, ctx) => ({ ... }),
});

// Timing middleware — logs stage duration
const timing = createTimingMiddleware((id, ms) => console.log(`${id} took ${ms}ms`));

// Type-safe shared context access
sharedGet<string>(ctx.shared, "my-key");
sharedSet(ctx.shared, "my-key", value);

// Nestable pipeline factory
const videoPipeline = Pipeline((ctx, source) => [
  { id: "transcode", run: async () => ({ ... }) },
]);
const main = Pipeline((ctx, source) => [
  ...(source.type?.startsWith("video/") ? videoPipeline(ctx, source) : []),
]);
const result = await runPipelineFrom(input, main);

// Flatten nested pipelines manually (used internally by runPipelineFrom)
const stages = flattenPipeline(nodes, ctx, source);
```

## Result

```ts
{
  artifacts: PipelineArtifact[];  // Produced files (variant + file + metadata). Always includes "original".
  info: PipelineInfoMessage[];    // Info/warning messages
  removeFromQueue: boolean;       // True for junk files (folder drops)
  skipGroup?: string | string[];  // Groups to skip downstream
  skipRemaining?: boolean;        // Skip all remaining stages
}
```

The original file is always included as artifact variant `"original"`. Filter it from the result if you don't want to upload it: `result.artifacts.filter(a => a.variant !== "original")`.

Artifact variants are defined by plugins and are completely dynamic — any string is valid.
