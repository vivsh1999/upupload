# TanStack Start example — media uploads

TanStack Start app with **resumable uploads** over **TUS** (`/api/tus/`) and a **client-only** media pipeline from the **`@vivsh1999/upupload`** workspace package (no server-side transcoding).

---

## Storage layout (server)

Completed uploads are written under `uploads/` using `@tus/file-store`. Each logical output variant uses its own subdirectory (configured in `src/server.ts` via TUS metadata `variant`):

| Client `variant` metadata | Directory             | Contents                                                                     |
| ------------------------- | --------------------- | ---------------------------------------------------------------------------- |
| `original`                | `uploads/originals/`  | Byte-for-byte clone of the picked file (always included by the pipeline).    |
| `optimized`               | `uploads/optimized/`  | In-browser JPEG re-encode for supported rasters / decoded RAW / HEIC / TIFF. |
| `thumbnail`               | `uploads/thumbnails/` | Smaller JPEG previews, or a **video poster** frame.                          |

The on-disk object name under each folder is a random id (no extension); original filenames and MIME types are preserved in TUS metadata (`filename`, `filetype`, `relativePath`).

---

## Client flow

1. User picks files or folders (`MEDIA_PICKER_ACCEPT` in `src/lib/media-picker-accept.ts` surfaces common image/video/audio and RAW extensions).
2. Queue builds in memory; **Start upload** runs `@vivsh1999/upupload`'s default browser pipeline per file. Processed blobs are then uploaded via `tus-js-client` in the `onFileComplete` handler.
3. The original file is **always included** as variant `"original"`. The upload filter excludes it unless "Save original" is enabled.

---

## Configuration

| Item               | Location / notes                                                                                      |
| ------------------ | ----------------------------------------------------------------------------------------------------- |
| TUS route          | `src/lib/tus-path.ts` → `TUS_API_PATH` (`/api/tus`)                                                   |
| Dev middleware     | `vite.config.ts` — `installDevServerMiddleware: true` so `/api/tus` hits `src/server.ts` under Vite 8 |
| Pipeline           | `src/components/UppyUploader.tsx` → `pipelineConfig` on `MediaUploadField`                            |
| Picker accept list | `src/lib/media-picker-accept.ts`                                                                      |

---

## Key source files

| Path                                               | Role                                                   |
| -------------------------------------------------- | ------------------------------------------------------ |
| `src/server.ts`                                    | TUS `Server`, `FileStore`, `onUploadCreate` / finish   |
| `src/components/media-upload/MediaUploadField.tsx` | UI + `useMediaUpload` from `@vivsh1999/upupload/react` |
| `src/components/UppyUploader.tsx`                  | Example wiring + pipeline config + picker `accept`     |
| `src/lib/media-picker-accept.ts`                   | Broad file input `accept`                              |
| `src/lib/media-allowlist.ts`                       | Server-side upload gate                                |
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
