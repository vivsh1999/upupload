import { describe, expect, it, vi } from 'vitest'

import type { PipelineDefinition, PipelineResult, PipelineSource } from './types'
import { runPipeline } from './runPipeline'

function minimalSource(): PipelineSource {
  return {
    file: new Blob(['x'], { type: 'text/plain' }),
    name: 'x.txt',
    type: 'text/plain',
  }
}

describe('runPipeline', () => {
  it('returns empty result when there are no stages', async () => {
    const def: PipelineDefinition<PipelineSource, PipelineResult> = { stages: [] }
    const out = await runPipeline(minimalSource(), def)
    expect(out).toEqual({ artifacts: [], info: [], removeFromQueue: false })
  })

  it('merges results from multiple stages', async () => {
    const src = minimalSource()

    const def: PipelineDefinition<PipelineSource, PipelineResult> = {
      stages: [
        {
          id: 'a',
          when: () => ({ run: true }),
          run: () => ({
            artifacts: [
              {
                variant: 'one',
                file: new Blob(['1']),
                filename: 'one.bin',
                filetype: 'application/octet-stream',
              },
            ],
            info: [{ level: 'info', message: 'a' }],
            removeFromQueue: false,
          }),
        },
        {
          id: 'b',
          when: () => ({ run: true }),
          run: () => ({
            artifacts: [
              {
                variant: 'two',
                file: new Blob(['2']),
                filename: 'two.bin',
                filetype: 'application/octet-stream',
              },
            ],
            info: [{ level: 'warn', message: 'b' }],
            removeFromQueue: true,
          }),
        },
      ],
    }

    const out = await runPipeline(src, def)
    expect(out.artifacts.map((a) => a.variant)).toEqual(['one', 'two'])
    expect(out.info.map((m) => m.message)).toEqual(['a', 'b'])
    expect(out.removeFromQueue).toBe(true)
  })

  it('skips stages when when() returns run: false and logs debug with reason', async () => {
    const log = vi.fn()
    const def: PipelineDefinition<PipelineSource, PipelineResult> = {
      stages: [
        {
          id: 'skip-me',
          when: () => ({ run: false, reason: 'not applicable', code: 'NA' }),
          run: () => {
            throw new Error('run should not be called')
          },
        },
        {
          id: 'run-me',
          when: () => ({ run: true }),
          run: () => ({
            artifacts: [],
            info: [{ level: 'info', message: 'ok' }],
            removeFromQueue: false,
          }),
        },
      ],
    }

    const out = await runPipeline(minimalSource(), def, { logger: log })
    expect(out.info).toEqual([{ level: 'info', message: 'ok' }])
    expect(log).toHaveBeenCalledWith('debug', 'Stage "skip-me" skipped: not applicable', 'NA')
  })

  it('propagates errors when the stage has no onError handler', async () => {
    const def: PipelineDefinition<PipelineSource, PipelineResult> = {
      stages: [
        {
          id: 'boom',
          when: () => ({ run: true }),
          run: () => {
            throw new Error('pipeline failed')
          },
        },
      ],
    }

    await expect(runPipeline(minimalSource(), def)).rejects.toThrow('pipeline failed')
  })

  it('honors onError action throw', async () => {
    const def: PipelineDefinition<PipelineSource, PipelineResult> = {
      stages: [
        {
          id: 'boom',
          when: () => ({ run: true }),
          run: () => {
            throw new Error('fail')
          },
          onError: async () => ({ action: 'throw' }),
        },
      ],
    }

    await expect(runPipeline(minimalSource(), def)).rejects.toThrow('fail')
  })

  it('honors onError action skip and continues later stages', async () => {
    const def: PipelineDefinition<PipelineSource, PipelineResult> = {
      stages: [
        {
          id: 'boom',
          when: () => ({ run: true }),
          run: () => {
            throw new Error('fail')
          },
          onError: async () => ({
            action: 'skip',
            info: { level: 'warn', message: 'recovered', code: 'R1' },
          }),
        },
        {
          id: 'next',
          when: () => ({ run: true }),
          run: () => ({
            artifacts: [
              {
                variant: 'v',
                file: new Blob(['z']),
                filename: 'z.bin',
                filetype: 'application/octet-stream',
              },
            ],
            info: [],
            removeFromQueue: false,
          }),
        },
      ],
    }

    const out = await runPipeline(minimalSource(), def)
    expect(out.artifacts).toHaveLength(1)
    expect(out.info).toEqual([{ level: 'warn', message: 'recovered', code: 'R1' }])
  })

  it('honors onError action fallback and merges fallback value', async () => {
    const def: PipelineDefinition<PipelineSource, PipelineResult> = {
      stages: [
        {
          id: 'boom',
          when: () => ({ run: true }),
          run: () => {
            throw new Error('fail')
          },
          onError: async () => ({
            action: 'fallback',
            value: {
              artifacts: [
                {
                  variant: 'fb',
                  file: new Blob(['fb']),
                  filename: 'fb.bin',
                  filetype: 'application/octet-stream',
                },
              ],
              info: [{ level: 'info', message: 'used fallback' }],
              removeFromQueue: true,
            },
          }),
        },
      ],
    }

    const out = await runPipeline(minimalSource(), def)
    expect(out.artifacts.map((a) => a.variant)).toEqual(['fb'])
    expect(out.info.map((m) => m.message)).toEqual(['used fallback'])
    expect(out.removeFromQueue).toBe(true)
  })

  it('merges removeFromQueue with logical OR across stages', async () => {
    const def: PipelineDefinition<PipelineSource, PipelineResult> = {
      stages: [
        {
          id: 'marks-remove',
          when: () => ({ run: true }),
          run: () => ({
            artifacts: [],
            info: [],
            removeFromQueue: true,
          }),
        },
        {
          id: 'does-not-clear-flag',
          when: () => ({ run: true }),
          run: () => ({
            artifacts: [],
            info: [],
            removeFromQueue: false,
          }),
        },
      ],
    }

    const out = await runPipeline(minimalSource(), def)
    expect(out.removeFromQueue).toBe(true)
  })
})

