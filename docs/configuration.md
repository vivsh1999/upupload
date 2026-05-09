# Configuration

## `BrowserPipelineOptions`

```ts
type BrowserPipelineOptions = {
  debug?: boolean; // Enable debug logging to console
};
```

The only pipeline-level option is `debug`. All processing tuning (quality, resolution, size) is configured per-plugin via each plugin's typed options.

## Plugin Options

Plugins use the `Plugin` class with the `.with()` pattern:

```ts
import { rawToJpeg, jpegCompressor, videoPoster } from "@vivsh1999/upupload/plugins";

// RAW/HEIC/TIFF decoder — accepts only `debug`:
rawToJpeg;
rawToJpeg.with({ debug: true });

// JPEG/PNG/WebP compressor — set base defaults:
jpegCompressor.with({ quality: 80, maxLongEdge: 1920, maxSizeMB: 1 });
// Defaults: `variant` → `"outputFile"`, `maxLongEdge` → `-1` (original size).

// Video poster frame:
videoPoster.with({ variant: "poster", maxEdge: 640 });
```

For multi-instance setups, use `instanceId` to disambiguate:

```ts
jpegCompressor.with({ variant: "optimized", quality: 80 }, { instanceId: "opt" });
jpegCompressor.with(
  { variant: "thumbnail", quality: 78, maxLongEdge: 320 },
  { instanceId: "thumb" },
);
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
