import { bench, describe } from "vitest";
import { audioBufferToWav } from "./audio";

function createMockBuffer(channels: number, sampleRate: number, length: number): AudioBuffer {
  return {
    numberOfChannels: channels,
    sampleRate,
    length,
    getChannelData: (_ch: number) => new Float32Array(length),
  } as unknown as AudioBuffer;
}

describe("audioBufferToWav", () => {
  bench("empty buffer (no samples, mono @ 44100)", () => {
    const buf = createMockBuffer(1, 44100, 0);
    audioBufferToWav(buf);
  });

  bench("1 sec mono @ 44100", () => {
    const buf = createMockBuffer(1, 44100, 44100);
    audioBufferToWav(buf);
  });

  bench("5 sec stereo @ 48000", () => {
    const buf = createMockBuffer(2, 48000, 240000);
    audioBufferToWav(buf);
  });

  bench("30 sec stereo @ 44100", () => {
    const buf = createMockBuffer(2, 44100, 1323000);
    audioBufferToWav(buf);
  });
});
