import { ROUTES, type RouteKey } from "../contract/routes.js";
import type { RequestBodies } from "../contract/requests.js";
import { asPage, asPlainList, type Page, type PlainList } from "../core/envelope.js";
import { ConfigError } from "../core/errors.js";
import { PagePromise, type PageParams } from "../core/pagination.js";
import type { Query } from "../core/request.js";
import type { CallOptions, RawResponse, Transport } from "../core/transport.js";

/** Per-call options every resource method accepts as its last argument. */
export interface RequestOptions {
  /** Your own idempotency key; generated automatically on create routes when omitted. Rejected on routes the core does not deduplicate. */
  idempotencyKey?: string;
  signal?: AbortSignal;
  /** Per-attempt timeout, ms. */
  timeoutMs?: number;
  /** Overall budget including retries, ms. */
  deadlineMs?: number;
}

/** Body type for a route: the generated DTO when the core documents one, otherwise free-form. */
export type BodyOf<K extends RouteKey> = K extends keyof RequestBodies
  ? RequestBodies[K]
  : Record<string, unknown> | undefined;

/** Either the object's id as a bare string or a lookup object. */
export type Ref<T> = string | T;

/** A binary response (PDF/CSV documents). */
export interface FileResult {
  bytes: Uint8Array;
  contentType: string;
  filename?: string;
}

export abstract class Resource {
  constructor(protected readonly transport: Transport) {}

  /** Call an envelope route; `T` is the `result` type. */
  protected call<T, K extends RouteKey = RouteKey>(
    key: K,
    body?: BodyOf<K>,
    opts: RequestOptions & { pathParams?: Record<string, string | number>; query?: Query } = {},
  ): Promise<T> {
    return this.transport.call<T>(ROUTES[key], this.callOptions(body, opts));
  }

  /** Call a paged list route (`{items, paginate}`); returns a PagePromise. */
  protected page<T, K extends RouteKey = RouteKey, P extends PageParams = PageParams>(
    key: K,
    params: P = {} as P,
    opts: RequestOptions & {
      pathParams?: Record<string, string | number>;
      viaQuery?: boolean;
    } = {},
  ): PagePromise<T> {
    const { limit, offset, ...rest } = params as PageParams & Record<string, unknown>;
    const route = ROUTES[key];
    // One key across a paging loop would make the core replay page 1 forever, and a key per page is
    // not what the caller asked for either — so this is refused loudly and immediately, with the
    // same code the transport raises on any other route the core does not deduplicate. Silently
    // dropping it would leave the caller believing a re-send is deduplicated when it is not.
    const { idempotencyKey, ...pageOpts } = opts;
    if (idempotencyKey !== undefined) {
      throw new ConfigError(
        "sdk.idempotency_unsupported",
        `${route.method} ${route.path} is a list route and does not deduplicate by Idempotency-Key; remove idempotencyKey from this call`,
        "idempotencyKey",
      );
    }
    return new PagePromise<T>(
      async (p) => {
        const useQuery = route.method === "GET" || opts.viaQuery;
        const result = await this.transport.call<unknown>(
          route,
          this.callOptions(useQuery ? undefined : { ...rest, ...p }, {
            ...pageOpts,
            query: useQuery ? { ...(rest as Query), ...p } : undefined,
          }),
        );
        return asPage<T>(result);
      },
      { limit, offset },
    );
  }

  /** Call a plain list route (`{items}` without paginate). */
  protected async plainList<T, K extends RouteKey = RouteKey>(
    key: K,
    body?: BodyOf<K>,
    opts: RequestOptions = {},
  ): Promise<PlainList<T> & Record<string, unknown>> {
    const result = await this.transport.call<unknown>(ROUTES[key], this.callOptions(body, opts));
    return asPlainList<T>(result) as PlainList<T> & Record<string, unknown>;
  }

  /** Call a bare (binary) route. */
  protected async file<K extends RouteKey = RouteKey>(
    key: K,
    opts: RequestOptions & {
      pathParams?: Record<string, string | number>;
      query?: Query;
      body?: unknown;
    } = {},
  ): Promise<FileResult> {
    const raw: RawResponse = await this.transport.callRaw(
      ROUTES[key],
      this.callOptions(opts.body, opts),
    );
    return {
      bytes: raw.body,
      contentType: raw.contentType ?? "application/octet-stream",
      filename: filenameFrom(raw.headers.get("content-disposition")),
    };
  }

  private callOptions(
    body: unknown,
    opts: RequestOptions & { pathParams?: Record<string, string | number>; query?: Query },
  ): CallOptions {
    return {
      body,
      pathParams: opts.pathParams,
      query: opts.query,
      idempotencyKey: opts.idempotencyKey,
      signal: opts.signal,
      timeoutMs: opts.timeoutMs,
      deadlineMs: opts.deadlineMs,
    };
  }
}

export type { Page, PlainList };

function filenameFrom(disposition: string | null): string | undefined {
  if (!disposition) return undefined;
  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
  if (utf8?.[1]) return decodeURIComponent(utf8[1]);
  const plain = /filename="?([^";]+)"?/i.exec(disposition);
  return plain?.[1];
}
