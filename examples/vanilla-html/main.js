import {
  DEFAULT_BROWSER_PIPELINE_OPTIONS,
  runDefaultBrowserPipeline,
} from "@vivsh1999/upupload/browser";
import { rawToJpeg, jpegCompressor } from "@vivsh1999/upupload/plugins";

const logEl = document.getElementById("log");
const fileInput = document.getElementById("file");
const processBtn = document.getElementById("process");

function log(line) {
  logEl.textContent += `${line}\n`;
}

function clearLog() {
  logEl.textContent = "";
}

async function runPipelineForSelectedFile() {
  const file = fileInput.files?.[0];
  if (!file) {
    log("Pick a file first.");
    return null;
  }

  const source = {
    file,
    name: file.name,
    type: file.type || "application/octet-stream",
  };

  log("Running pipeline (raw-to-jpeg + jpeg-compressor)…");
  const result = await runDefaultBrowserPipeline(
    source,
    { ...DEFAULT_BROWSER_PIPELINE_OPTIONS, debug: true },
    {
      plugins: [
        rawToJpeg,
        jpegCompressor.with({
          variant: "optimized",
          quality: 90,
          maxLongEdge: 3840,
          maxSizeMB: 1,
        }),
        jpegCompressor.with({
          variant: "thumbnail",
          quality: 78,
          maxLongEdge: 640,
          maxSizeMB: 0.25,
        }),
      ],
    },
  );

  for (const m of result.info) {
    log(`[${m.level}] ${m.message}`);
  }

  if (result.removeFromQueue) {
    log("removeFromQueue: true");
  }

  log(`Artifacts: ${result.artifacts.length}`);
  for (const a of result.artifacts) {
    log(`  - ${a.variant}: ${a.filename} (${a.filetype}, ${(a.file.size / 1024).toFixed(1)} KB)`);
  }

  return result;
}

processBtn.addEventListener("click", async () => {
  clearLog();
  try {
    const result = await runPipelineForSelectedFile();
    if (!result) return;

    if (result.artifacts.length > 0) {
      log("\nArtifacts ready. Use them however you like — upload via fetch/TUS, display, etc.");
      log("The original file is always included by default (variant: 'original').");
      log(
        "Filter it out if you don't want it: result.artifacts.filter(a => a.variant !== 'original')",
      );
    }
  } catch (e) {
    log(String(e?.message ?? e));
  }
});
