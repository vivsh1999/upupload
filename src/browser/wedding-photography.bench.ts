import { beforeAll, bench, describe } from "vitest";
import { DEFAULT_BROWSER_PIPELINE_OPTIONS, runDefaultBrowserPipeline } from "./pipeline";
import type { PipelineSource } from "../core/types";
import { jpegCompressor } from "../plugin/jpeg-compressor";
import { rawToJpeg } from "../plugin/raw-to-jpeg";

declare global {
  var __FILE_PIPELINE_DOM_CANVAS: boolean | undefined;
}

const DOM_CANVAS = !!globalThis.__FILE_PIPELINE_DOM_CANVAS;

async function createTestImageFile(
  width: number,
  height: number,
  filename: string,
  type: string,
): Promise<File> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#f5e6d0");
  gradient.addColorStop(0.3, "#e8d5c0");
  gradient.addColorStop(0.6, "#d4b896");
  gradient.addColorStop(1, "#c4a882");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  for (let i = 0; i < 120; i++) {
    ctx.fillStyle = `hsl(${30 + i * 0.5}, 60%, ${55 + Math.random() * 30}%)`;
    ctx.beginPath();
    ctx.arc(Math.random() * width, Math.random() * height, Math.random() * 30 + 5, 0, Math.PI * 2);
    ctx.fill();
  }
  const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), type));
  return new File([blob], filename, { type, lastModified: Date.now() });
}

// ---------------------------------------------------------------------------
// Wedding RAW (DNG) → client-proof JPEG + gallery thumbnail
// ---------------------------------------------------------------------------

const DEFAULT_DNG_URL = "https://filesamples.com/samples/image/dng/sample1.dng";

function benchRawFixtureUrl(): string {
  const proc = (
    globalThis as unknown as {
      process?: { env?: Record<string, string | undefined> };
    }
  ).process;
  return proc?.env?.FILE_PIPELINE_BENCH_RAW_URL ?? DEFAULT_DNG_URL;
}

describe.skipIf(!DOM_CANVAS)("Wedding RAW (DNG) → client-proof + gallery-thumb", () => {
  let source: PipelineSource;
  let clientProofPlugin: typeof jpegCompressor;
  let galleryThumbPlugin: typeof jpegCompressor;
  beforeAll(async () => {
    const url = benchRawFixtureUrl();
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Bench fixture fetch failed (${res.status}): ${url}`);
    const buf = await res.arrayBuffer();
    const file = new File([buf], "DSC_0001.dng", { type: "application/octet-stream" });
    source = { file, name: "DSC_0001.dng", type: "application/octet-stream" };
    rawToJpeg.preload?.();
    clientProofPlugin = jpegCompressor.with({
      variant: "client-proof",
      quality: 80,
      maxLongEdge: 1920,
      maxSizeMB: 1,
    });
    clientProofPlugin.preload?.();
    galleryThumbPlugin = jpegCompressor.with({
      variant: "gallery-thumb",
      quality: 78,
      maxLongEdge: 640,
      maxSizeMB: 0.25,
    });
    galleryThumbPlugin.preload?.();
  }, 240_000);

  bench(
    "runDefaultBrowserPipeline",
    async () => {
      const out = await runDefaultBrowserPipeline(source, DEFAULT_BROWSER_PIPELINE_OPTIONS, {
        plugins: [rawToJpeg, clientProofPlugin, galleryThumbPlugin],
      });
      const clientProof = out.artifacts.find((a) => a.variant === "client-proof");
      const thumb = out.artifacts.find((a) => a.variant === "gallery-thumb");
      if (!clientProof || !thumb) {
        const codes = out.info.map((i) => i.code).filter(Boolean);
        throw new Error(
          `Expected client-proof + gallery-thumb (codes: ${codes.join(", ") || "none"})`,
        );
      }
      if (clientProof.file.size > 1.1 * 1024 * 1024) {
        throw new Error(`Expected client-proof <= ~1 MB; got ${clientProof.file.size} bytes`);
      }
    },
    { time: 120_000 },
  );
});

// ---------------------------------------------------------------------------
// Wedding JPEG → client-proof JPEG + gallery thumbnail
// ---------------------------------------------------------------------------

describe.skipIf(!DOM_CANVAS)("Wedding JPEG → client-proof + gallery-thumb", () => {
  let source: PipelineSource;
  let clientProofPlugin: typeof jpegCompressor;
  let galleryThumbPlugin: typeof jpegCompressor;
  beforeAll(async () => {
    const file = await createTestImageFile(6000, 4000, "wedding-001.jpeg", "image/jpeg");
    source = { file, name: "wedding-001.jpeg", type: "image/jpeg" };
    clientProofPlugin = jpegCompressor.with({
      variant: "client-proof",
      quality: 80,
      maxLongEdge: 1920,
      maxSizeMB: 1,
    });
    clientProofPlugin.preload?.();
    galleryThumbPlugin = jpegCompressor.with({
      variant: "gallery-thumb",
      quality: 78,
      maxLongEdge: 640,
      maxSizeMB: 0.25,
    });
    galleryThumbPlugin.preload?.();
  }, 30_000);

  bench(
    "runDefaultBrowserPipeline",
    async () => {
      const out = await runDefaultBrowserPipeline(source, DEFAULT_BROWSER_PIPELINE_OPTIONS, {
        plugins: [clientProofPlugin, galleryThumbPlugin],
      });
      const clientProof = out.artifacts.find((a) => a.variant === "client-proof");
      const thumb = out.artifacts.find((a) => a.variant === "gallery-thumb");
      if (!clientProof || !thumb) {
        const codes = out.info.map((i) => i.code).filter(Boolean);
        throw new Error(
          `Expected client-proof + gallery-thumb (codes: ${codes.join(", ") || "none"})`,
        );
      }
    },
    { time: 30_000 },
  );
});

// ---------------------------------------------------------------------------
// Wedding PNG → client-proof JPEG + gallery thumbnail
// ---------------------------------------------------------------------------

describe.skipIf(!DOM_CANVAS)("Wedding PNG → client-proof + gallery-thumb", () => {
  let source: PipelineSource;
  let clientProofPlugin: typeof jpegCompressor;
  let galleryThumbPlugin: typeof jpegCompressor;
  beforeAll(async () => {
    const file = await createTestImageFile(6000, 4000, "wedding-edit.png", "image/png");
    source = { file, name: "wedding-edit.png", type: "image/png" };
    clientProofPlugin = jpegCompressor.with({
      variant: "client-proof",
      quality: 80,
      maxLongEdge: 1920,
      maxSizeMB: 1,
    });
    clientProofPlugin.preload?.();
    galleryThumbPlugin = jpegCompressor.with({
      variant: "gallery-thumb",
      quality: 78,
      maxLongEdge: 640,
      maxSizeMB: 0.25,
    });
    galleryThumbPlugin.preload?.();
  }, 30_000);

  bench(
    "runDefaultBrowserPipeline",
    async () => {
      const out = await runDefaultBrowserPipeline(source, DEFAULT_BROWSER_PIPELINE_OPTIONS, {
        plugins: [clientProofPlugin, galleryThumbPlugin],
      });
      const clientProof = out.artifacts.find((a) => a.variant === "client-proof");
      const thumb = out.artifacts.find((a) => a.variant === "gallery-thumb");
      if (!clientProof || !thumb) {
        const codes = out.info.map((i) => i.code).filter(Boolean);
        throw new Error(
          `Expected client-proof + gallery-thumb (codes: ${codes.join(", ") || "none"})`,
        );
      }
    },
    { time: 30_000 },
  );
});
