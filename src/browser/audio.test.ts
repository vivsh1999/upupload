import { describe, expect, it } from "vitest";
import { audioBufferToWav, isMediaRecorderSupported } from "./audio";

const HAS_AUDIO_CONTEXT =
  typeof AudioContext !== "undefined" || typeof (globalThis as any).AudioContext !== "undefined";

describe("audioBufferToWav", () => {
  it("handles an empty buffer by producing a header-only WAV", () => {
    // When AudioContext is not available, create a minimal manual AudioBuffer
    // We test the serialization function directly using a minimal mock
    const fakeBuffer = {
      numberOfChannels: 1,
      sampleRate: 44100,
      length: 0,
      getChannelData: () => new Float32Array(0),
    };
    const blob = audioBufferToWav(fakeBuffer as any);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("audio/wav");
    expect(blob.size).toBe(44); // header only
  });

  it("produces a valid RIFF/WAVE header", async () => {
    const fakeBuffer = {
      numberOfChannels: 1,
      sampleRate: 44100,
      length: 100,
      getChannelData: () => new Float32Array(100),
    };
    const blob = audioBufferToWav(fakeBuffer as any);
    const arrayBuf = await blob.arrayBuffer();
    const view = new DataView(arrayBuf);
    expect(
      String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3)),
    ).toBe("RIFF");
    expect(
      String.fromCharCode(view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11)),
    ).toBe("WAVE");
    expect(
      String.fromCharCode(
        view.getUint8(12),
        view.getUint8(13),
        view.getUint8(14),
        view.getUint8(15),
      ),
    ).toBe("fmt ");
    expect(view.getUint16(20, true)).toBe(1);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(44100);
    expect(view.getUint16(34, true)).toBe(16);
    expect(
      String.fromCharCode(
        view.getUint8(36),
        view.getUint8(37),
        view.getUint8(38),
        view.getUint8(39),
      ),
    ).toBe("data");
  });

  it("calculates correct data size for stereo 16-bit", () => {
    const fakeBuffer = {
      numberOfChannels: 2,
      sampleRate: 48000,
      length: 1000,
      getChannelData: () => new Float32Array(1000),
    };
    const blob = audioBufferToWav(fakeBuffer as any);
    // 44 header + 1000 samples * 2 channels * 2 bytes
    expect(blob.size).toBe(44 + 4000);
  });
});

describe("isMediaRecorderSupported", () => {
  it("returns a boolean for known MIME types", () => {
    const result = isMediaRecorderSupported("audio/mpeg");
    expect(typeof result).toBe("boolean");
  });

  it("handles undefined MediaRecorder gracefully", () => {
    const result = isMediaRecorderSupported("audio/webm;codecs=opus");
    expect(typeof result).toBe("boolean");
  });
});
