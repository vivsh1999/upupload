# Configuration

## `BrowserPipelineOptions`

```ts
type BrowserPipelineOptions = {
  debug?: boolean; // Enable debug logging to console
};
```

The only pipeline-level option is `debug`. All processing tuning (quality, resolution, size) is configured per-plugin via each plugin's typed options.

## Plugin Options

`createRawToJpegPlugin` is a pure decoder — accepts only `debug`:

```ts
createRawToJpegPlugin();
createRawToJpegPlugin({ debug: true });
```

`createJpegCompressorPlugin` takes default compression options. These become the base that pipeline definitions can override via `opts`:

```ts
createJpegCompressorPlugin({ quality: 80, maxLongEdge: 1920, maxSizeMB: 1 });

// In a PipelineDef, reference by ID and override:
// { id: "jpeg-compressor", opts: { variant: "client-proof", quality: 85, maxLongEdge: 2560 } }
```

`createVideoPosterPlugin` configures the poster frame:

```ts
createVideoPosterPlugin({ variant: "poster", maxEdge: 640 });
```

## Preset `upload()`

```ts
import { upload } from "@vivsh1999/upupload/preset";

interface UploadOptions {
  quality?: number; // 1–100, default: 90
  maxLongEdge?: number | "original"; // default: 3840
  optimizedMaxSizeMB?: number; // default: 1
  saveOriginal?: boolean; // default: false
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

Note: The preset is a convenience wrapper. For full control, use `runDefaultBrowserPipeline` directly with your own plugin configuration.
