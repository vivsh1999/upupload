import { beforeAll, bench, describe } from 'vitest'

import {
  DEFAULT_BROWSER_PIPELINE_OPTIONS,
  preloadBrowserPipelineForFiles,
  runDefaultBrowserPipeline,
} from '../browser/pipeline'
import type { PipelineSource } from '../core/types'

declare global {
  // eslint-disable-next-line no-var
  var __MEDIA_PIPELINE_DOM_CANVAS: boolean | undefined
}

/** Public-domain-style sample DNG (~6 MB). Override with `MEDIA_PIPELINE_BENCH_RAW_URL`. */
const DEFAULT_DNG_URL = 'https://filesamples.com/samples/image/dng/sample1.dng'

function benchRawFixtureUrl(): string {
  const proc = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process
  return proc?.env?.MEDIA_PIPELINE_BENCH_RAW_URL ?? DEFAULT_DNG_URL
}

describe.skipIf(!globalThis.__MEDIA_PIPELINE_DOM_CANVAS)(
  'RAW → JPEG (LibRaw) → optimized JPEG (90% quality, 1 MB max)',
  () => {
    let source: PipelineSource

    beforeAll(
      async () => {
        const url = benchRawFixtureUrl()
        const res = await fetch(url)
        if (!res.ok) {
          throw new Error(`Bench fixture fetch failed (${res.status}): ${url}`)
        }
        const buf = await res.arrayBuffer()
        const file = new File([buf], 'bench-sample.dng', { type: 'application/octet-stream' })
        source = {
          file,
          name: 'bench-sample.dng',
          type: 'application/octet-stream',
        }
        preloadBrowserPipelineForFiles([{ name: file.name, type: file.type }], {
          saveOptimized: true,
          saveThumbnails: false,
        })
      },
      240_000,
    )

    bench(
      'runDefaultBrowserPipeline',
      async () => {
        const out = await runDefaultBrowserPipeline(source, {
          ...DEFAULT_BROWSER_PIPELINE_OPTIONS,
          saveOriginal: false,
          saveOptimized: true,
          saveThumbnails: false,
          qualityPercent: 90,
          optimizedMaxSizeMB: 1,
          maxLongEdge: 'original',
          fallbackToOriginal: false,
          debug: false,
        })
        const optimized = out.artifacts.find((a) => a.variant === 'optimized')
        if (!optimized) {
          const codes = out.info.map((i) => i.code).filter(Boolean)
          throw new Error(`Expected optimized JPEG artifact (info codes: ${codes.join(', ') || 'none'})`)
        }
        if (optimized.file.size > 1.1 * 1024 * 1024) {
          throw new Error(`Expected optimized size ≤ ~1 MB; got ${optimized.file.size} bytes`)
        }
      },
      { iterations: 5, time: 120_000 },
    )
  },
)
