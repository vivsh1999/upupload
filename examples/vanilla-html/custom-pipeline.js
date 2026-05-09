import {
  DEFAULT_BROWSER_PIPELINE_OPTIONS,
  runDefaultBrowserPipeline,
} from "@vivsh1999/upupload/browser";
import { Plugin, rawToJpeg, jpegCompressor } from "@vivsh1999/upupload/plugins";
import { artifact, infoMessage } from "@vivsh1999/upupload/core";

// ---------------------------------------------------------------------------
// Custom plugin — typed options, shared context, ctx.log
// Uses the Plugin class with the `run` shorthand (no createStages wrapping)
// ---------------------------------------------------------------------------

const metadataPlugin = new Plugin({
  id: "metadata-annotator",
  name: "Metadata Annotator Plugin",
  options: {},
  supports(file) {
    return (file.type ?? "").startsWith("image/");
  },
  // run shorthand — the library auto-wraps this into a single stage
  run: async (input, _opts, classif, ctx) => {
    const img = new Image();
    const url = URL.createObjectURL(input.file);
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = url;
    });
    URL.revokeObjectURL(url);

    const sizeKB = (input.file.size / 1024).toFixed(1);
    const message = `${input.name}: ${img.width}×${img.height}, ${sizeKB} KB, type=${classif.ext}`;
    ctx.log("info", message);

    // Read/write shared state between plugin stages
    ctx.shared.set("detected-dimensions", `${img.width}x${img.height}`);

    const blob = new Blob(
      [JSON.stringify({ width: img.width, height: img.height, sizeKB, ext: classif.ext }, null, 2)],
      { type: "application/json" },
    );

    return {
      artifacts: [
        artifact("metadata", blob, `${classif.stemName}.metadata.json`, "application/json", {
          relativePath: input.relativePath,
        }),
      ],
      info: [infoMessage(message, "image_metadata")],
      removeFromQueue: false,
    };
  },
});

// ---------------------------------------------------------------------------
// Pipeline config
// ---------------------------------------------------------------------------

document.getElementById("config").textContent = JSON.stringify(
  {
    pipelineConfig: {
      debug: true,
    },
    plugins: [
      "rawToJpeg                              — decodes RAW/HEIC/TIFF (no artifact)",
      "jpegCompressor.with() × 2              — JPEG/PNG/WebP → optimized JPEG + thumbnail",
      "metadata-plugin (custom Plugin class)   — reads dimensions",
    ],
    note: 'The original file is always included as variant "original".',
  },
  null,
  2,
);

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------

const fileInput = document.getElementById("file");
const logEl = document.getElementById("log");
const processBtn = document.getElementById("process");

function log(...lines) {
  logEl.textContent += lines.join("\n") + "\n";
}

processBtn.addEventListener("click", async () => {
  const file = fileInput.files?.[0];
  if (!file) {
    log("Pick a file first.");
    return;
  }

  logEl.textContent = "";
  log(`File: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`);
  log("");

  // Compose plugins (original is always included automatically)
  // rawToJpeg decodes RAW/HEIC/TIFF and places the result in shared context.
  // Each jpegCompressor reads the decoded file and produces one variant.
  const plugins = [
    rawToJpeg,
    jpegCompressor.with({
      variant: "optimized",
      quality: 80,
      maxLongEdge: 2560,
      maxSizeMB: 1,
    }),
    jpegCompressor.with({
      variant: "thumbnail",
      quality: 78,
      maxLongEdge: 320,
      maxSizeMB: 0.25,
    }),
    metadataPlugin,
  ];

  // Log which plugins matched this file
  log("Plugins matching this file:");
  for (const p of plugins) {
    log(`  ${p.supports(file) ? "✓" : "✗"} ${p.name}`);
  }
  log("");

  const source = {
    file,
    name: file.name,
    type: file.type || "application/octet-stream",
  };

  const result = await runDefaultBrowserPipeline(
    source,
    { ...DEFAULT_BROWSER_PIPELINE_OPTIONS, debug: true },
    { plugins },
  );

  for (const m of result.info) {
    log(`[${m.level}] ${m.code ?? ""}: ${m.message}`);
  }

  log("");
  log(`Artifacts (${result.artifacts.length}):`);
  for (const a of result.artifacts) {
    const size = (a.file.size / 1024).toFixed(1);
    log(`  • ${a.variant.padEnd(12)} ${a.filename}  (${size} KB, ${a.filetype})`);
    if (a.variant === "metadata") {
      const text = await a.file.text();
      log(`    └─ ${text}`);
    }
  }

  if (result.removeFromQueue) {
    log("\nremoveFromQueue: true");
  }
});
