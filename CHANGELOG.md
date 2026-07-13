# Changelog

## [0.7.0] — 2026-07-14

### Added

#### Web Worker Background Processing

- Added `useWorker` to `BrowserPipelineOptions` and `DEFAULT_BROWSER_PIPELINE_OPTIONS` to run image compression in a background thread via `OffscreenCanvas` and `createImageBitmap`.
- Optimized quality-to-size iterations inside the Web Worker using a mathematically optimal logarithmic binary search (bisection) capped at 6 iterations.
- Bypassed ESM loader runtime delays with zero-overhead static imports.

#### Pluggable zero-dependency Upload Adapters

- Added the `@vivsh1999/upupload/adapters` export path for ready-to-use, tree-shakable adapters.
- `fetchUploadAdapter` — provides multipart/form-data and binary body POST/PUT uploading with accurate `XMLHttpRequest` progress reporting.
- `s3UploadAdapter` — handles direct-to-bucket uploads using PUT presigned URLs for Amazon S3 and Cloudflare R2.

#### Progressive Heap Memory Pruning

- Added `pruneUploadedArtifacts?: boolean` option to `UseFileUploadOptions` (defaults to `true`).
- Automatically revokes associated preview object URLs and truncates heavy binary Blob chunks inside queue states immediately upon successful upload to maintain a constant client-side RAM footprint during large batches.

#### Throttled React Rendering

- Throttled UI queue progress and global batch progress updates to once every `100ms` or if progress jumps by `> 1.0%`, keeping React rendering buttery smooth under intense network loads.

#### Vitest Browser Mode Setup

- Integrated Playwright browser-mode configuration into `vitest.config.ts` for automated multi-browser integration checks on genuine image processing features across Chromium, WebKit, and Firefox.

## [0.6.0] — 2026-06-20

### Added

#### Granular Log Level System

- Replaced the simple `debug?: boolean` with a granular `logLevel: "silent" | "error" | "warn" | "info" | "debug"` configuration in `BrowserPipelineOptions` for precise console tracing control.

#### Eager Processing Semaphore Release

- Optimistically releases the pipeline execution concurrency semaphore _before_ launching the upload adapter phase in `useFileUpload`. This frees up local GPU/CPU compression slots for pending items much earlier in the batch lifecycle.

#### Adaptive Upload Progress Floor

- Replaced the hardcoded 90% upload progress floor with a dynamic, adaptive floor calculated directly from the pipeline's exact end progress percentage.

### Fixed

#### Audit Findings Resolutions

- Resolved 10 security and logical edge-case findings, including:
  - Fixed a deadlock condition when pausing/resuming queues under heavy concurrency.
  - Eliminated potential memory leaks in pipeline cancellation and error cleanup paths.
  - Improved progress calculation accuracy when processing multi-artifact pipelines.
  - Guarded `serializeForStorage` against `undefined` files for `needsReselect` queue items.

#### Strict Compiler & Registry Compatibility

- Enabled `exactOptionalPropertyTypes` inside `tsconfig.json` for seamless compatibility with strict frameworks (e.g. Effect).
- Added explicit type annotations to `FileStatus` and core exports to completely satisfy JSR "slow types" rules and ensure maximum compiling speed.

## [0.5.0] — 2026-05-16

### Added

#### `FileStatus` Typed Enum

- `FileStatus` type and const object exported from `@vivsh1999/upupload/react` so consumers can reference status values as `FileStatus.Complete` instead of guessing string literals.

#### `onBeforeStart` Batch Hook

- `onBeforeStart?: (files: FileUploadQueueItem[]) => Promise<unknown>` on `UseFileUploadOptions` — fires once before files enter the compression/upload pipeline, with the full list of pending files. Useful for batch pre-processing (e.g. `POST /bulk-init`).
- The return value is passed to every adapter call in the batch via `helpers.batch.preload`.

#### Adapter Batch Context

- `helpers.batch?: { files, batchId, preload }` on the `UploadAdapter` helpers — provides the adapter with the full batch picture, enabling coordinated upload strategies (e.g. waiting for all files before acting).
- `helpers.batch.files` — all files in the current batch.
- `helpers.batch.batchId` — a unique identifier for the batch dispatch.
- `helpers.batch.preload` — the value returned by `onBeforeStart`, if configured.

#### Configurable Storage Key Prefix

- `storageKeyPrefix?: string` on `UseFileUploadOptions` — when `persistence: "indexeddb"`, the database name becomes `"<prefix>-upupload"` instead of the default `"upupload"`. Enables multi-tenant or multi-account isolation for IndexedDB state.

#### Pipeline Flow Documentation

- Added a file processing flow diagram and throttle interaction table to the README, clarifying how `maxConcurrency`, `maxUploadConcurrency`, and `maxQueuedUploads` interact.

### Changed

- `FileUploadQueueItem.status` now uses the exported `FileStatus` type instead of an inline union.
- Added comprehensive JSDoc to every field of `FileUploadQueueItem` for better IDE autocompletion.
- `retryUpload` JSDoc now explicitly documents that the pipeline is **not** re-run, and that the adapter must be idempotent.

### Fixed

- `onBeforeStart` was missing — the earliest hook previously was `onFileProcessed`, which fires after pipeline processing.

## [0.2.0] — 2026-05-11

### Added

#### Upload Adapter Bridge

- `uploadAdapter` option on `useFileUpload` — a generic function type for uploading artifacts after pipeline processing. Receives the artifact `{ variant, blob, filename, filetype }` and helpers `{ onProgress, signal }`. User brings their own upload implementation (fetch, XHR, Uppy, TUS, etc.).
- `status: "uploading"` added to `FileUploadQueueItem.status` — queue items transition through `idle → processing → uploading → complete` when an adapter is configured.
- Upload progress maps to the 90–100% range on the queue item, divided equally across artifacts. Per-artifact `onProgress` callback feeds back into the queue.

#### Per-Stage Granular Progress

- `PipelineContext.reportProgress?: (progress: number) => void` — stages can call this during long-running operations to surface internal progress (e.g. "RAW decoding: 45%").
- `PipelineOptions.onStageProgress?: (stageId, progress) => void` — the pipeline engine delegates stage `reportProgress` calls here, scoped to the current stage ID.
- Hook wires `onStageProgress` into per-file queue items: 0–90% mapped from `(completedStages + stageProgress/100) / totalStages * 90`.

#### File Size Validation

- `maxFileSize?: number` on `UseFileUploadOptions` — rejects individual files exceeding the limit with an `onWarning`.
- `maxTotalBatchSize?: number` on `UseFileUploadOptions` — rejects files that would push the total queue size over the limit.

#### Batch Completion Callback

- `onBatchComplete?: (stats)` on `UseFileUploadOptions` — fires each time the system transitions from busy to idle with cumulative `{ totalFiles, succeeded, failed, totalBytes, totalTimeMs }` across all batches.

#### Global Pipeline Context Metadata

- `getPipelineContextMeta?: () => Record<string, unknown>` on `UseFileUploadOptions` — factory called per file; returned entries injected into `PipelineContext.shared` so all plugins can read global state (auth tokens, project IDs, etc.) without closure threading.

#### IndexedDB Persistence

- `persistence?: "memory" | "indexeddb"` option on `useFileUpload`. When `"indexeddb"`, queue metadata is persisted across page reloads.
- Restored items with `status: "complete"` keep their status for display. Items with other statuses become `"error"` (file blobs don't survive serialization — user re-drops to re-process).
- Debounced (500ms) save on queue changes.

#### Pause / Resume Pipeline

- `pause()` / `resume()` methods on `UseFileUploadResult` — pauses in-flight pipeline execution between stages and prevents new files from starting. `resume()` resolves waiting stages and auto-starts queued idle items.
- `isPaused: boolean` state on result.
- `PipelineOptions.onPauseCheck?: () => Promise<void>` — checked before each stage execution in the engine.

#### Tab Close Prevention

- `autoPreventTabClose?: boolean` option on `useFileUpload` — registers a `beforeunload` handler while `isBusy` is true.

#### `onFileProcessed` Callback

- `onFileProcessed?: (item) => void` on `UseFileUploadOptions` — fires after pipeline processing completes (before upload adapter), giving UI a clear signal that processing is done and upload is about to start.
- `onFileComplete` now clearly documented to fire after the upload adapter resolves (or immediately after processing if no adapter).

#### Upload Retry Lifecycle

- `retryUpload(fileId)` on `UseFileUploadResult` — re-runs only the upload adapter for files that have artifacts but failed during upload. Does not re-process the pipeline.
- Upload artifacts are now preserved on queue items even when the upload adapter throws, so `retryUpload` can retry without re-processing.
- `cancelUpload` propagates `AbortSignal` to the adapter's in-flight request via the existing `helpers.signal` parameter.
- `retry()` skips items with `needsReselect: true` (restored from IndexedDB without file blobs).

#### Network Awareness

- `autoPauseOnOffline?: boolean` option on `useFileUpload` — registers `online`/`offline` listeners. Automatically pauses processing on disconnect and resumes on reconnect.

#### Screen Wake Lock

- `autoWakeLock?: boolean` option on `useFileUpload` — acquires `navigator.wakeLock.request("screen")` while `isBusy` is true, releases on idle. Re-acquires on `visibilitychange` (browsers auto-release on tab hide).

#### Backpressure Control

- `maxQueuedUploads?: number` on `UseFileUploadOptions` — limits how many files can be in the `"uploading"` state at once. `startUpload` defers starting new files when the backlog is full.

#### Separate Upload Concurrency

- `tuning.maxUploadConcurrency?: number` on `FileUploadTuningOptions` — controls concurrent upload adapter calls independently of pipeline processing concurrency. Uses a separate `Semaphore`.

#### `needsReselect` Flag

- `FileUploadQueueItem.needsReselect?: boolean` — set to `true` on items restored from IndexedDB that lost their file blob. The UI can use this to show a "re-select file" prompt and gate `retry()`.

#### `videoPoster` `produceArtifact` Option

- `produceArtifact?: boolean` option on `VideoPosterPluginOptions` (default: `true`). When `false`, the plugin sets `PIPELINE_CURRENT_KEY` but emits no artifact — for use cases where only the shared context value is needed.

#### Canvas Compression Fallback

- `jpegCompressor` now falls back to Canvas API (`createImageBitmap` + `canvas.toBlob`) when the `browser-image-compression` dynamic import fails or the library is unavailable.
- Fallback supports `maxWidthOrHeight` resize and iterative binary-search quality reduction to meet `maxSizeBytes`.
- Import failure clears the cached module promise so subsequent retries re-attempt the import.

#### Preset `uploadArtifact`

- `uploadArtifact?: (artifact) => void | Promise<void>` on `UploadOptions` — fires for each individual artifact after pipeline completion, letting users upload artifacts without manually iterating the result.

### Changed

#### `supports()` Receives File Size

- `ProcessingPlugin.supports(file)` now receives `size?: number` on the parameter, enabling size-based decisions (e.g. skip compression for files under 500KB).

#### RAW Extension Fallback

- `rawToJpeg.supports()` now also matches `mime.startsWith("image/x-")` as a catch-all for non-standard camera RAW MIME types.

#### `PipelineSource.type` vs `file.type` Normalization

- `runDefaultBrowserPipeline` logs a warning when `source.type` and `source.file.type` differ and prefers `source.type`.

#### Progress for Zero-Plugin Case

- Files with no matching plugins now get `progress: 50` between the `validate-allowlist` and `original` stages, so the UI never shows an instant 0→100 jump.

#### `Semaphore` Public Documentation

- Added `@module` tag and usage examples to the `Semaphore` class JSDoc.

### Fixed

- `fallbackResult()` helper added to `@vivsh1999/upupload/core` for typed `onError` fallback values. `StageOnErrorAction.fallback.value` now has JSDoc clarifying the expected type.

[0.2.0]: https://github.com/anomalyco/upupload/releases/tag/v0.2.0
