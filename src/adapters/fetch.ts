/**
 * A pluggable, standard fetch upload adapter with support for multipart/form-data and raw binary bodies.
 * Uses XMLHttpRequest internally to provide accurate upload progress events.
 *
 * @module adapters/fetch
 */

import type { UploadAdapter } from "../react";

/**
 * Options for configuring the standard fetch upload adapter.
 */
export interface FetchUploadAdapterOptions {
  /**
   * The target URL for the upload. Can be a string or a function that dynamically
   * resolves the URL based on the current artifact.
   */
  url: string | ((artifact: { variant: string; filename: string; filetype: string }) => string);
  /**
   * HTTP method to use for the upload.
   * @default "POST"
   */
  method?: "POST" | "PUT" | "PATCH";
  /**
   * Custom headers to send with the request. Can be a static record, or a function
   * (sync or async) that returns the headers.
   */
  headers?:
    | Record<string, string>
    | (() => Record<string, string> | Promise<Record<string, string>>);
  /**
   * The name of the form field when sending as multipart/form-data.
   * @default "file"
   */
  fieldName?: string;
  /**
   * Whether to send the raw blob directly as the HTTP request body, or wrap it
   * in a FormData multipart request.
   * @default "form-data"
   */
  bodyFormat?: "form-data" | "binary";
  /**
   * Additional form fields to include when bodyFormat is "form-data".
   * Can be a static record, or a function that returns extra fields based on the artifact.
   */
  extraFields?:
    | Record<string, string>
    | ((artifact: {
        variant: string;
        filename: string;
        filetype: string;
      }) => Record<string, string>);
}

/**
 * Creates a standard HTTP upload adapter using XMLHttpRequest for upload progress tracking.
 *
 * @param options - Configuration options for the fetch upload adapter
 * @returns An UploadAdapter compatible with `useFileUpload`
 *
 * @example
 * ```ts
 * const adapter = fetchUploadAdapter({
 *   url: "/api/upload",
 *   method: "POST",
 *   bodyFormat: "form-data",
 *   extraFields: (art) => ({ variant: art.variant }),
 * });
 * ```
 */
export function fetchUploadAdapter<TPreload = undefined>(
  options: FetchUploadAdapterOptions,
): UploadAdapter<TPreload> {
  const {
    url,
    method = "POST",
    headers,
    fieldName = "file",
    bodyFormat = "form-data",
    extraFields,
  } = options;

  return (artifact, helpers) => {
    return new Promise<void>((resolve, reject) => {
      const run = async () => {
        try {
          const resolvedUrl = typeof url === "function" ? url(artifact) : url;
          const xhr = new XMLHttpRequest();
          xhr.open(method, resolvedUrl, true);

          // Set custom headers
          if (headers) {
            const resolvedHeaders = typeof headers === "function" ? await headers() : headers;
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
              reject(new Error(`Upload failed with status code ${xhr.status}: ${xhr.statusText}`));
            }
          });

          xhr.addEventListener("error", () => {
            reject(new Error("Network error during upload."));
          });

          xhr.addEventListener("timeout", () => {
            reject(new Error("Upload timed out."));
          });

          // Construct and send body
          if (bodyFormat === "binary") {
            // Send raw binary
            const resolvedHeaders = headers
              ? typeof headers === "function"
                ? await headers()
                : headers
              : {};
            const hasContentType = Object.keys(resolvedHeaders).some(
              (k) => k.toLowerCase() === "content-type",
            );
            if (!hasContentType) {
              xhr.setRequestHeader("Content-Type", artifact.filetype || "application/octet-stream");
            }
            xhr.send(artifact.blob);
          } else {
            // Send as multipart/form-data
            const fd = new FormData();
            fd.append(fieldName, artifact.blob, artifact.filename);

            if (extraFields) {
              const extra = typeof extraFields === "function" ? extraFields(artifact) : extraFields;
              for (const [key, val] of Object.entries(extra)) {
                fd.append(key, val);
              }
            }
            xhr.send(fd);
          }
        } catch (err) {
          reject(err);
        }
      };
      void run();
    });
  };
}
