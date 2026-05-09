# Podcast Audio Publishing Pipeline

A case study for building a podcast publishing platform with UpUpload. Podcasters upload raw studio recordings; the library normalizes loudness, trims silence, encodes in multiple distribution formats, embeds metadata, and generates waveform previews — all in the browser before upload.

## Scenario

- **Who**: Podcast publishing platform where creators submit episodes.
- **Input**: Studio recordings — WAV, AIFF, FLAC, or high-bitrate MP3.
- **Output**: Distribution-ready audio variants (MP3, AAC, Opus) + waveform preview image + metadata-stamped ID3 tags.
- **Key constraint**: Every episode must sound consistent (same broadcast loudness, no excessive leading silence, standard formats) regardless of the creator's microphone, room, or recording software.

## Architecture

```
Browser Input (WAV / AIFF / FLAC / MP3 from any recording setup)
       │
       ▼
┌──────────────────────────────────────────────────┐
│  UpUpload Pipeline                               │
│                                                  │
│  1. validate-allowlist   (reject non-audio)      │
│  2. original             (always included)       │
│  3. audio-normalizer     (LUFS normalization)    │
│  4. silence-trimmer      (trim leading/trailing) │
│  5. normalizer           (re-normalize after     │
│      (with())             trim changes duration) │
│  6. multi-format-encoder × 3  (mp3 / aac / opus)│
│  7. metadata-tagger      (ID3 tags per variant)  │
│  8. waveform-generator   (PNG waveform preview)  │
└──────────────────────────────────────────────────┘
       │
       ▼
  Processed audio variants + waveform preview
  Queue items have status "complete"
  Original is always present (variant: "original")
       │
       ▼
  You upload via signed URL / fetch / TUS
```

## Installation

```bash
npm install @vivsh1999/upupload
npm install lamejs                # MP3 encoding
```

## Complete Implementation

### 1. Audio Normalizer Plugin (LUFS)

Reads the current audio file from `pipeline:current`, analyzes loudness, and applies gain to target −16 LUFS (integrated).

```ts
import { Plugin } from "@vivsh1999/upupload/plugins";
import { emptyResult } from "@vivsh1999/upupload/core";
import {
  PIPELINE_CURRENT_KEY,
  acquireAudioContext,
  audioBufferToWav,
} from "@vivsh1999/upupload/browser";

export interface AudioNormalizerOptions {
  /** Target integrated loudness in LUFS. Default: −16. */
  targetLoudness?: number;
  /** Maximum gain adjustment in dB. Default: 12. */
  maxGainDb?: number;
}

/**
 * Normalize audio loudness to a target LUFS level using the Web Audio API.
 * Uses `emptyResult()` since this is a virtual stage that mutates shared context.
 */
export const audioNormalizerPlugin = new Plugin<AudioNormalizerOptions>({
  id: "audio-normalizer",
  name: "Audio Normalizer",
  options: { targetLoudness: -16, maxGainDb: 12 },
  supports: (file) => (file.type ?? "").startsWith("audio/"),
  sharedKeys: { output: "audio-normalizer:output" },
  run: async (input, opts, classif, ctx) => {
    const sourceFile = (ctx.shared.get(PIPELINE_CURRENT_KEY) as File | undefined) ?? input.file;

    const { ctx: audioCtx, release } = acquireAudioContext();
    try {
      const arrayBuf = await sourceFile.arrayBuffer();
      const audioBuf = await audioCtx.decodeAudioData(arrayBuf);

      // Measure RMS power across all channels
      let totalPower = 0;
      let totalSamples = 0;
      for (let ch = 0; ch < audioBuf.numberOfChannels; ch++) {
        const data = audioBuf.getChannelData(ch);
        for (let i = 0; i < data.length; i++) {
          totalPower += data[i] * data[i];
          totalSamples++;
        }
      }
      const rms = Math.sqrt(totalPower / totalSamples);
      // Approximate LUFS from RMS (simplified — real LUFS uses K-weighting)
      const currentLoudness = -0.691 + 20 * Math.log10(rms);
      const gainDb = Math.min(opts.maxGainDb!, opts.targetLoudness! - currentLoudness);
      const gainLinear = 10 ** (gainDb / 20);

      // Apply gain via OfflineAudioContext
      const offline = new OfflineAudioContext(
        audioBuf.numberOfChannels,
        audioBuf.length,
        audioBuf.sampleRate,
      );
      const source = offline.createBufferSource();
      source.buffer = audioBuf;
      const gainNode = offline.createGain();
      gainNode.gain.value = gainLinear;
      source.connect(gainNode);
      gainNode.connect(offline.destination);
      source.start();

      const rendered = await offline.startRendering();

      const wavBlob = audioBufferToWav(rendered);
      const normalized = new File([wavBlob], `${classif.stemName}.normalized.wav`, {
        type: "audio/wav",
        lastModified: Date.now(),
      });
      ctx.shared.set(PIPELINE_CURRENT_KEY, normalized);
      ctx.shared.set("audio-normalizer:output", normalized);
    } finally {
      release();
    }

    return emptyResult();
  },
});
```

Note: `audioBufferToWav()` is provided by the library — no more manual DataView manipulation. And `acquireAudioContext()` pools `AudioContext` instances across stages so you don't create a new one per plugin.

### 2. Silence Trimmer Plugin

Removes silence from the beginning and end of the recording.

```ts
import { emptyResult, infoMessage } from "@vivsh1999/upupload/core";
import {
  PIPELINE_CURRENT_KEY,
  acquireAudioContext,
  audioBufferToWav,
} from "@vivsh1999/upupload/browser";

export interface SilenceTrimmerOptions {
  /** RMS threshold below which audio is considered silence. Default: 0.005. */
  threshold?: number;
  /** Minimum silence duration in seconds to trigger a trim. Default: 0.5. */
  minSilenceSec?: number;
}

export const silenceTrimmerPlugin = new Plugin<SilenceTrimmerOptions>({
  id: "silence-trimmer",
  name: "Silence Trimmer",
  options: { threshold: 0.005, minSilenceSec: 0.5 },
  supports: (file) => (file.type ?? "").startsWith("audio/"),
  sharedKeys: { output: "silence-trimmer:output" },
  run: async (input, opts, classif, ctx) => {
    const sourceFile = (ctx.shared.get(PIPELINE_CURRENT_KEY) as File | undefined) ?? input.file;

    const { ctx: audioCtx, release } = acquireAudioContext();
    try {
      const arrayBuf = await sourceFile.arrayBuffer();
      const audioBuf = await audioCtx.decodeAudioData(arrayBuf);

      const threshold = opts.threshold!;
      const minSilenceFrames = Math.round(opts.minSilenceSec! * audioBuf.sampleRate);

      // Find leading trim point
      let startFrame = 0;
      const ch0 = audioBuf.getChannelData(0);
      while (startFrame < ch0.length - minSilenceFrames) {
        let isSilent = true;
        for (let s = 0; s < minSilenceFrames; s++) {
          if (Math.abs(ch0[startFrame + s]) > threshold) {
            isSilent = false;
            break;
          }
        }
        if (!isSilent) break;
        startFrame++;
      }

      // Find trailing trim point
      let endFrame = audioBuf.length;
      while (endFrame > minSilenceFrames) {
        let isSilent = true;
        for (let s = 0; s < minSilenceFrames; s++) {
          if (Math.abs(ch0[endFrame - 1 - s]) > threshold) {
            isSilent = false;
            break;
          }
        }
        if (!isSilent) break;
        endFrame--;
      }

      if (startFrame === 0 && endFrame === audioBuf.length) {
        return emptyResult();
      }

      const trimmedLength = endFrame - startFrame;
      const offline = new OfflineAudioContext(
        audioBuf.numberOfChannels,
        trimmedLength,
        audioBuf.sampleRate,
      );
      const trimmedBuf = audioCtx.createBuffer(
        audioBuf.numberOfChannels,
        trimmedLength,
        audioBuf.sampleRate,
      );
      for (let ch = 0; ch < audioBuf.numberOfChannels; ch++) {
        const src = audioBuf.getChannelData(ch);
        const dst = trimmedBuf.getChannelData(ch);
        for (let i = 0; i < trimmedLength; i++) {
          dst[i] = src[startFrame + i];
        }
      }
      const source = offline.createBufferSource();
      source.buffer = trimmedBuf;
      source.connect(offline.destination);
      source.start();
      const rendered = await offline.startRendering();

      const wavBlob = audioBufferToWav(rendered);
      const trimmed = new File([wavBlob], `${classif.stemName}.trimmed.wav`, {
        type: "audio/wav",
        lastModified: Date.now(),
      });
      ctx.shared.set(PIPELINE_CURRENT_KEY, trimmed);
      ctx.shared.set("silence-trimmer:output", trimmed);

      const trimmedSec = ((audioBuf.length - trimmedLength) / audioBuf.sampleRate).toFixed(1);
      return {
        artifacts: [],
        info: [infoMessage(`Trimmed ${trimmedSec}s of silence.`, "silence_trimmed")],
        removeFromQueue: false,
      };
    } finally {
      release();
    }
  },
});
```

### 3. Multi-Format Encoder Plugin

Encodes audio into multiple distribution formats. Each instance produces one variant via `.with()`.

```ts
import { artifact } from "@vivsh1999/upupload/core";
import { PIPELINE_CURRENT_KEY, acquireAudioContext } from "@vivsh1999/upupload/browser";

export interface AudioEncoderOptions {
  /** Output variant label (e.g. "mp3", "aac", "opus"). */
  variant: string;
  /** Bitrate in kbps. Default: 128. */
  bitrate?: number;
  /** Sample rate in Hz. Default: 44100. */
  sampleRate?: number;
}

export const audioEncoderPlugin = new Plugin<AudioEncoderOptions>({
  id: "audio-encoder",
  name: "Audio Encoder",
  options: { variant: "mp3", bitrate: 128, sampleRate: 44100 },
  supports: (file) => (file.type ?? "").startsWith("audio/"),
  sharedKeys: { output: "audio-encoder:output" },
  run: async (input, opts, classif, ctx) => {
    const sourceFile = (ctx.shared.get(PIPELINE_CURRENT_KEY) as File | undefined) ?? input.file;
    const filename = `${classif.stemName}.${opts.variant}`;
    const mimeType =
      opts.variant === "mp3"
        ? "audio/mpeg"
        : opts.variant === "aac"
          ? "audio/aac"
          : opts.variant === "opus"
            ? "audio/opus"
            : "audio/mpeg";

    if (opts.variant === "mp3") {
      const { ctx: audioCtx, release } = acquireAudioContext();
      try {
        const arrayBuf = await sourceFile.arrayBuffer();
        const audioBuf = await audioCtx.decodeAudioData(arrayBuf);

        const { Mp3Encoder } = await import("lamejs");
        const channels = audioBuf.numberOfChannels;
        const sampleRate = opts.sampleRate!;
        const bitrate = opts.bitrate!;
        const encoder = new Mp3Encoder(channels, sampleRate, bitrate);
        const chData: Float32Array[] = [];
        for (let ch = 0; ch < channels; ch++) {
          chData.push(audioBuf.getChannelData(ch));
        }

        const mp3Buffers: Uint8Array[] = [];
        const blockSize = 1152;
        const samplesPerChannel = audioBuf.length;
        for (let i = 0; i < samplesPerChannel; i += blockSize) {
          const remaining = samplesPerChannel - i;
          const take = Math.min(blockSize, remaining);
          const channelSamples: number[][] = [];
          for (let ch = 0; ch < channels; ch++) {
            const samples: number[] = [];
            const data = chData[ch];
            for (let j = 0; j < take; j++) {
              const s = data[i + j];
              samples.push(s < 0 ? s * 0x8000 : s * 0x7fff);
            }
            channelSamples.push(samples);
          }
          const mp3Buf =
            channels === 1
              ? encoder.encodeBuffer(channelSamples[0])
              : encoder.encodeBuffer(channelSamples[0], channelSamples[1]);
          if (mp3Buf.length > 0) mp3Buffers.push(mp3Buf);
        }
        const last = encoder.flush();
        if (last.length > 0) mp3Buffers.push(last);

        const totalLen = mp3Buffers.reduce((a, b) => a + b.length, 0);
        const combined = new Uint8Array(totalLen);
        let offset = 0;
        for (const buf of mp3Buffers) {
          combined.set(buf, offset);
          offset += buf.length;
        }

        const blob = new Blob([combined], { type: mimeType });
        const encoded = new File([blob], filename, { type: mimeType, lastModified: Date.now() });
        // Update pipeline:current so the metadata tagger can embed ID3 tags
        ctx.shared.set(PIPELINE_CURRENT_KEY, encoded);
        return {
          artifacts: [artifact(opts.variant, blob, filename, mimeType)],
          info: [],
          removeFromQueue: false,
        };
      } finally {
        release();
      }
    }

    // AAC / Opus via MediaRecorder
    const blob = await new Promise<Blob>((resolve, reject) => {
      const mr = new MediaRecorder(new Blob([sourceFile], { type: sourceFile.type }), {
        mimeType,
      });
      const chunks: Blob[] = [];
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      mr.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
      mr.onerror = () => reject(new Error(`Encoding failed for ${opts.variant}`));
      mr.start();
      setTimeout(() => mr.stop(), 5000);
    });

    return {
      artifacts: [artifact(opts.variant, blob, filename, mimeType)],
      info: [],
      removeFromQueue: false,
    };
  },
});
```

### 4. Metadata Tagger Plugin

Embeds ID3v2 tags into the encoded MP3.

```ts
import { artifact, infoMessage } from "@vivsh1999/upupload/core";
import { PIPELINE_CURRENT_KEY } from "@vivsh1999/upupload/browser";

export interface MetadataTaggerOptions {
  episodeTitle?: string;
  showName?: string;
  episodeNumber?: number;
  seasonNumber?: number;
  artist?: string;
  year?: number;
  genre?: string;
}

export const metadataTaggerPlugin = new Plugin<MetadataTaggerOptions>({
  id: "metadata-tagger",
  name: "Metadata Tagger",
  options: {},
  supports: (file) => (file.type ?? "").startsWith("audio/"),
  after: ["audio-encoder"],
  run: async (input, opts, classif, ctx) => {
    const sourceFile = (ctx.shared.get(PIPELINE_CURRENT_KEY) as File | undefined) ?? input.file;
    const arrayBuf = await sourceFile.arrayBuffer();
    const original = new Uint8Array(arrayBuf);

    // Build minimal ID3v2.3 header + frames
    const frames: Uint8Array[] = [];

    const textFrame = (id: string, text: string) => {
      const encoded = new TextEncoder().encode(text + "\0");
      const header = new Uint8Array(10);
      header.set(new TextEncoder().encode(id), 0);
      const size = encoded.length;
      header[3] = 0;
      header[4] = (size >> 21) & 0x7f;
      header[5] = (size >> 14) & 0x7f;
      header[6] = (size >> 7) & 0x7f;
      header[7] = size & 0x7f;
      const frame = new Uint8Array(10 + encoded.length);
      frame.set(header, 0);
      frame.set(encoded, 10);
      frames.push(frame);
    };

    if (opts.episodeTitle) textFrame("TIT2", opts.episodeTitle);
    if (opts.showName) textFrame("TPE1", opts.showName);
    if (opts.artist) textFrame("TPE2", opts.artist);
    if (opts.genre) textFrame("TCON", opts.genre);
    if (opts.year) textFrame("TYER", String(opts.year));
    if (opts.episodeNumber != null) textFrame("TRCK", String(opts.episodeNumber));

    const frameDataLen = frames.reduce((a, f) => a + f.length, 0);
    const id3Size = 10 + frameDataLen;
    const id3 = new Uint8Array(id3Size);
    id3.set(new TextEncoder().encode("ID3"), 0);
    id3[3] = 3;
    id3[4] = 0;
    id3[6] = (frameDataLen >> 21) & 0x7f;
    id3[7] = (frameDataLen >> 14) & 0x7f;
    id3[8] = (frameDataLen >> 7) & 0x7f;
    id3[9] = frameDataLen & 0x7f;
    let off = 10;
    for (const f of frames) {
      id3.set(f, off);
      off += f.length;
    }

    const tagged = new Uint8Array(id3.length + original.length);
    tagged.set(id3, 0);
    tagged.set(original, id3.length);

    const taggedBlob = new Blob([tagged], { type: "audio/mpeg" });
    const taggedFilename = `${classif.stemName}.tagged.mp3`;
    ctx.shared.set("metadata-tagger:output", taggedBlob);

    return {
      artifacts: [artifact("tagged", taggedBlob, taggedFilename, "audio/mpeg")],
      info: [infoMessage("ID3 tags applied.", "tags_applied")],
      removeFromQueue: false,
    };
  },
});
```

### 5. Waveform Generator Plugin

Renders a PNG waveform visualization using the built-in `createCanvas()` utility.

```ts
import { artifact } from "@vivsh1999/upupload/core";
import {
  PIPELINE_CURRENT_KEY,
  acquireAudioContext,
  createCanvas,
} from "@vivsh1999/upupload/browser";

export interface WaveformOptions {
  /** Width of the waveform image in pixels. Default: 1200. */
  width?: number;
  /** Height of the waveform image in pixels. Default: 320. */
  height?: number;
  /** Foreground color (CSS). Default: "#6366f1". */
  color?: string;
  /** Background color (CSS). Default: "transparent". */
  backgroundColor?: string;
}

export const waveformPlugin = new Plugin<WaveformOptions>({
  id: "waveform-generator",
  name: "Waveform Generator",
  options: { width: 1200, height: 320, color: "#6366f1" },
  supports: (file) => (file.type ?? "").startsWith("audio/"),
  sharedKeys: { output: "waveform-generator:output" },
  run: async (input, opts, classif, ctx) => {
    const sourceFile = (ctx.shared.get(PIPELINE_CURRENT_KEY) as File | undefined) ?? input.file;

    const { ctx: audioCtx, release } = acquireAudioContext();
    try {
      const arrayBuf = await sourceFile.arrayBuffer();
      const audioBuf = await audioCtx.decodeAudioData(arrayBuf);

      const width = opts.width!;
      const height = opts.height!;
      const samples = width * 2;
      const data = audioBuf.getChannelData(0);
      const step = Math.max(1, Math.floor(data.length / samples));

      // Compute peak envelope
      const peaks: number[] = [];
      for (let i = 0; i < samples; i++) {
        let max = 0;
        const start = i * step;
        for (let j = 0; j < step && start + j < data.length; j++) {
          const abs = Math.abs(data[start + j]);
          if (abs > max) max = abs;
        }
        peaks.push(max);
      }

      // Use createCanvas() — auto-selects OffscreenCanvas or falls back to HTMLCanvasElement
      const { getContext, toBlob } = createCanvas(width, height);
      const cctx = getContext()!;
      if (opts.backgroundColor && opts.backgroundColor !== "transparent") {
        cctx.fillStyle = opts.backgroundColor;
        cctx.fillRect(0, 0, width, height);
      }

      const midY = height / 2;
      const barWidth = width / samples;
      cctx.fillStyle = opts.color!;
      for (let i = 0; i < samples; i++) {
        const barH = Math.max(1, peaks[i] * midY * 0.9);
        const x = i * barWidth;
        cctx.fillRect(x, midY - barH, Math.max(1, barWidth - 1), barH * 2);
      }

      const blob = await toBlob("image/png");
      return {
        artifacts: [artifact("waveform", blob!, `${classif.stemName}.waveform.png`, "image/png")],
        info: [],
        removeFromQueue: false,
      };
    } finally {
      release();
    }
  },
});
```

### 6. Plugin Registry + Pipeline Definitions

```tsx
import { useMemo } from "react";
import { useMediaUpload, PluginProvider } from "@vivsh1999/upupload/react";
import {
  audioNormalizerPlugin,
  silenceTrimmerPlugin,
  audioEncoderPlugin,
  metadataTaggerPlugin,
  waveformPlugin,
} from "./audio-plugins";
```

Use `.with({...}, { instanceId })` so multi-instance plugins get unique IDs — no more duplicate warnings:

```tsx
const pp = new PluginProvider([
  audioNormalizerPlugin,
  silenceTrimmerPlugin,
  audioNormalizerPlugin.with({ targetLoudness: -16 }, { instanceId: "post-trim" }),
  audioEncoderPlugin.with({ variant: "mp3", bitrate: 128 }, { instanceId: "mp3" }),
  audioEncoderPlugin.with({ variant: "aac", bitrate: 96 }, { instanceId: "aac" }),
  audioEncoderPlugin.with({ variant: "opus", bitrate: 64 }, { instanceId: "opus" }),
  metadataTaggerPlugin,
  waveformPlugin.with({ width: 1200, height: 320, color: "#6366f1" }),
]);

function PodcastUploader({
  episode,
}: {
  episode: { title: string; show: string; number: number };
}) {
  const pipelines = useMemo(
    () => [
      {
        id: "podcast-episode",
        pipelines: [
          {
            id: "audio",
            supports: (f: any) => (f.type ?? "").startsWith("audio/"),
            plugins: [
              pp.audioNormalizer({ targetLoudness: -16 }),
              pp.silenceTrimmer({ threshold: 0.005, minSilenceSec: 0.5 }),
              pp.audioNormalizer({ targetLoudness: -16 }),
              pp.audioEncoder({ variant: "mp3", bitrate: 128 }),
              pp.audioEncoder({ variant: "aac", bitrate: 96 }),
              pp.audioEncoder({ variant: "opus", bitrate: 64 }),
              pp.metadataTagger({
                episodeTitle: episode.title,
                showName: episode.show,
                episodeNumber: episode.number,
              }),
              pp.waveformGenerator({ width: 1200, height: 320 }),
            ],
          },
        ],
      },
    ],
    [episode],
  );

  const {
    queue,
    startUpload,
    clear,
    retry,
    cancelUpload,
    isBusy,
    isDragOver,
    getDropTargetProps,
    getFileInputProps,
  } = useMediaUpload({
    plugins: pp.plugins,
    pipeline: pipelines,
    maxNumberOfFiles: 1,
    tuning: { maxConcurrency: 2 },
    getMeta: (file) => ({ episodeTitle: episode.title, showName: episode.show }),
    onWarning: (msg) => console.warn("[podcast]", msg),
    onError: (err, ctx) => console.error(`Failed: ${ctx?.fileName}`, err),
    onFileComplete: (item) => {
      const uploadables = item.artifacts?.filter((a) => a.variant !== "original") ?? [];
      for (const art of uploadables) {
        const form = new FormData();
        form.append("file", art.blob, art.filename);
        form.append("variant", art.variant);
        form.append("episodeId", episode.id ?? "");
        fetch("/api/podcast/episodes/media", { method: "POST", body: form }).catch((err) =>
          console.error(`Upload failed for ${art.filename}`, err),
        );
      }
    },
  });

  return (
    <div className="podcast-uploader">
      <div
        {...getDropTargetProps<HTMLDivElement>()}
        className={`drop-zone ${isDragOver ? "drag-over" : ""}`}
      >
        <p>Drop raw studio recording here</p>
        <input {...getFileInputProps()} accept="audio/*" />
        <p className="hint">Supports WAV, AIFF, FLAC, MP3 — normalized to broadcast loudness</p>
      </div>

      <ul className="file-list">
        {queue.map((item) => (
          <li key={item.id} className={`item status-${item.status}`}>
            <span className="name">{item.name}</span>
            <span className="status">
              {item.status === "processing" && `Processing ${item.progress}%`}
              {item.status === "complete" &&
                item.artifacts?.map((a) => <span key={a.variant}>{a.variant}: done </span>)}
              {item.status === "error" && <span className="error">{item.error}</span>}
            </span>
            <div className="actions">
              {item.status === "error" && <button onClick={() => retry(item.id)}>Retry</button>}
              {(item.status === "idle" || item.status === "processing") && (
                <button onClick={() => cancelUpload(item.id)}>Cancel</button>
              )}
            </div>
          </li>
        ))}
      </ul>

      <div className="actions-bar">
        <button onClick={() => startUpload()} disabled={isBusy || queue.length === 0}>
          {isBusy ? "Processing..." : "Process Episode"}
        </button>
        <button onClick={clear} disabled={isBusy}>
          Clear
        </button>
      </div>

      {queue
        .filter((i) => i.status === "complete")
        .map((item) => {
          const waveform = item.artifacts?.find((a) => a.variant === "waveform");
          return waveform ? (
            <div key={item.id} className="waveform-preview">
              <img src={URL.createObjectURL(waveform.blob)} alt="Waveform" />
            </div>
          ) : null;
        })}
    </div>
  );
}
```

### 7. What the Platform Receives

| Creator's file                  | Platform receives                                                                     |
| ------------------------------- | ------------------------------------------------------------------------------------- |
| `interview.wav` (48 MB, 44 min) | `interview.mp3` (8 MB) + `interview.aac` (5 MB) + `interview.opus` (3 MB)             |
| `episode-42.aiff` (120 MB)      | `episode-42.mp3` (12 MB) + `episode-42.aac` (8 MB) + `episode-42.opus` (5 MB)         |
| `raw-recording.flac` (32 MB)    | `raw-recording.mp3` (6 MB) + `raw-recording.aac` (4 MB) + `raw-recording.opus` (2 MB) |

Every variant also receives:

- ID3v2 tags with episode title, show name, episode number
- `waveform.png` (1200×320, 15–30 KB) for the player UI

## Custom Plugin Details

### How Audio Plugins Chain Together

```
pipeline:current  →  normalizer  →  pipeline:current  →  trimmer  →  pipeline:current
      │                                                                │
      └── original.wav                                                │
                                                                       ▼
                                                              normalizer (re-run)
                                                                       │
                                                                       ▼
                                                              pipeline:current
                                                                       │
              ┌────────────────────────────────────────────────────────┼──────────────────────────────────────┐
              ▼                                                        ▼                                      ▼
      encoder (MP3)                                            encoder (AAC)                          encoder (Opus)
              │                                                        │                                      │
              ├──→ artifact: mp3                                      ├──→ artifact: aac                    ├──→ artifact: opus
              │                                                        │                                      │
              ▼                                                        │                                      │
      pipeline:current                                                 │                                      │
              │                                                        │                                      │
              ├────────────────────────────────────────────────────────┼──────────────────────────────────────┘
              │                                                        │
              ▼                                                        ▼
     metadata-tagger                                          waveform-generator
              │                                                        │
              ▼                                                        ▼
     artifact: tagged.mp3                                     artifact: waveform.png
```

### What Changed

Compared to the original case study, this version uses:

| Pattern            | Before                                                | After                                 |
| ------------------ | ----------------------------------------------------- | ------------------------------------- |
| Return value       | `{ artifacts: [], info: [], removeFromQueue: false }` | `emptyResult()`                       |
| Artifact creation  | Inline object                                         | `artifact(variant, blob, name)`       |
| Warning messages   | Inline object                                         | `warning("msg", "code")`              |
| Info messages      | Inline object                                         | `infoMessage("msg", "code")`          |
| Stage wrapper      | `createStages: () => [{ id, run }]`                   | `run: (input, opts, classif, ctx) =>` |
| AudioContext       | `new AudioContext()`                                  | `acquireAudioContext()` (pooled)      |
| WAV conversion     | 40-line manual DataView                               | `audioBufferToWav()` (built-in)       |
| Canvas creation    | `new OffscreenCanvas()`                               | `createCanvas()` (with fallback)      |
| Multi-instance IDs | `.with({...})` warns duplicate                        | `.with({...}, { instanceId })`        |
| Cycle detection    | Silent partial sort                                   | Throws with cycle path                |
| Duplicate plugins  | Silent overwrite                                      | Throws with guidance                  |
| `when()` guard     | Receives empty result                                 | Receives accumulated result           |

### Using `PIPELINE_CURRENT_KEY` (Well-Known Shared Key)

Every stage reads from or writes to `pipeline:current`:

```ts
import { PIPELINE_CURRENT_KEY } from "@vivsh1999/upupload/browser";

// Read
const file = (ctx.shared.get(PIPELINE_CURRENT_KEY) as File | undefined) ?? input.file;

// Write
ctx.shared.set(PIPELINE_CURRENT_KEY, processedFile);
```

## Security Notes

- **`maxNumberOfFiles: 1`** — one episode at a time prevents accidental batch processing.
- **Validate on server** — even though the client normalizes loudness and trims silence, validate bitrate, sample rate, and duration on receipt.
- **Authenticate upload endpoints** — attach a session token or API key to the upload request.
- **Set upload size limits** — raw studio WAV/AIFF files can exceed 500 MB for long episodes.
- **Serve encoded audio over CDN** — set `Cache-Control: public, max-age=31536000, immutable` for distribution files.
- **Waveform images are public** — they contain no audio content, only visual peaks; no additional access control needed.
- **MediaRecorder mimeType support varies** — check `MediaRecorder.isTypeSupported()` for AAC/Opus before production use and provide fallback encoding if needed.
