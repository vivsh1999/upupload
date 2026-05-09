import { bench, describe } from "vitest";
import { fileExtensionLower } from "./allowlist";
import {
  stem,
  toJpegName,
  toThumbName,
  info,
  resolvePluginRefs,
  resolvePipeline,
  validatePipeline,
} from "./pipeline-utils";
import type { PipelineDef } from "./pipeline-utils";
import type { PipelineSource } from "../core/types";
import { Plugin } from "../plugin/plugin";
import { emptyResult } from "../core/result";

// ---------------------------------------------------------------------------
// fileExtensionLower
// ---------------------------------------------------------------------------

describe("fileExtensionLower", () => {
  bench(".JPG → .jpg", () => {
    fileExtensionLower("photo.JPG");
  });
  bench(".Tar.Gz → .gz", () => {
    fileExtensionLower("archive.Tar.Gz");
  });
  bench("no extension → empty", () => {
    fileExtensionLower("README");
  });
});

// ---------------------------------------------------------------------------
// stem
// ---------------------------------------------------------------------------

describe("stem", () => {
  bench("photo.jpg → photo", () => {
    stem("photo.jpg");
  });
  bench("archive.tar.gz → archive.tar", () => {
    stem("archive.tar.gz");
  });
  bench("noext → noext", () => {
    stem("noext");
  });
});

// ---------------------------------------------------------------------------
// toJpegName
// ---------------------------------------------------------------------------

describe("toJpegName", () => {
  bench("photo.png → photo.jpg", () => {
    toJpegName("photo.png");
  });
  bench("img.heic → img.jpg", () => {
    toJpegName("img.heic");
  });
});

// ---------------------------------------------------------------------------
// toThumbName
// ---------------------------------------------------------------------------

describe("toThumbName", () => {
  bench("photo.png → photo.thumb.jpg", () => {
    toThumbName("photo.png");
  });
  bench("img.heic → img.thumb.jpg", () => {
    toThumbName("img.heic");
  });
});

// ---------------------------------------------------------------------------
// info helper
// ---------------------------------------------------------------------------

describe("info helper", () => {
  bench("level + message", () => {
    info("warn", "something happened");
  });
  bench("level + message + code", () => {
    info("warn", "something bad", "ERR_01");
  });
});

// ---------------------------------------------------------------------------
// resolvePluginRefs
// ---------------------------------------------------------------------------

const alphaPlugin = new Plugin({
  id: "alpha",
  options: { quality: 80 },
  supports: () => true,
  run: async () => emptyResult(),
});

const betaPlugin = new Plugin({
  id: "beta-compressor",
  options: { variant: "optimized", quality: 90 },
  supports: () => true,
  run: async () => emptyResult(),
});

const gammaPlugin = new Plugin({
  id: "gamma-decoder",
  options: {},
  supports: () => true,
  run: async () => emptyResult(),
});

const deltaPlugin = new Plugin({
  id: "delta-watermark",
  options: { text: "©" },
  supports: () => true,
  run: async () => emptyResult(),
});

const epsilonPlugin = new Plugin({
  id: "epsilon-meta",
  options: {},
  supports: () => true,
  run: async () => emptyResult(),
});

const REGISTRY = [alphaPlugin, betaPlugin, gammaPlugin, deltaPlugin, epsilonPlugin];

describe("resolvePluginRefs", () => {
  bench("5 bare Plugin instances (identity pass-through)", () => {
    resolvePluginRefs([alphaPlugin, betaPlugin, gammaPlugin, deltaPlugin, epsilonPlugin]);
  });

  bench("5 PluginRef with opts + .with() merging", () => {
    resolvePluginRefs([
      { id: "alpha", opts: { quality: 90 } },
      { id: "beta-compressor", opts: { variant: "thumb", quality: 78 } },
      { id: "gamma-decoder", opts: {} },
      { id: "delta-watermark", opts: { text: "© 2026" } },
      { id: "epsilon-meta", opts: {} },
    ], REGISTRY);
  });

  bench("5 PluginRef with defaults (no registry lookup)", () => {
    resolvePluginRefs([
      { id: "alpha", defaults: alphaPlugin },
      { id: "beta-compressor", defaults: betaPlugin },
      { id: "gamma-decoder", defaults: gammaPlugin },
      { id: "delta-watermark", defaults: deltaPlugin },
      { id: "epsilon-meta", defaults: epsilonPlugin },
    ]);
  });
});

// ---------------------------------------------------------------------------
// resolvePipeline
// ---------------------------------------------------------------------------

const PIPELINE_SOURCE: PipelineSource = {
  file: new Blob(),
  name: "photo.jpg",
  type: "image/jpeg",
};

const VIDEO_SOURCE: PipelineSource = {
  file: new Blob(),
  name: "clip.mp4",
  type: "video/mp4",
};

const TEXT_SOURCE: PipelineSource = {
  file: new Blob(),
  name: "readme.txt",
  type: "text/plain",
};

describe("resolvePipeline", () => {
  const pipelines = [
    {
      id: "media",
      pipelines: [
        {
          id: "photos",
          supports: (f: PipelineSource) => f.type?.startsWith("image/") ?? false,
          plugins: [{ id: "compressor", defaults: betaPlugin }],
        },
        {
          id: "videos",
          supports: (f: PipelineSource) => f.type?.startsWith("video/") ?? false,
          plugins: [{ id: "poster", defaults: gammaPlugin }],
        },
      ],
    },
    {
      id: "audio",
      supports: (f: PipelineSource) => f.type?.startsWith("audio/") ?? false,
      plugins: [{ id: "encoder", defaults: alphaPlugin }],
    },
  ];

  bench("first match (image → photos)", () => {
    resolvePipeline(pipelines, PIPELINE_SOURCE, REGISTRY);
  });

  bench("nested match (video → media → videos)", () => {
    resolvePipeline(pipelines, VIDEO_SOURCE, REGISTRY);
  });

  bench("no match (text → null)", () => {
    resolvePipeline(pipelines, TEXT_SOURCE, REGISTRY);
  });
});

// ---------------------------------------------------------------------------
// validatePipeline
// ---------------------------------------------------------------------------

describe("validatePipeline", () => {
  const valid: PipelineDef[] = [
    {
      id: "media",
      pipelines: [
        { id: "photos", plugins: [{ id: "compressor" } as any] },
        { id: "videos", plugins: [{ id: "poster" } as any] },
      ],
    },
    { id: "audio", plugins: [{ id: "tagger" } as any] },
  ];

  bench("validatePipeline (valid)", () => {
    validatePipeline(valid);
  });

  const nested: PipelineDef[] = [
    {
      id: "media",
      pipelines: [
        {
          id: "photos",
          pipelines: [
            { id: "raw", plugins: [{ id: "decoder" } as any] },
            { id: "raster", plugins: [{ id: "compressor" } as any] },
          ],
        },
        { id: "videos", plugins: [{ id: "poster" } as any] },
      ],
    },
    { id: "audio", plugins: [{ id: "encoder" } as any] },
  ];

  bench("validatePipeline (nested, depth 4)", () => {
    validatePipeline(nested);
  });
});
