import { describe, expect, it } from 'vitest'

import {
  fileExtensionLower,
  isAudioLike,
  isCameraRawImage,
  isSupportedMediaUpload,
  isVideoLike,
  shouldCompressToJpeg,
  shouldUploadWithoutTranscode,
} from './allowlist'

describe('fileExtensionLower', () => {
  it('returns lowercase extension including dot', () => {
    expect(fileExtensionLower('IMG.JPG')).toBe('.jpg')
  })

  it('returns empty string when there is no extension', () => {
    expect(fileExtensionLower('README')).toBe('')
  })

  it('uses the last dot for compound names', () => {
    expect(fileExtensionLower('archive.tar.gz')).toBe('.gz')
  })
})

describe('isSupportedMediaUpload', () => {
  it('accepts common video MIME types', () => {
    expect(isSupportedMediaUpload({ name: 'x', type: 'video/mp4' })).toBe(true)
  })

  it('accepts common audio MIME types', () => {
    expect(isSupportedMediaUpload({ name: 'x', type: 'audio/mpeg' })).toBe(true)
  })

  it('accepts image MIME types', () => {
    expect(isSupportedMediaUpload({ name: 'x', type: 'image/png' })).toBe(true)
  })

  it('accepts known extensions when MIME is empty', () => {
    expect(isSupportedMediaUpload({ name: 'clip.mov', type: '' })).toBe(true)
    expect(isSupportedMediaUpload({ name: 'track.flac', type: null })).toBe(true)
    expect(isSupportedMediaUpload({ name: 'photo.heic', type: undefined })).toBe(true)
  })

  it('accepts camera RAW via extension', () => {
    expect(isSupportedMediaUpload({ name: 'shot.cr3', type: 'application/octet-stream' })).toBe(
      true,
    )
  })

  it('rejects arbitrary binary without media extension', () => {
    expect(isSupportedMediaUpload({ name: 'setup.exe', type: 'application/octet-stream' })).toBe(
      false,
    )
  })

  it('rejects non-media files', () => {
    expect(isSupportedMediaUpload({ name: 'notes.txt', type: 'text/plain' })).toBe(false)
  })
})

describe('isVideoLike', () => {
  it('detects video MIME prefix', () => {
    expect(isVideoLike({ name: 'x', type: 'video/webm' })).toBe(true)
  })

  it('detects video by extension when MIME is not video/', () => {
    expect(isVideoLike({ name: 'file.mkv', type: '' })).toBe(true)
  })
})

describe('isAudioLike', () => {
  it('detects audio MIME prefix', () => {
    expect(isAudioLike({ name: 'x', type: 'audio/ogg' })).toBe(true)
  })

  it('detects audio by extension', () => {
    expect(isAudioLike({ name: 'song.m4a', type: '' })).toBe(true)
  })
})

describe('shouldUploadWithoutTranscode', () => {
  it('is true for video and audio', () => {
    expect(shouldUploadWithoutTranscode({ name: 'a.mp4', type: 'video/mp4' })).toBe(true)
    expect(shouldUploadWithoutTranscode({ name: 'b.wav', type: 'audio/wav' })).toBe(true)
  })

  it('is true for SVG', () => {
    expect(shouldUploadWithoutTranscode({ name: 'icon.svg', type: 'image/svg+xml' })).toBe(true)
  })

  it('is false for raster images that may be compressed', () => {
    expect(shouldUploadWithoutTranscode({ name: 'pic.png', type: 'image/png' })).toBe(false)
  })
})

describe('shouldCompressToJpeg', () => {
  it('is true for raster images', () => {
    expect(shouldCompressToJpeg({ name: 'a.png', type: 'image/png' })).toBe(true)
  })

  it('is true for RAW by extension', () => {
    expect(shouldCompressToJpeg({ name: 'raw.nef', type: 'application/octet-stream' })).toBe(true)
  })

  it('is false for video and SVG', () => {
    expect(shouldCompressToJpeg({ name: 'm.mov', type: 'video/quicktime' })).toBe(false)
    expect(shouldCompressToJpeg({ name: 'v.svg', type: 'image/svg+xml' })).toBe(false)
  })
})

describe('isCameraRawImage', () => {
  it('detects RAW extensions case-insensitively via fileExtensionLower', () => {
    expect(isCameraRawImage({ name: 'X.DNG', type: '' })).toBe(true)
    expect(isCameraRawImage({ name: 'y.jpg', type: 'image/jpeg' })).toBe(false)
  })
})
