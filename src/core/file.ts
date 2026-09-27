import type { RawResponse } from "./transport.js";

/** A binary response (PDF/CSV documents). */
export interface FileResult {
  content: Uint8Array;
  contentType: string;
  filename?: string | undefined;
}

/** The bytes of a `bare` route's answer, with their type and file name. */
export function fileResult(raw: RawResponse): FileResult {
  const filename = filenameFrom(raw.headers.get("content-disposition"));
  return {
    content: raw.body,
    contentType: raw.contentType ?? "application/octet-stream",
    ...(filename !== undefined ? { filename } : {}),
  };
}

/**
 * Pull the file name out of a `Content-Disposition` header, reduced to a safe base name: the
 * header comes from the network, and a caller who writes the file under this name must not be
 * steered into another directory (`../../.bashrc`, `C:\\x`) or handed control characters.
 * Undefined when nothing usable is left (empty, `.` or `..`).
 */
export function filenameFrom(disposition: string | null): string | undefined {
  if (!disposition) return undefined;
  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
  if (utf8?.[1]) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(utf8[1]);
    } catch {
      decoded = utf8[1];
    }
    return safeBasename(decoded);
  }
  const plain = /filename="?([^";]+)"?/i.exec(disposition);
  return plain?.[1] === undefined ? undefined : safeBasename(plain[1]);
}

/** The last path component, without control characters or separators; never `.`/`..`/empty. */
export function safeBasename(name: string): string | undefined {
  const last = name.split(/[\\/]/).pop() ?? "";
  const clean = last.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (clean === "" || clean === "." || clean === "..") return undefined;
  return clean;
}
