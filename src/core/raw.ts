import { HEADER_REQUEST_ID } from "./request.js";
import type { RawResponse } from "./transport.js";

/**
 * The raw side of a successful call: `resource.withRawResponse.<method>(...)`. Status, headers and
 * request id of the 2xx answer; `parse()` gives what the method returns without
 * `withRawResponse`. An error status still throws, exactly as without it.
 */
export class RawAPIResponse<T> {
  private parsed: { value: T } | undefined;

  constructor(
    private readonly raw: RawResponse,
    private readonly decode: (raw: RawResponse) => T,
  ) {}

  get status(): number {
    return this.raw.status;
  }

  get headers(): Headers {
    return this.raw.headers;
  }

  /** The response's `X-Request-ID`, else the one this SDK sent with the call. */
  get requestId(): string {
    return this.raw.headers.get(HEADER_REQUEST_ID) || this.raw.requestId;
  }

  /** The body bytes as they arrived. */
  get content(): Uint8Array {
    return this.raw.body;
  }

  /** One header, looked up case-insensitively. */
  header(name: string): string | undefined {
    return this.raw.headers.get(name) ?? undefined;
  }

  /** The value the method returns without `withRawResponse` (computed once). */
  parse(): T {
    this.parsed ??= { value: this.decode(this.raw) };
    return this.parsed.value;
  }

  toJSON(): Record<string, unknown> {
    return { status: this.status, requestId: this.requestId };
  }
}
