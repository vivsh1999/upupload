# @vivsh1999/upupload

Client-first, multi-stage media uploader/processor with a **plugin architecture** for custom file processing.

- Pipeline engine handles validation, original passthrough, video posters, and safe fallback
- **Plugin system** — every file-type-specific processor is a separate, tree-shakeable plugin
- Ships two processing plugins: `rawToJpeg` (RAW/HEIC/TIFF) and `jpegCompressor` (compress/thumbnail)
- **Zero-cost imports** — plugins are tree-shaken at the bundler level; pay only for what you use
- **No auto-installed heavy deps** — plugin dependencies (`browser-image-compression`, `libraw-wasm`) are never installed unless you add them
- Optional decoder dependencies (HEIC/HEIF, TIFF, LibRaw WASM) loaded via runtime imports
- TypeScript-native, fully typed

## Installation

```sh
npm add @vivsh1999/upupload
```

The package itself has zero image-processing dependencies on first install.

### Plugin dependencies (install only what you need)

```sh
# For JPEG/PNG/WebP compression
npm add browser-image-compression

# For RAW camera files (CR3, DNG, NEF, ARW…)
npm add libraw-wasm

# Optional: for HEIC/HEIF / TIFF decode via the raw-to-jpeg plugin
npm add heic-decode heic2any utif
```

## Entry Points

| Path                                          | Environment | Contents                                          | Bundle cost |
| --------------------------------------------- | ----------- | ------------------------------------------------- | ----------- |
| `@vivsh1999/upupload`                         | Browser     | Re-exports core + browser                         | —           |
| `@vivsh1999/upupload/browser`                 | Browser     | Pipeline, allowlist, audio/canvas utils, plugins  | 8 kB        |
| `@vivsh1999/upupload/core`                    | Universal   | Generic pipeline engine, types, result helpers    | 1 kB        |
| `@vivsh1999/upupload/react`                   | Browser     | `useMediaUpload` React hook                       | 60 kB       |
| `@vivsh1999/upupload/server`                  | Node        | Server entry (minimal)                            | < 1 kB      |
| `@vivsh1999/upupload/plugins`                 | Browser     | Barrel re-export of all plugins                   | N/A         |
| `@vivsh1999/upupload/plugins/jpeg-compressor` | Browser     | JPEG/PNG/WebP compressor plugin                   | +4 kB       |
| `@vivsh1999/upupload/plugins/raw-to-jpeg`     | Browser     | RAW/HEIC/TIFF decoder plugin                      | +12 kB      |
| `@vivsh1999/upupload/plugins/testing`         | Browser     | Plugin test utilities                             | +1 kB       |
| `@vivsh1999/upupload/preset`                  | Browser     | Zero-config `upload()` with auto-detected plugins | +13 kB      |

Only the specific plugin path you import is added to your bundle.

## Quick Start

### React

```tsx
import { useMediaUpload } from "@vivsh1999/upupload/react";
import { jpegCompressor } from "@vivsh1999/upupload/plugins";

function Uploader() {
  const { getDropTargetProps, getFileInputProps, queue, startUpload } = useMediaUpload({
    plugins: [jpegCompressor.with({ quality: 80, maxSizeMB: 1 })],
  });
  return (
    <div {...getDropTargetProps()}>
      <input {...getFileInputProps()} />
      {queue.map((item) => (
        <div key={item.id}>
          {item.name} — {item.status} ({item.progress}%)
        </div>
      ))}
      <button onClick={() => startUpload()}>Upload</button>
    </div>
  );
}
```

### Vanilla JS

```js
import { runDefaultBrowserPipeline } from "@vivsh1999/upupload/browser";
import { jpegCompressor } from "@vivsh1999/upupload/plugins";

const result = await runDefaultBrowserPipeline(source, opts, {
  plugins: [jpegCompressor.with({ quality: 80, maxSizeMB: 1 })],
});
```

### Preset (zero-config)

```ts
import { upload } from "@vivsh1999/upupload/preset";

const result = await upload(file, { quality: 80 });
```

## Documentation

| Topic                                                    | File                                                                                                     |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Pipeline engine (stages, features, utilities)            | [docs/pipeline.md](docs/pipeline.md)                                                                     |
| Plugin system (architecture, built-in, custom, ordering) | [docs/plugins.md](docs/plugins.md)                                                                       |
| React hook (useMediaUpload, options, return value)       | [docs/react.md](docs/react.md)                                                                           |
| Configuration reference (all types)                      | [docs/configuration.md](docs/configuration.md)                                                           |
| Case study: e-commerce product photography               | [docs/case-studies/ecommerce-product-photography.md](docs/case-studies/ecommerce-product-photography.md) |
| Case study: wedding photography client proofing          | [docs/case-studies/wedding-photography-uploader.md](docs/case-studies/wedding-photography-uploader.md)   |
| Case study: podcast audio publishing                     | [docs/case-studies/podcast-audio-publishing.md](docs/case-studies/podcast-audio-publishing.md)           |

## Decoder Dependencies

The `rawToJpeg` plugin optionally imports decoders at runtime:

| Package       | Format                           | Strategy                                |
| ------------- | -------------------------------- | --------------------------------------- |
| `libraw-wasm` | Camera RAW (CR3, DNG, NEF, ARW…) | Web Worker + WASM                       |
| `heic-decode` | HEIC/HEIF                        | Raw pixels, smaller bundle              |
| `heic2any`    | HEIC/HEIF                        | Fallback when `heic-decode` unavailable |
| `utif`        | TIFF                             | Decodes to RGBA → JPEG                  |

```sh
npm add libraw-wasm heic-decode utif
```

## Examples

- [`examples/vanilla-html`](./examples/vanilla-html) — basic pipeline + custom pipeline with a metadata-annotator plugin
- [`examples/tanstack-start`](./examples/tanstack-start) — TanStack Start app with TUS uploads and the React hook

## Benchmarks

Autogenerated from `vitest bench` (via pre-commit hook).

| Benchmark                                       | Ops/sec       |
| ----------------------------------------------- | ------------- |
| video (MIME match)                              | 10,168,589.72 |
| RAW octet-stream (extension match)              | 8,567,993.35  |
| SVG (MIME match)                                | 9,314,471.01  |
| raster image (MIME match)                       | 5,232,945.06  |
| audio (MIME match)                              | 9,437,983.75  |
| reject (text/plain)                             | 12,165,859.42 |
| by MIME                                         | 6,851,393.54  |
| by extension                                    | 9,151,491.84  |
| false (image)                                   | 9,816,349.82  |
| by MIME                                         | 7,093,559.64  |
| by extension                                    | 8,662,919.74  |
| false (image)                                   | 7,560,968.81  |
| RAW extension — true                            | 1,316,086.50  |
| non-RAW extension — false                       | 10,673,378.51 |
| .heic extension — true                          | 7,245,043.19  |
| image/heif MIME — true                          | 7,797,078.81  |
| false (PNG)                                     | 8,012,864.43  |
| .tif extension — true                           | 6,738,261.93  |
| .tiff extension — true                          | 7,163,943.86  |
| image/tiff MIME — true                          | 7,731,014.38  |
| false (JPEG)                                    | 7,682,037.80  |
| video — true                                    | 6,956,152.33  |
| audio — true                                    | 6,828,677.83  |
| SVG — true                                      | 5,354,166.49  |
| raster PNG — false                              | 6,047,694.72  |
| RAW extension — true                            | 4,792,822.45  |
| raster PNG — true                               | 5,235,225.36  |
| SVG — false                                     | 5,429,362.64  |
| audio — false                                   | 6,898,723.72  |
| 7 async stages (like real pipeline)             | 121.36        |
| 7 stages with half skipped (when returns false) | 211.76        |
| stage error → onError fallback                  | 284.15        |
| stage error → onError skip                      | 266.31        |
