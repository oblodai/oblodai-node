/**
 * Injectable clock for signing. The core rejects timestamps more than ±`SKEW_SECONDS` (the
 * contract's `x-oblodai-signing.skew_seconds`) from its own time; a host with a drifting clock
 * would get `merchant.bad_signature` on every call. The transport
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

  /**
   * Undo a correction only when nobody else has moved the clock since. The offset is shared by every
   * in-flight call on the client; an unconditional revert would throw away a sibling call's good
   * correction and send the whole client back into `merchant.bad_signature`. Returns true when the
   * revert happened. (JS runs one turn at a time, so the read-compare-write below is atomic.)
   */
  revertIfUnchanged(installed: number, previous: number): boolean {
    if (this.offsetSec !== installed) return false;
    this.offsetSec = previous;
    return true;
  }

  reset(): void {
    this.offsetSec = 0;
  }
}
