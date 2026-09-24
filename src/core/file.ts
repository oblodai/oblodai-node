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

/** Pull the file name out of a `Content-Disposition` header. */
export function filenameFrom(disposition: string | null): string | undefined {
  if (!disposition) return undefined;
  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
  if (utf8?.[1]) {
    try {
      return decodeURIComponent(utf8[1]);
    } catch {
      return utf8[1];
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(disposition);
  return plain?.[1];
}
