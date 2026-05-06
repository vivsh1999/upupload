# media-pipeline (local package)

Client-first, multi-stage media pipeline for **wide image support** with safe defaults:

- Runs processing **in the browser** (JPEG optimize, thumbnails, RAW decode, video posters)
- If a format can’t be decoded/transcoded client-side and you didn’t attach a server processor, it **falls back to uploading the original bytes**
- Optional decoder “plugins” can be enabled by installing extra deps (no hard requirement)

## Usage (React)

```ts
import { useMediaUpload } from 'media-pipeline/react'
```

TUS upload (default) expects a `tus` object; `endpoint` is optional and defaults to `'/api/tus/'` on the current origin.

## Optional browser decoders (install only if you need them)

- **HEIC/HEIF decode** (optional):
  - `heic-decode` (preferred) or `heic2any`
- **TIFF decode** (optional):
  - `utif`

These are loaded via runtime optional imports, so apps without these deps still build.

