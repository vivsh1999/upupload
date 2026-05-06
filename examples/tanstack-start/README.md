# TanStack Start example — TUS media uploads

TanStack Start app with **resumable uploads** over **TUS** (`/api/tus/`) and a **client-only** media pipeline from the **`@vivsh1999/upupload`** workspace package (no server-side transcoding).

This example installs **all optional in-browser decoders** the pipeline supports so format coverage is as wide as the library allows: **HEIC/HEIF** (`heic-decode`, fallback `heic2any`), **TIFF** (`utif`), **camera RAW** (`libraw-wasm`), plus **raster** paths via `browser-image-compression` and **video poster** thumbnails from `<video>` + canvas.

---

## Storage layout (server)

Completed uploads are written under `uploads/` using `@tus/file-store`. Each logical output variant uses its own subdirectory (configured in `src/server.ts` via TUS metadata `variant`):

| Client `variant` metadata | Directory             | Contents                                                                                                        |
| ------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------- |
| `original`                | `uploads/originals/`  | Byte-for-byte clone of the picked file (when “Save original” is enabled).                                       |
| `optimized`               | `uploads/optimized/`  | In-browser JPEG re-encode for supported rasters / decoded RAW / HEIC / TIFF (when “Save optimized” is enabled). |
| `thumbnail`               | `uploads/thumbnails/` | Smaller JPEG previews, or a **video poster** frame (when “Save thumbnails” is enabled).                         |

The on-disk object name under each folder is a random id (no extension); original filenames and MIME types are preserved in TUS **metadata** (`filename`, `filetype`, optional `relativePath` for folder picks).

---

## Client flow

1. User picks files or folders (`MEDIA_PICKER_ACCEPT` in `src/lib/media-picker-accept.ts` surfaces common image/video/audio and RAW extensions).
2. Queue builds in memory; **Start upload** runs `@vivsh1999/upupload`’s default browser pipeline per file, then uploads each artifact with `tus-js-client`.
3. If a format cannot be converted in-browser, **`fallbackToOriginal: true`** (default) still uploads the original bytes when possible.

---

## Configuration

| Item                | Location / notes                                                                                               |
| ------------------- | -------------------------------------------------------------------------------------------------------------- |
| TUS route           | `src/lib/tus-path.ts` → `TUS_API_PATH` (`/api/tus`)                                                            |
| Dev middleware      | `vite.config.ts` — `installDevServerMiddleware: true` so `/api/tus` hits `src/server.ts` under Vite 8          |
| Client TUS endpoint | `@vivsh1999/upupload` hook defaults to `origin + /api/tus/`; override via `tus.endpoint` on `MediaUploadField` |
| Pipeline            | `src/components/UppyUploader.tsx` → `initialConfig` on `MediaUploadField`                                      |
| Picker accept list  | `src/lib/media-picker-accept.ts`                                                                               |

---

## Key source files

| Path                                               | Role                                                   |
| -------------------------------------------------- | ------------------------------------------------------ |
| `src/server.ts`                                    | TUS `Server`, `FileStore`, `onUploadCreate` / finish   |
| `src/components/media-upload/MediaUploadField.tsx` | UI + `useMediaUpload` from `@vivsh1999/upupload/react` |
| `src/components/UppyUploader.tsx`                  | Example wiring + pipeline defaults + picker `accept`   |
| `src/lib/media-picker-accept.ts`                   | Broad file input `accept`                              |
| `src/lib/media-allowlist.ts`                       | Server-side upload gate (still used by `server.ts`)    |
| `src/lib/tus-variant-path.ts`                      | `variant` ↔ subdirectory mapping                       |

---

## Scripts

```bash
pnpm dev      # Vite dev server (port 3000)
pnpm build    # Production client + SSR bundles
pnpm preview
```

---

## Git

The `uploads/` tree is ignored so local binaries are not committed.
