import { ContractError } from "./errors.js";
import { isRecord } from "./util.js";

/**
 * Offset pagination over the core's `{items, paginate}` lists. `paginate.has_pages` is the server's
 * own "there is more" flag; iteration stops on it, or on an empty page, whichever comes first.
 *
 * A list method returns a lazy {@link Page}: nothing is requested until it is consumed, and the
 * first page is requested once however many ways it is consumed.
 */
export interface Paginate {
  total: number;
  per_page: number;
  offset: number;
  has_pages: boolean;
}

export const DEFAULT_PAGE_LIMIT = 50;

/** One page of a list: its items plus the server's pagination block. */
export class PageResult<T> {
  constructor(
    readonly items: T[],
    readonly paginate: Paginate,
  ) {}

  get total(): number {
    return this.paginate.total ?? 0;
  }

  get perPage(): number {
    return this.paginate.per_page ?? this.items.length;
  }

  get offset(): number {
    return this.paginate.offset ?? 0;
  }

  get hasPages(): boolean {
    return this.paginate.has_pages === true;
  }

  /** Iterates THIS page's items only; iterate the {@link Page} to walk every page. */
  [Symbol.iterator](): Iterator<T> {
    return this.items[Symbol.iterator]();
  }
}

/** `(limit, offset) → one page`. */
export type PageFetcher<T> = (limit: number, offset: number) => Promise<PageResult<T>>;

/** A `{items, paginate}` result as a {@link PageResult}; anything else is a ContractError. */
export function toPageResult<T>(result: unknown, parse?: (item: unknown) => T): PageResult<T> {
  if (isRecord(result) && Array.isArray(result.items) && isRecord(result.paginate)) {
    const items = parse ? result.items.map(parse) : (result.items as T[]);
    return new PageResult(items, result.paginate as unknown as Paginate);
  }
  throw new ContractError("expected an {items, paginate} list result", 200, result);
}

/**
 * A lazy list handle:
 *
 * - `for await (const item of page)` walks every item across every page;
 * - `for await (const p of page.byPage())` walks every page, one request each;
 * - `await page` (or `page.first()`) is just the first page, as a {@link PageResult};
 * - `await page.all(max)` collects the items into an array.
 */
export class Page<T> implements AsyncIterable<T>, PromiseLike<PageResult<T>> {
  readonly [Symbol.toStringTag] = "Page";
  private readonly limit: number;
  private readonly offset: number;
  private firstPage: Promise<PageResult<T>> | undefined;

  constructor(
    private readonly fetchPage: PageFetcher<T>,
    limit?: number,
    offset?: number,
    /** The first page when it is already at hand (a raw response's). */
    first?: PageResult<T>,
  ) {
    this.limit = limit ?? DEFAULT_PAGE_LIMIT;
    this.offset = offset ?? 0;
    if (first) this.firstPage = Promise.resolve(first);
  }

  /** The first page, requested once and cached. */
  first(): Promise<PageResult<T>> {
    this.firstPage ??= this.fetchPage(this.limit, this.offset);
    return this.firstPage;
  }

  then<R1 = PageResult<T>, R2 = never>(
    onfulfilled?: ((value: PageResult<T>) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): Promise<R1 | R2> {
    return this.first().then(onfulfilled, onrejected);
  }

  catch<R = never>(
    onrejected?: ((reason: unknown) => R | PromiseLike<R>) | null,
  ): Promise<PageResult<T> | R> {
    return this.first().catch(onrejected);
  }

  finally(onfinally?: (() => void) | null): Promise<PageResult<T>> {
    return this.first().finally(onfinally);
  }

  /** Every page in turn, one request each (the first page is reused when already fetched). */
  async *byPage(): AsyncGenerator<PageResult<T>, void, void> {
    let offset = this.offset;
    let page = await this.first();
    for (;;) {
      yield page;
      const got = page.items.length;
      offset += got;
      if (got === 0 || !page.hasPages) return;
      page = await this.fetchPage(this.limit, offset);
    }
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<T, void, void> {
    for await (const page of this.byPage()) yield* page.items;
  }

  /** Collect every item into an array (bounded by `maxItems` when given). */
  async all(maxItems?: number): Promise<T[]> {
    const out: T[] = [];
    if (maxItems !== undefined && maxItems <= 0) return out;
    for await (const page of this.byPage()) {
      for (const item of page.items) {
        out.push(item);
        // Stop before the iterator resumes, so a cap never costs an extra page request.
        if (maxItems !== undefined && out.length >= maxItems) return out;
      }
    }
    return out;
  }
}
