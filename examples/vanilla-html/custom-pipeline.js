import {
  DEFAULT_BROWSER_PIPELINE_OPTIONS,
  runDefaultBrowserPipeline,
} from "@vivsh1999/upupload/browser";
import { createJpegCompressorPlugin } from "@vivsh1999/upupload/plugins/jpeg-compressor";
import { createRawToJpegPlugin } from "@vivsh1999/upupload/plugins/raw-to-jpeg";

// ---------------------------------------------------------------------------
// Custom plugin — typed options, shared context, ctx.log
// ---------------------------------------------------------------------------

/** @type {import("@vivsh1999/upupload/plugins").ProcessingPlugin<Record<string, never>>} */
const metadataPlugin = {
  id: "metadata-annotator",
  name: "Metadata Annotator Plugin",
  options: {},

  supports(file) {
    return (file.type ?? "").startsWith("image/");
  },

  createStages(input, _opts, classif, ctx) {
    return [
      {
        id: "read-metadata",
        when: () => ({ run: true }),
        run: async () => {
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

          return {
            artifacts: [
              {
                variant: "metadata",
                file: new Blob(
                  [
                    JSON.stringify(
                      { width: img.width, height: img.height, sizeKB, ext: classif.ext },
                      null,
                      2,
                    ),
                  ],
                  { type: "application/json" },
                ),
                filename: `${classif.stemName}.metadata.json`,
                filetype: "application/json",
                relativePath: input.relativePath,
              },
            ],
            info: [{ level: "info", message, code: "image_metadata" }],
            removeFromQueue: false,
          };
        },
      },
    ];
  },
};

// ---------------------------------------------------------------------------
// Pipeline config
// ---------------------------------------------------------------------------

document.getElementById("config").textContent = JSON.stringify(
  {
    pipelineConfig: {
      debug: true,
    },
    plugins: [
      "createRawToJpegPlugin()              — decodes RAW/HEIC/TIFF (no artifact)",
      "createJpegCompressorPlugin × 2       — JPEG/PNG/WebP → optimized JPEG + thumbnail",
      "metadata-plugin (custom)              — reads dimensions",
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
  // raw-to-jpeg decodes RAW/HEIC/TIFF and places the result in shared context.
  // Each jpeg-compressor reads the decoded file and produces one variant.
  const plugins = [
    createRawToJpegPlugin(),
    createJpegCompressorPlugin({
      variant: "optimized",
      quality: 80,
      maxLongEdge: 2560,
      maxSizeMB: 1,
    }),
    createJpegCompressorPlugin({
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
