# Pipeline Engine

Built-in stages run in this order:

| Stage                        | Condition                      | What it does                                                                                 |
| ---------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------- |
| `validate-allowlist`         | Always                         | Rejects non-media files (exe, txt, etc.)                                                     |
| `original`                   | `saveOriginal: true`           | Passes source file through as `original` variant                                             |
| `video-poster-thumbnail`     | `saveThumbnails: true` + video | Extracts a JPEG poster frame as `thumbnail`                                                  |
| _plugin stages_              | Per plugin `supports()`        | Stages contributed by matched plugins (topologically sorted by `after`/`before` constraints) |
| `final-fallback-to-original` | `fallbackToOriginal: true`     | Uploads original for video/audio/SVG                                                         |

## Features

- **Shared context bag** (`ctx.shared: Map<string, unknown>`) — stages and plugins communicate by reading/writing shared keys. Use `sharedGet<T>()` / `sharedSet<T>()` from `@vivsh1999/upupload/core` for type-safe access.
- **AbortSignal support** — pipelines and uploads can be cancelled mid-flight
- **Stage middleware** — `PipelineDefinition.middleware` transforms every stage (timing, monitoring, etc.)
- **Progress events** — `PipelineOptions.onProgress` fires `start`/`end` per stage
- **Retry on error** — error handler supports `{ action: "retry"; maxRetries; delayMs? }`
- **Accumulated result in `when()`** — stage guards receive the current accumulated `PipelineResult`

## Utilities

```ts
import { compose, stage, createTimingMiddleware, sharedGet, sharedSet } from "@vivsh1999/upupload/core";

// Compose multiple definitions into one
const fullDef = compose(def1, def2);

// Shorthand — unconditional stage (always runs)
const def = stage("resize", async (input, ctx) => ({ artifacts: [], info: [], removeFromQueue: false }));

// Full stage with guard
const def = stage({
  id: "resize",
  when: (input, ctx, current) => ({ run: opts.saveOptimized }),
  run: async (input, ctx) => ({ ... }),
});

// Timing middleware — logs stage duration
const timing = createTimingMiddleware((id, ms) => console.log(`${id} took ${ms}ms`));

// Type-safe shared context access
const dims = sharedGet<{ w: number; h: number }>(ctx.shared, "detected-dimensions");
sharedSet(ctx.shared, "detected-dimensions", { w: 1920, h: 1080 });
```

## Result

```ts
{
  artifacts: PipelineArtifact[];  // Produced files (variant + file + metadata)
  info: PipelineInfoMessage[];    // Info/warning messages
  removeFromQueue: boolean;       // True for junk files (folder drops)
}
```

Artifact variants: `"original"`, `"optimized"`, `"thumbnail"`.
