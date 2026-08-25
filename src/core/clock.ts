/**
 * Injectable clock for signing. The core rejects timestamps more than ±300 s from its own time;
 * a host with a drifting clock would get `merchant.bad_signature` on every call. The transport
 * learns the server's time from the `Date` header of every response and, when a 401 arrives
 * while the measured offset is large, re-signs once with the corrected timestamp.
 */
export interface Clock {
  /** Current unix time in seconds. */
  now(): number;
}

export const systemClock: Clock = {
  now: () => Math.floor(Date.now() / 1000),
};

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

  /** Feed a response `Date` header; returns the measured offset or undefined when unparsable. */
  observeServerDate(dateHeader: string | null | undefined): number | undefined {
    if (!dateHeader) return undefined;
    const serverMs = Date.parse(dateHeader);
    if (Number.isNaN(serverMs)) return undefined;
    return Math.round(serverMs / 1000) - this.base.now();
  }

  /** Apply an offset measured by observeServerDate. */
  correct(offsetSec: number): void {
    this.offsetSec = offsetSec;
  }
}
