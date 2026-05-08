# Pipeline Engine

Stages run in this fixed order:

| Stage                | Condition        | What it does                                                                                 |
| -------------------- | ---------------- | -------------------------------------------------------------------------------------------- |
| `validate-allowlist` | Always           | Rejects non-media files (exe, txt, etc.)                                                     |
| `original`           | Always           | Passes source file through as `original` variant                                             |
| _plugin stages_      | Per `supports()` | Stages contributed by matched plugins (topologically sorted by `after`/`before` constraints) |

After all stages run, any artifact with `skip: true` is filtered from the result.

## Features

- **Shared context bag** (`ctx.shared: Map<string, unknown>`) — stages and plugins communicate by reading/writing shared keys.
- **AbortSignal support** — pipelines can be cancelled mid-flight.
- **Stage middleware** — `PipelineDefinition.middleware` transforms every stage (timing, monitoring, etc.).
- **Progress events** — `PipelineOptions.onProgress` fires `start`/`end` per stage.
- **Retry on error** — error handler supports `{ action: "retry"; maxRetries; delayMs? }`.
- **Accumulated result in `when()`** — stage guards receive the current accumulated `PipelineResult`.

## Utilities

```ts
import { compose, stage, createTimingMiddleware } from "@vivsh1999/upupload/core";

// Compose multiple definitions into one
const fullDef = compose(def1, def2);

// Shorthand — unconditional stage (always runs)
const def = stage("resize", async (input, ctx) => ({ artifacts: [], info: [], removeFromQueue: false }));

// Full stage with guard
const def = stage({
  id: "resize",
  when: (input, ctx, current) => ({ run: true }),
  run: async (input, ctx) => ({ ... }),
});

// Timing middleware — logs stage duration
const timing = createTimingMiddleware((id, ms) => console.log(`${id} took ${ms}ms`));
```

## Result

```ts
{
  artifacts: PipelineArtifact[];  // Produced files (variant + file + metadata). Always includes "original".
  info: PipelineInfoMessage[];    // Info/warning messages
  removeFromQueue: boolean;       // True for junk files (folder drops)
}
```

The original file is always included as artifact variant `"original"`. Filter it from the result if you don't want to upload it: `result.artifacts.filter(a => a.variant !== "original")`.

Artifact variants are defined by plugins and are completely dynamic — any string is valid.
