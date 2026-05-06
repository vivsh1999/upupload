/** URL pathname prefix for the tus handler (no trailing slash). */
export const TUS_API_PATH = "/api/tus";

/**
 * Upload ids may contain `/` (e.g. `originals/<hex>`). The default
 * `@tus/server` path parser only keeps the last segment, which breaks PATCH.
 * Use this as `getFileIdFromRequest` so the full id is preserved.
 */
export function extractTusUploadIdFromRequest(request: Pick<Request, "url">): string | undefined {
  let pathname: string;
  try {
    pathname = new URL(request.url).pathname;
  } catch {
    pathname = (request.url ?? "").split("?")[0] ?? "";
  }

  const base = TUS_API_PATH.endsWith("/") ? TUS_API_PATH.slice(0, -1) : TUS_API_PATH;

  if (pathname === base || pathname === `${base}/`) {
    return undefined;
  }

  if (!pathname.startsWith(`${base}/`)) {
    return undefined;
  }

  const rest = pathname.slice(base.length + 1);
  if (!rest) return undefined;

  return decodeURIComponent(rest);
}
