/** @module plugins/raw-to-jpeg */
import { fileExtensionLower, RAW_EXTENSIONS } from "../browser/allowlist";
import { PIPELINE_CURRENT_KEY } from "../browser/pipeline-utils";
import { tryDecodeHeicToJpegFile, tryDecodeTiffToJpegFile } from "./_optionalDecoders";
import { decodeCameraRawToJpegFile, preloadRawDecoder } from "./_rawDecode";
import { Plugin } from "./plugin";
import { emptyResult } from "../core/result";

export const R2J_SHARED_KEY = "raw-to-jpeg:decoded";

export interface RawToJpegPluginOptions {
  debug?: boolean;
}

/**
 * RAW/HEIC/TIFF decoder — base instance.
 * Pure decoder (no artifact), places decoded JPEG in shared context.
 *
 * @example
 * ```ts
 * rawToJpeg                                         // default (no debug)
 * rawToJpeg.with({ debug: true })                   // with debug logging
 * ```
 */
export const rawToJpeg = new Plugin<RawToJpegPluginOptions>({
  id: "raw-to-jpeg",
  name: "RAW to JPEG Plugin",
  options: { debug: false },
  sharedKeys: { decoded: R2J_SHARED_KEY },
  supports: (file) => {
    const ext = fileExtensionLower(file.name);
    const mime = (file.type ?? "").toLowerCase();
    return (
      RAW_EXTENSIONS.has(ext) ||
      ext === ".heic" ||
      ext === ".heif" ||
      mime === "image/heic" ||
      mime === "image/heif" ||
      ext === ".tif" ||
      ext === ".tiff" ||
      mime === "image/tiff"
    );
  },
  run: async (input, pluginOpts, classif, ctx) => {
    let decoded: File | undefined;
    const stemName = classif.stemName;

    if (RAW_EXTENSIONS.has(classif.ext)) {
      decoded =
        (await decodeCameraRawToJpegFile(input.file as File, {
          outFilename: `${stemName}.raw.jpg`,
          outputQuality: 0.98,
          debug: Boolean(pluginOpts.debug),
        })) ?? undefined;
    } else if (
      classif.ext === ".heic" ||
      classif.ext === ".heif" ||
      classif.mime === "image/heic" ||
      classif.mime === "image/heif"
    ) {
      decoded = (await tryDecodeHeicToJpegFile(input.file as File)) ?? undefined;
    } else if (classif.ext === ".tif" || classif.ext === ".tiff" || classif.mime === "image/tiff") {
      decoded = (await tryDecodeTiffToJpegFile(input.file as File)) ?? undefined;
    }

    if (decoded) {
      ctx.shared.set(R2J_SHARED_KEY, decoded);
      ctx.shared.set(PIPELINE_CURRENT_KEY, decoded);
    } else {
      ctx.log("warn", `RAW/HEIC/TIFF decode failed for "${input.name}"`, {
        ext: classif.ext,
      });
    }

    return emptyResult();
  },
  preload: () => preloadRawDecoder(),
});

/** @deprecated Use `rawToJpeg.with(opts)` instead. Will be removed in next major version. */
export function createRawToJpegPlugin(
  opts?: RawToJpegPluginOptions,
): Plugin<RawToJpegPluginOptions> {
  return rawToJpeg.with(opts ?? {});
}
