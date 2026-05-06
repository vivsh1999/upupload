declare module "libraw-wasm" {
  export interface RawImageData {
    bits: number;
    colors: number;
    data: Uint8ClampedArray | Uint8Array;
    dataSize: number;
    width: number;
    height: number;
  }

  export default class LibRaw {
    constructor();
    open(buffer: Uint8Array, settings?: Record<string, unknown>): Promise<void>;
    metadata(full?: boolean): Promise<Record<string, unknown>>;
    imageData(): Promise<RawImageData>;
  }
}
