# @vivsh1999/upupload

Client-first, multi-stage media uploader/processor with a **plugin architecture** for custom file processing.

- Pipeline engine handles validation, original passthrough, video posters, and safe fallback
- **Plugin system** — every file-type-specific processor is a separate, tree-shakeable plugin
- Ships two processing plugins: `raw-to-jpeg` (RAW/HEIC/TIFF) and `jpeg-compressor` (compress/thumbnail)
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
| `@vivsh1999/upupload/browser`                 | Browser     | Pipeline, allowlist, TUS upload, plugin types     | 8 kB        |
| `@vivsh1999/upupload/core`                    | Universal   | Generic pipeline engine and types (no DOM)        | 1 kB        |
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
import { createJpegCompressorPlugin } from "@vivsh1999/upupload/plugins/jpeg-compressor";

function Uploader() {
  const { getDropTargetProps, queue, startUpload } = useMediaUpload({
    plugins: [createJpegCompressorPlugin()],
    transport: "tus",
    tus: { endpoint: "/api/tus" },
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
import { createJpegCompressorPlugin } from "@vivsh1999/upupload/plugins/jpeg-compressor";

const result = await runDefaultBrowserPipeline(source, opts, {
  plugins: [createJpegCompressorPlugin()],
});
```

### Preset (zero-config)

```ts
import { upload } from "@vivsh1999/upupload/preset";

const result = await upload(file, { quality: 80 });
```

## Documentation

| Topic                                                    | File                                           |
| -------------------------------------------------------- | ---------------------------------------------- |
| Pipeline engine (stages, features, utilities)            | [docs/pipeline.md](docs/pipeline.md)           |
| Plugin system (architecture, built-in, custom, ordering) | [docs/plugins.md](docs/plugins.md)             |
| React hook (useMediaUpload, options, return value)       | [docs/react.md](docs/react.md)                 |
| Configuration reference (all types)                      | [docs/configuration.md](docs/configuration.md) |

## Decoder Dependencies

The `raw-to-jpeg` plugin optionally imports decoders at runtime:

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
| video (MIME match)                              | 14,281,754.83 |
| RAW octet-stream (extension match)              | 10,173,335.39 |
| SVG (MIME match)                                | 13,579,119.71 |
| raster image (MIME match)                       | 14,248,550.80 |
| audio (MIME match)                              | 14,281,224.94 |
| reject (text/plain)                             | 15,711,503.91 |
| by MIME                                         | 9,534,327.39  |
| by extension                                    | 11,885,594.69 |
| false (image)                                   | 13,354,703.41 |
| by MIME                                         | 9,636,836.34  |
| by extension                                    | 11,633,280.88 |
| false (image)                                   | 12,702,207.49 |
| RAW extension — true                            | 2,529,974.50  |
| non-RAW extension — false                       | 15,055,055.28 |
| .heic extension — true                          | 12,009,974.58 |
| image/heif MIME — true                          | 9,155,311.58  |
| false (PNG)                                     | 10,745,238.90 |
| .tif extension — true                           | 12,351,836.89 |
| .tiff extension — true                          | 11,858,802.67 |
| image/tiff MIME — true                          | 10,323,055.30 |
| false (JPEG)                                    | 10,604,037.85 |
| video — true                                    | 9,135,319.87  |
| audio — true                                    | 9,637,295.11  |
| SVG — true                                      | 7,247,290.36  |
| raster PNG — false                              | 5,929,403.63  |
| RAW extension — true                            | 6,504,267.80  |
| raster PNG — true                               | 6,778,609.66  |
| SVG — false                                     | 7,205,977.22  |
| audio — false                                   | 9,180,923.98  |
| 7 async stages (like real pipeline)             | 127.91        |
| 7 stages with half skipped (when returns false) | 225.26        |
| stage error → onError fallback                  | 298.03        |
| stage error → onError skip                      | 301.78        |
