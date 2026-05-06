import { bench, describe } from 'vitest'

import {
  isAudioLike,
  isSupportedMediaUpload,
  isVideoLike,
  shouldCompressToJpeg,
  shouldUploadWithoutTranscode,
} from '../browser/allowlist'

describe('allowlist hot paths', () => {
  const video = { name: 'clip.mov', type: 'video/quicktime' }
  const raw = { name: 'still.cr3', type: 'application/octet-stream' }
  const raster = { name: 'photo.png', type: 'image/png' }
  const junk = { name: 'readme.txt', type: 'text/plain' }

  bench('isSupportedMediaUpload (video)', () => {
    isSupportedMediaUpload(video)
  })

  bench('isSupportedMediaUpload (RAW octet-stream)', () => {
    isSupportedMediaUpload(raw)
  })

  bench('isSupportedMediaUpload (reject)', () => {
    isSupportedMediaUpload(junk)
  })

  bench('isVideoLike + isAudioLike', () => {
    isVideoLike(video)
    isAudioLike({ name: 'a.flac', type: 'audio/flac' })
  })

  bench('shouldUploadWithoutTranscode + shouldCompressToJpeg', () => {
    shouldUploadWithoutTranscode(video)
    shouldCompressToJpeg(raster)
  })
})
