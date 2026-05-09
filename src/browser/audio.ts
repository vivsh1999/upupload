/** @module browser/audio */

export function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const length = buffer.length;
  const byteRate = sampleRate * numChannels * 2;
  const blockAlign = numChannels * 2;
  const dataSize = length * blockAlign;
  const buf = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buf);

  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let ch = 0; ch < numChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      const s = Math.max(-1, Math.min(1, data[i]));
      view.setInt16(offset + ch * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      if (ch === numChannels - 1) offset += blockAlign;
    }
  }
  return new Blob([buf], { type: "audio/wav" });
}

export interface SharedAudioContext {
  ctx: AudioContext;
  /** Release the context reference. When all references are released, the context is closed. */
  release: () => void;
}

const audioContextPool = new Map<string, { ctx: AudioContext; refCount: number }>();

/**
 * Acquire a shared AudioContext identified by a pool key.
 * Stages that need AudioContext should call this instead of `new AudioContext()`
 * to reuse the same context within a pipeline run.
 *
 * Call `release()` on the returned object when done.
 */
export function acquireAudioContext(poolKey = "default"): SharedAudioContext {
  let entry = audioContextPool.get(poolKey);
  if (!entry) {
    entry = { ctx: new AudioContext(), refCount: 0 };
    audioContextPool.set(poolKey, entry);
  }
  entry.refCount++;
  let released = false;
  return {
    ctx: entry.ctx,
    release: () => {
      if (released) return;
      released = true;
      entry!.refCount--;
      if (entry!.refCount <= 0) {
        entry!.ctx.close().catch(() => {});
        audioContextPool.delete(poolKey);
      }
    },
  };
}

/**
 * Check whether a given MIME type is supported by MediaRecorder.
 */
export function isMediaRecorderSupported(mimeType: string): boolean {
  if (typeof MediaRecorder === "undefined") return false;
  return MediaRecorder.isTypeSupported(mimeType);
}
