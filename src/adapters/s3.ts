/**
 * A pluggable Amazon S3 / Cloudflare R2 upload adapter for uploading directly via PUT presigned URLs.
 * Uses XMLHttpRequest internally to track progress.
 *
 * @module adapters/s3
 */

import type { UploadAdapter } from "../react";

/**
 * Options for configuring the direct S3/R2 presigned URL upload adapter.
 */
export interface S3UploadAdapterOptions {
  /**
   * A function that returns the presigned S3 PUT URL for a given artifact.
   * This can perform a dynamic fetch call to your backend server to generate the URL on-the-fly.
   */
  getPresignedUrl: (artifact: {
    variant: string;
    filename: string;
    filetype: string;
  }) => string | Promise<string>;
  /**
   * Additional custom headers to include with the PUT request (e.g., custom S3 headers like `x-amz-acl`).
   */
  headers?:
    | Record<string, string>
    | ((artifact: {
        variant: string;
        filename: string;
        filetype: string;
      }) => Record<string, string> | Promise<Record<string, string>>);
}

/**
 * Creates an Amazon S3/R2 direct upload adapter using PUT presigned URLs.
 * Automatically adds the correct `Content-Type` header from the artifact details.
 *
 * @param options - Configuration options for the S3 upload adapter
 * @returns An UploadAdapter compatible with `useFileUpload`
 *
 * @example
 * ```ts
 * const s3Adapter = s3UploadAdapter({
 *   getPresignedUrl: async (artifact) => {
 *     const res = await fetch(`/api/presigned-url?name=${artifact.filename}&type=${artifact.filetype}`);
 *     const data = await res.json();
 *     return data.url;
 *   },
 *   headers: { "x-amz-acl": "public-read" }
 * });
 * ```
 */
export function s3UploadAdapter<TPreload = undefined>(
  options: S3UploadAdapterOptions,
): UploadAdapter<TPreload> {
  const { getPresignedUrl, headers } = options;

  return (artifact, helpers) => {
    return new Promise<void>((resolve, reject) => {
      const run = async () => {
        try {
          const presignedUrl = await getPresignedUrl(artifact);

          const xhr = new XMLHttpRequest();
          xhr.open("PUT", presignedUrl, true);

          // Standard S3 PUT expects the exact content type
          xhr.setRequestHeader("Content-Type", artifact.filetype || "application/octet-stream");

          // Custom S3 Headers
          if (headers) {
            const resolvedHeaders =
              typeof headers === "function" ? await headers(artifact) : headers;
            for (const [key, val] of Object.entries(resolvedHeaders)) {
              xhr.setRequestHeader(key, val);
            }
          }

          // Setup upload progress tracking
          if (xhr.upload) {
            xhr.upload.addEventListener("progress", (e) => {
              if (e.lengthComputable) {
                const progress = Math.round((e.loaded / e.total) * 100);
                helpers.onProgress(progress);
              }
            });
          }

          // Setup abort handling
          if (helpers.signal) {
            helpers.signal.addEventListener("abort", () => {
              xhr.abort();
              reject(new Error("Upload aborted by client."));
            });
            if (helpers.signal.aborted) {
              xhr.abort();
              reject(new Error("Upload aborted by client."));
              return;
            }
          }

          xhr.addEventListener("load", () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              helpers.onProgress(100);
              resolve();
            } else {
              reject(new Error(`S3 upload failed with status ${xhr.status}: ${xhr.statusText}`));
            }
          });

          xhr.addEventListener("error", () => {
            reject(new Error("Network error during S3 upload."));
          });

          xhr.addEventListener("timeout", () => {
            reject(new Error("S3 upload timed out."));
          });

          xhr.send(artifact.blob);
        } catch (err) {
          reject(err);
        }
      };
      void run();
    });
  };
}
