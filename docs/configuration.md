# Configuration

## `DefaultBrowserPipelineOptions`

```ts
type DefaultBrowserPipelineOptions = {
  saveOriginal: boolean; // default: false
  saveOptimized: boolean; // default: true
  saveThumbnails: boolean; // default: true
  qualityPercent: number; // 1–100, default: 90
  maxLongEdge: number | "original"; // default: 3840
  thumbnailMaxEdge: number; // default: 640
  optimizedMaxSizeMB: number; // default: 1
  thumbnailMaxSizeMB: number; // default: 0.25
  fallbackToOriginal: boolean; // default: true
  debug?: boolean;
};
```

## Plugin Options

Plugins receive the same `DefaultBrowserPipelineOptions` by default. Plugin factories can capture additional options via closure:

```ts
function createWatermarkPlugin(apiKey: string): ProcessingPlugin<DefaultBrowserPipelineOptions> {
  return {
    id: "watermark",
    // apiKey captured here, opts comes from pipeline config
    createStages(input, opts, classif, ctx) {
      /* ... */
    },
  };
}
```

## Preset `upload()`

```ts
import { upload } from "@vivsh1999/upupload/preset";

interface UploadOptions {
  quality?: number; // 1–100, default: 90
  maxLongEdge?: number | "original"; // default: 3840
  optimizedMaxSizeMB?: number; // default: 1
  saveOriginal?: boolean; // default: false
  saveThumbnails?: boolean; // default: false
  onArtifact?: (result: PipelineResult) => void | Promise<void>;
}

const result = await upload(file, {
  quality: 80,
  saveOriginal: true,
  onArtifact: async (result) => {
    for (const a of result.artifacts) {
      await fetch("/api/upload", { method: "POST", body: a.file });
    }
  },
});
```
