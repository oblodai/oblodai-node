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

/** Collect all pages into one array (bounded by `maxItems` when given). */
export async function collectPages<T>(
  fetchPage: PageFetcher<T>,
  opts: IterateOptions = {},
): Promise<T[]> {
  const out: T[] = [];
  for await (const item of iteratePages(fetchPage, opts)) out.push(item);
  return out;
}

/**
 * What a list method returns: `await` it for the first page, or `for await` it to walk every
 * item across pages (each page fetched lazily). One object, both shapes — no second method.
 */
export class PagePromise<T> implements PromiseLike<Page<T>>, AsyncIterable<T> {
  private readonly first: Promise<Page<T>>;

  constructor(
    private readonly fetchPage: PageFetcher<T>,
    private readonly params: PageParams,
  ) {
    this.first = fetchPage({
      limit: params.limit ?? DEFAULT_PAGE_LIMIT,
      offset: params.offset ?? 0,
    });
  }

  then<R1 = Page<T>, R2 = never>(
    onfulfilled?: ((value: Page<T>) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): Promise<R1 | R2> {
    return this.first.then(onfulfilled, onrejected);
  }

  /** Iterate every item, reusing the already-requested first page. */
  [Symbol.asyncIterator](): AsyncIterator<T> {
    const limit = this.params.limit ?? DEFAULT_PAGE_LIMIT;
    let pagePromise: Promise<Page<T>> | undefined = this.first;
    let offset = this.params.offset ?? 0;
    const fetchPage = this.fetchPage;
    return iteratePages<T>(
      (p) => {
        const pending = pagePromise;
        pagePromise = undefined;
        return pending ?? fetchPage(p);
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
