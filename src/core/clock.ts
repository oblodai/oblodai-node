/**
 * Injectable clock for signing. The core rejects timestamps more than ±300 s from its own time;
 * a host with a drifting clock would get `merchant.bad_signature` on every call. The transport
 * learns the server's time from the `Date` header of a signature-failure response, re-signs once,
 * and keeps the offset only if that re-signed attempt got past authentication.
 */
export interface Clock {
  /** Current unix time in seconds. */
  now(): number;
}

export const systemClock: Clock = {
  now: () => Math.floor(Date.now() / 1000),
};

/** Offsets beyond this are implausible clock drift and are ignored (a broken proxy `Date`). */
export const MAX_PLAUSIBLE_OFFSET_SECONDS = 24 * 3600;

export class SkewCorrectingClock implements Clock {
  private offsetSec = 0;

  constructor(private readonly base: Clock = systemClock) {}

  now(): number {
    return this.base.now() + this.offsetSec;
  }

  /** Server-minus-local offset currently applied, seconds. */
  get offset(): number {
    return this.offsetSec;
  }

  /** Measure the offset from a response `Date` header; undefined when absent, unparsable or implausible. */
  observeServerDate(dateHeader: string | null | undefined): number | undefined {
    if (!dateHeader) return undefined;
    const serverMs = Date.parse(dateHeader);
    if (Number.isNaN(serverMs)) return undefined;
    const offset = Math.round(serverMs / 1000) - this.base.now();
    return Math.abs(offset) > MAX_PLAUSIBLE_OFFSET_SECONDS ? undefined : offset;
  }

  correct(offsetSec: number): void {
    this.offsetSec = offsetSec;
  }

  reset(): void {
    this.offsetSec = 0;
  }
}
