import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { access, mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { Server as TusServer } from "@tus/server";
import { FileStore } from "@tus/file-store";
import { createStartHandler, defaultStreamHandler } from "@tanstack/react-start/server";
import type { Register } from "@tanstack/react-router";
import type { RequestHandler } from "@tanstack/react-start/server";

import { isSupportedFileUpload } from "./lib/media-allowlist";
import { TUS_VARIANT_TO_SUBDIR, variantFromTusMetadata } from "./lib/tus-variant-path";
import { TUS_API_PATH, extractTusUploadIdFromRequest } from "./lib/tus-path";

const uploadDir = path.resolve(process.cwd(), "uploads");
const tusTempDir = path.join(uploadDir, ".tus");
mkdirSync(uploadDir, { recursive: true });
mkdirSync(tusTempDir, { recursive: true });
for (const sub of Object.values(TUS_VARIANT_TO_SUBDIR)) {
  mkdirSync(path.join(uploadDir, sub), { recursive: true });
}

function isAllowedFileUpload(metadata?: Record<string, string | null>) {
  const name = metadata?.filename ?? metadata?.name ?? "";
  const type = metadata?.type ?? metadata?.filetype ?? null;
  return isSupportedFileUpload({ name, type });
}

/** Safe file extension for on-disk names (from client `filename` / MIME). */
function uploadFileExtension(metadata?: Record<string, string | null>): string {
  const filename = metadata?.filename ?? metadata?.name ?? "";
  const base = path.basename(filename);
  let ext = path.extname(base).toLowerCase();
  if (ext && /^\.[a-z0-9._-]+$/.test(ext) && ext.length <= 16) {
    return ext;
  }
  const ft = (metadata?.filetype ?? metadata?.type ?? "").toLowerCase();
  const mimeMap: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/svg+xml": ".svg",
    "image/bmp": ".bmp",
    "image/tiff": ".tif",
    "video/mp4": ".mp4",
    "video/webm": ".webm",
    "video/quicktime": ".mov",
    "audio/mpeg": ".mp3",
    "audio/wav": ".wav",
    "audio/wave": ".wav",
    "audio/x-wav": ".wav",
    "audio/flac": ".flac",
    "audio/ogg": ".ogg",
  };
  ext = mimeMap[ft] ?? "";
  if (ext) return ext;
  return ".bin";
}

function sanitizePathSegment(input: string) {
  let out = "";
  for (const ch of input) {
    const code = ch.charCodeAt(0);
    if (code < 32) {
      out += "_";
      continue;
    }
    if ('\\/:*?"<>|'.includes(ch)) {
      out += "_";
      continue;
    }
    out += ch;
  }
  const normalized = out.trim().replace(/\s+/g, " ");
  return normalized.length > 0 ? normalized : "file";
}

function sanitizeRelativeDirFromMetadata(metadata?: Record<string, string | null>) {
  const relativePath = metadata?.relativePath;
  if (!relativePath) return "";

  const dirname = path.posix.dirname(relativePath.replace(/\\/g, "/"));
  if (!dirname || dirname === ".") return "";

  const safeSegments = dirname
    .split("/")
    .filter((segment) => segment && segment !== "." && segment !== "..")
    .map((segment) => sanitizePathSegment(segment))
    .slice(0, 12);

  return safeSegments.join(path.sep);
}

function safeOutputFilename(metadata?: Record<string, string | null>) {
  const raw = metadata?.filename ?? metadata?.name ?? "";
  const base = path.basename(raw);
  const ext = uploadFileExtension(metadata);
  const stem = sanitizePathSegment(path.basename(base, path.extname(base)));
  return `${stem}${ext}`;
}

function splitNameAndExt(filename: string) {
  const ext = path.extname(filename);
  const base = ext ? filename.slice(0, -ext.length) : filename;
  return { base: base || "file", ext };
}

async function uniqueDestinationPath(targetDir: string, filename: string) {
  const { base, ext } = splitNameAndExt(filename);
  await mkdir(targetDir, { recursive: true });

  let attempt = 0;
  while (attempt < 10_000) {
    const suffix = attempt === 0 ? "" : `-${attempt}`;
    const candidate = path.join(targetDir, `${base}${suffix}${ext}`);
    try {
      await access(candidate);
      attempt += 1;
      continue;
    } catch {
      return candidate;
    }
  }
  throw new Error("Could not allocate unique destination path");
}

async function moveCompletedUploadToFinalPath(upload: {
  id: string;
  storage?: { type?: string; path?: string };
  metadata?: Record<string, string | null>;
}) {
  const variant = variantFromTusMetadata(upload.metadata);
  if (!variant) {
    throw {
      status_code: 400,
      body: "Invalid or missing variant in upload metadata.\n",
    };
  }

  const sourcePath = upload.storage?.path;
  if (!sourcePath) {
    throw {
      status_code: 500,
      body: "Upload storage path missing for completed file.\n",
    };
  }

  const relDir = sanitizeRelativeDirFromMetadata(upload.metadata);
  const targetRoot = path.join(uploadDir, TUS_VARIANT_TO_SUBDIR[variant], relDir);
  await mkdir(targetRoot, { recursive: true });

  const preferred = safeOutputFilename(upload.metadata);
  const targetPath = await uniqueDestinationPath(targetRoot, preferred);

  await rename(sourcePath, targetPath);

  const metaPath = path.join(tusTempDir, `${upload.id}.json`);
  await rm(metaPath, { force: true });
}

const tusServer = new TusServer({
  path: TUS_API_PATH,
  datastore: new FileStore({ directory: tusTempDir }),
  /** Avoid absolute Location with a fixed host (e.g. localhost vs 127.0.0.1 mismatch). */
  relativeLocation: true,
  respectForwardedHeaders: true,
  /** Required when upload ids contain `/` (e.g. `originals/<hex>`). Default parser keeps only the last segment. */
  getFileIdFromRequest: (req) => extractTusUploadIdFromRequest(req),
  /**
   * Store each finished blob under `uploads/originals|optimized|thumbnails/`
   * based on client pipeline metadata `variant` (see `src/lib/tus-variant-path.ts`).
   */
  namingFunction: () => randomBytes(18).toString("hex"),
  onUploadCreate: async (_req, upload) => {
    if (!variantFromTusMetadata(upload.metadata)) {
      throw {
        status_code: 400,
        body: "Invalid or missing variant in upload metadata.\n",
      };
    }
    if (!isAllowedFileUpload(upload.metadata)) {
      throw {
        status_code: 415,
        body: "Only media uploads are allowed (video/audio/image + supported RAW formats).\n",
      };
    }
    return {};
  },
  onUploadFinish: async (_req, upload) => {
    await moveCompletedUploadToFinalPath(upload);
    return {};
  },
});

const startHandler = createStartHandler(defaultStreamHandler);

const fetch: RequestHandler<Register> = async (request, opts) => {
  const url = new URL(request.url);
  if (url.pathname === TUS_API_PATH || url.pathname.startsWith(`${TUS_API_PATH}/`)) {
    return tusServer.handleWeb(request);
  }
  if (url.pathname === "/api/upload" && request.method === "POST") {
    try {
      const formData = await request.formData();
      const file = formData.get("file") as File;
      const variant = (formData.get("variant") as string) || "original";

      if (!file) {
        return new Response(JSON.stringify({ error: "Missing file" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      const targetDir = path.join(uploadDir, variant);
      await mkdir(targetDir, { recursive: true });
      const targetPath = await uniqueDestinationPath(targetDir, file.name);

      const buffer = Buffer.from(await file.arrayBuffer());
      await writeFile(targetPath, buffer);

      return new Response(JSON.stringify({ success: true, path: targetPath }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      return new Response(
        JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  }
  return startHandler(request, opts);
};

export default { fetch };
