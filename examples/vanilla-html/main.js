import {
  DEFAULT_BROWSER_PIPELINE_OPTIONS,
  runDefaultBrowserPipeline,
  uploadArtifactWithTus,
} from "@vivsh1999/upupload/browser";
import { createJpegCompressorPlugin } from "@vivsh1999/upupload/plugins/jpeg-compressor";
import { createRawToJpegPlugin } from "@vivsh1999/upupload/plugins/raw-to-jpeg";

const CHUNK = 5 * 1024 * 1024;

const logEl = document.getElementById("log");
const fileInput = document.getElementById("file");
const tusInput = document.getElementById("tus");
const processBtn = document.getElementById("process");
const uploadBtn = document.getElementById("upload");

function log(line) {
  logEl.textContent += `${line}\n`;
}

function clearLog() {
  logEl.textContent = "";
}

function tusEndpoint() {
  const raw = tusInput.value.trim();
  if (raw) return raw.endsWith("/") ? raw : `${raw}/`;
  return new URL("/api/tus/", window.location.origin).href;
}

async function runPipelineForSelectedFile() {
  const file = fileInput.files?.[0];
  if (!file) {
    log("Pick a file first.");
    return null;
  }

  const opts = {
    ...DEFAULT_BROWSER_PIPELINE_OPTIONS,
    saveOriginal: false,
    saveOptimized: true,
    saveThumbnails: true,
    debug: true,
  };

  const source = {
    file,
    name: file.name,
    type: file.type || "application/octet-stream",
  };

  log("Running pipeline (raw-to-jpeg + jpeg-compressor)…");
  const result = await runDefaultBrowserPipeline(source, opts, {
    plugins: [createRawToJpegPlugin(), createJpegCompressorPlugin()],
  });

  for (const m of result.info) {
    log(`[${m.level}] ${m.message}`);
  }

  if (result.removeFromQueue) {
    log("removeFromQueue: true");
  }

  log(`Artifacts: ${result.artifacts.length}`);
  for (const a of result.artifacts) {
    log(`  - ${a.variant}: ${a.filename} (${a.filetype})`);
  }

  return result;
}

processBtn.addEventListener("click", async () => {
  clearLog();
  try {
    await runPipelineForSelectedFile();
    log("Done (pipeline only).");
  } catch (e) {
    log(String(e?.message ?? e));
  }
});

uploadBtn.addEventListener("click", async () => {
  clearLog();
  try {
    const result = await runPipelineForSelectedFile();
    if (!result?.artifacts.length) {
      log("Nothing to upload.");
      return;
    }

    const endpoint = tusEndpoint();
    log(`Uploading via TUS: ${endpoint}`);

    for (const a of result.artifacts) {
      log(`→ ${a.variant}: ${a.filename} …`);
      await uploadArtifactWithTus({
        endpoint,
        chunkSize: CHUNK,
        blob: a.file,
        meta: {
          variant: a.variant,
          filename: a.filename,
          filetype: a.filetype,
          relativePath: a.relativePath,
        },
      });
      log(`  OK`);
    }
    log("All uploads finished.");
  } catch (e) {
    log(String(e?.message ?? e));
  }
});
