import type { Page } from "./envelope.js";

/**
 * Offset pagination helpers over the core's `{items, paginate}` lists. `paginate.has_pages` is the
 * server's own "there is more" flag; iteration stops on it, or on a short page, whichever first.
 */
export interface PageParams {
  limit?: number;
  offset?: number;
}

export type PageFetcher<T> = (params: { limit: number; offset: number }) => Promise<Page<T>>;

export interface IterateOptions extends PageParams {
  /** Stop after this many items in total. */
  maxItems?: number;
}

export const DEFAULT_PAGE_LIMIT = 50;

/** Walk every page lazily; each `next()` fetches at most one page. */
export async function* iteratePages<T>(
  fetchPage: PageFetcher<T>,
  opts: IterateOptions = {},
): AsyncGenerator<T, void, void> {
  const limit = opts.limit ?? DEFAULT_PAGE_LIMIT;
  let offset = opts.offset ?? 0;
  let yielded = 0;
  for (;;) {
    const page = await fetchPage({ limit, offset });
    for (const item of page.items) {
      if (opts.maxItems !== undefined && yielded >= opts.maxItems) return;
      yield item;
      yielded += 1;
    }
    const got = page.items.length;
    offset += got;
    if (
      got === 0 ||
      !page.paginate.has_pages ||
      (opts.maxItems !== undefined && yielded >= opts.maxItems)
    )
      return;
  }
}

/**
 * What a list method returns: `await` it (or `.then/.catch/.finally`) for the first page, or
 * `for await` it to walk every item across pages. Nothing is requested until it is consumed, and
 * the first page is requested once however many ways it is consumed.
 */
export class PagePromise<T> implements Promise<Page<T>>, AsyncIterable<T> {
  private firstPage?: Promise<Page<T>>;
  readonly [Symbol.toStringTag] = "PagePromise";

  constructor(
    private readonly fetchPage: PageFetcher<T>,
    private readonly params: PageParams,
  ) {}

  private get first(): Promise<Page<T>> {
    if (!this.firstPage) {
      this.firstPage = this.fetchPage({
        limit: this.params.limit ?? DEFAULT_PAGE_LIMIT,
        offset: this.params.offset ?? 0,
      });
    }
    return this.firstPage;
  }

  then<R1 = Page<T>, R2 = never>(
    onfulfilled?: ((value: Page<T>) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): Promise<R1 | R2> {
    return this.first.then(onfulfilled, onrejected);
  }

  catch<R = never>(
    onrejected?: ((reason: unknown) => R | PromiseLike<R>) | null,
  ): Promise<Page<T> | R> {
    return this.first.catch(onrejected);
  }

  finally(onfinally?: (() => void) | null): Promise<Page<T>> {
    return this.first.finally(onfinally);
  }

  /** Iterate every item, reusing the first page when it was already requested. */
  [Symbol.asyncIterator](): AsyncIterator<T> {
    const limit = this.params.limit ?? DEFAULT_PAGE_LIMIT;
    const offset = this.params.offset ?? 0;
    let pending: Promise<Page<T>> | undefined = this.first;
    const fetchPage = this.fetchPage;
    return iteratePages<T>(
      (p) => {
        const reuse = pending;
        pending = undefined;
        return reuse ?? fetchPage(p);
      },
      { limit, offset },
    );
  }

  /** Collect every item into an array (bounded by `maxItems` when given). */
  async all(maxItems?: number): Promise<T[]> {
    const out: T[] = [];
    for await (const item of this) {
      if (maxItems !== undefined && out.length >= maxItems) break;
      out.push(item);
    }
    return out;
  }
}
