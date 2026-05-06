import * as tus from "tus-js-client";

/** Upload metadata attached to a TUS artifact. */
export type TusArtifactUploadMeta = {
  variant: string;
  filename: string;
  filetype: string;
  relativePath?: string;
};

/** Upload a single artifact blob via the TUS resumable protocol. */
export function uploadArtifactWithTus(options: {
  endpoint: string;
  chunkSize: number;
  blob: Blob;
  meta: TusArtifactUploadMeta;
  signal?: AbortSignal;
  onProgress?: (percent: number) => void;
}): Promise<void> {
  const { endpoint, chunkSize, blob, meta, signal, onProgress } = options;

  const metadata: Record<string, string> = {
    variant: String(meta.variant),
    filename: String(meta.filename),
    filetype: String(meta.filetype),
  };
  if (meta.relativePath) metadata.relativePath = meta.relativePath;

  return new Promise((resolve, reject) => {
    const upload = new tus.Upload(blob, {
      endpoint,
      chunkSize,
      metadata,
      onError: (err) => {
        if (signal) signal.removeEventListener("abort", onAbort);
        reject(err);
      },
      onSuccess: () => {
        if (signal) signal.removeEventListener("abort", onAbort);
        resolve();
      },
      onProgress: (bytesUploaded, bytesTotal) => {
        if (!bytesTotal) return;
        onProgress?.(Math.min(100, (bytesUploaded / bytesTotal) * 100));
      },
    });

    const onAbort = () => {
      void upload.abort(true);
    };
    if (signal) {
      if (signal.aborted) {
        reject(new DOMException("Aborted", "AbortError"));
        return;
      }
      signal.addEventListener("abort", onAbort, { once: true });
    }

    upload.start();
  });
}
