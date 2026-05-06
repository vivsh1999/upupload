declare module 'libraw-wasm' {
  const LibRaw: unknown
  export default LibRaw
}

declare module 'heic-decode' {
  const decode: ((options: { buffer: ArrayBuffer }) => Promise<{
    width: number
    height: number
    data: Uint8ClampedArray
  }>) & {
    all?: unknown
  }
  export default decode
}

declare module 'heic2any' {
  const heic2any: (options: {
    blob: Blob
    toType?: string
    quality?: number
  }) => Promise<Blob | Blob[]>
  export default heic2any
}

declare module 'utif' {
  export const decode: (buffer: ArrayBuffer) => any[]
  export const decodeImage: (buffer: ArrayBuffer, ifd: any) => void
  export const toRGBA8: (ifd: any) => Uint8Array
}

