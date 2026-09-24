import { ROUTES } from "../generated/routes.js";
import { LRO, POLLS } from "../lro.js";
import { ConfigError } from "../core/errors.js";
import { fileResult, type FileResult } from "../core/file.js";
import { mergeOptions, type RequestOptions } from "../core/options.js";
import { DEFAULT_PAGE_LIMIT, Page, toPageResult, type PageResult } from "../core/pagination.js";
import { attachJob, jobIdOf } from "../core/poller.js";
import { RawAPIResponse } from "../core/raw.js";
import type { Query } from "../core/request.js";
import { routeLabel, type RouteSpec } from "../core/route.js";
import {
  unwrapResult,
  type CallOptions,
  type RawResponse,
  type Transport,
} from "../core/transport.js";
import { isRecord } from "../core/util.js";

export type { FileResult, RequestOptions };

/** Where a generated method puts its path and query parameters. */
export interface RequestExtra {
  pathParams?: Record<string, string>;
  query?: Record<string, unknown>;
}

/** What `withRawResponse` turns a method's result into: a list stays a {@link Page}. */
export type RawResult<R> = R extends Page<infer T> ? Page<T> : Awaited<R>;

/** The methods of a resource, answering with {@link RawAPIResponse} instead of the result. */
export type WithRawResponse<R> = {
  [
    K in keyof R as K extends "withRawResponse" | "withOptions"
      ? never
      : R[K] extends (...args: never[]) => unknown
        ? K
        : never
  ]: R[K] extends (...args: infer A) => infer Out
    ? (...args: A) => Promise<RawAPIResponse<RawResult<Out>>>
    : never;
};

/**
 * Base of every namespace on the client (`client.payments`, …). Generated methods call
 * {@link Resource._request}, which dispatches on the route's kind: an envelope route resolves to
 * its `result`, a paged list returns a lazy {@link Page}, a `bare` route resolves to a
 * {@link FileResult}, and a long-running operation (`src/lro.ts`) resolves to its answer with a
 * waiter attached.
 */
export abstract class Resource {
  /** Set on the copy `withRawResponse` hands out. */
  private _raw = false;
  /** Options every call of this copy starts from (`withOptions`). */
  private _defaults: RequestOptions | undefined;
  /** Routes by `operationId` for following a long-running call; the generated table by default. */
  protected _operations: Readonly<Record<string, RouteSpec>> = ROUTES;

  constructor(protected readonly transport: Transport) {}

  /**
   * The same methods, resolving to a {@link RawAPIResponse} (status, headers, `requestId`,
   * `parse()`) instead of the parsed result.
   */
  get withRawResponse(): WithRawResponse<this> {
    const clone = this._clone();
    clone._raw = true;
    return clone as unknown as WithRawResponse<this>;
  }

  /** A copy whose every call starts from these options (per-call options still win). */
  withOptions(options: RequestOptions): this {
    const clone = this._clone();
    clone._defaults = mergeOptions(this._defaults, options);
    return clone;
  }

  private _clone(): this {
    return Object.assign(Object.create(Object.getPrototypeOf(this) as object) as this, this);
  }

  /** Call a route the way its kind asks; the one entry point of generated methods. */
  protected _request<R>(
    route: RouteSpec,
    body: unknown,
    options?: RequestOptions,
    extra?: RequestExtra,
  ): R {
    const opts = mergeOptions(this._defaults, options);
    if (route.listKind === "paged") return this._paged(route, body, opts, extra) as R;
    const call = this.transport.call(route, callOptions(opts, body, extra));
    let decode: (raw: RawResponse) => unknown;
    if (route.bare) {
      decode = fileResult;
    } else {
      const follow = this._jobFollower(route, opts);
      decode = (raw) => {
        const result = unwrapResult(route, raw);
        return follow ? follow(result) : result;
      };
    }
    return (
      this._raw ? call.then((raw) => new RawAPIResponse(raw, decode)) : call.then(decode)
    ) as R;
  }

  private _paged(
    route: RouteSpec,
    body: unknown,
    opts: RequestOptions,
    extra: RequestExtra | undefined,
  ): Page<unknown> | Promise<RawAPIResponse<Page<unknown>>> {
    if (opts.idempotencyKey !== undefined && !route.idempotent) {
      // One key reused across pages would replay page 1 forever.
      throw new ConfigError(
        "sdk.idempotency_unsupported",
        `${routeLabel(route)} is a list and does not deduplicate by Idempotency-Key; remove idempotencyKey from this call`,
        "idempotencyKey",
      );
    }
    if (body !== undefined && !isRecord(body)) {
      throw new ConfigError("sdk.bad_body", "a list call's parameters must be an object", "params");
    }
    const rest: Record<string, unknown> = { ...body };
    const query: Record<string, unknown> | undefined = extra?.query
      ? { ...extra.query }
      : undefined;
    let limit = rest.limit;
    let offset = rest.offset;
    delete rest.limit;
    delete rest.offset;
    if (query) {
      limit = query.limit ?? limit;
      offset = query.offset ?? offset;
      delete query.limit;
      delete query.offset;
    }
    const first = {
      limit: typeof limit === "number" ? limit : undefined,
      offset: typeof offset === "number" ? offset : undefined,
    };
    const pageOpts: RequestOptions = { ...opts, idempotencyKey: undefined };
    const useQuery = route.method === "GET";
    const request = (l: number, o: number): CallOptions =>
      callOptions(pageOpts, useQuery ? undefined : { ...rest, limit: l, offset: o }, {
        ...(extra?.pathParams ? { pathParams: extra.pathParams } : {}),
        ...(useQuery ? { query: { ...query, limit: l, offset: o } } : query ? { query } : {}),
      });
    const transport = this.transport;
    const fetchPage = async (l: number, o: number): Promise<PageResult<unknown>> =>
      toPageResult(await transport.callResult(route, request(l, o)));
    const page = (firstPage?: PageResult<unknown>) =>
      new Page(fetchPage, first.limit, first.offset, firstPage);
    if (!this._raw) return page();
    const decodeFirst = (r: RawResponse): Page<unknown> =>
      page(toPageResult(unwrapResult(route, r)));
    const firstRequest = request(first.limit ?? DEFAULT_PAGE_LIMIT, first.offset ?? 0);
    const rawFirst = async (): Promise<RawAPIResponse<Page<unknown>>> =>
      new RawAPIResponse(await transport.call(route, firstRequest), decodeFirst);
    return rawFirst();
  }

  /** For a long-running operation: a function that attaches the waiter to its answer. */
  private _jobFollower(
    route: RouteSpec,
    opts: RequestOptions,
  ): ((result: unknown) => unknown) | undefined {
    const pollId = LRO[route.operationId];
    if (pollId === undefined) return undefined;
    const plan = POLLS[pollId];
    if (!plan) throw new ConfigError("sdk.lro_unresolved", `no poll plan for ${pollId}`);
    const pollRoute = this._operation(pollId);
    const downloadRoute = plan.download ? this._operation(plan.download) : undefined;
    // The create call's options for the follow-ups: same timeout, retries and headers; no
    // idempotency key (it belongs to the create) and a fresh request id per poll.
    const follow: RequestOptions = {
      timeout: opts.timeout,
      maxRetries: opts.maxRetries,
      extraHeaders: opts.extraHeaders,
      signal: opts.signal,
    };
    const transport = this.transport;
    return (result) => {
      if (!isRecord(result)) return result;
      const id = jobIdOf(plan.idField, result);
      const ref = { [plan.idField]: id };
      return attachJob(result, id, {
        poll: () => transport.callResult(pollRoute, callOptions(follow, ref)),
        download: downloadRoute
          ? async () =>
              fileResult(
                await transport.call(downloadRoute, callOptions(follow, undefined, { query: ref })),
              )
          : undefined,
        sleep: (ms, signal) => transport.sleep(ms, signal),
      });
    };
  }

  private _operation(operationId: string): RouteSpec {
    const route = this._operations[operationId];
    if (!route) {
      throw new ConfigError(
        "sdk.lro_unresolved",
        `no route for operation ${operationId}, needed to follow a long-running call`,
      );
    }
    return route;
  }
}

/** What the transport runs one call with: the request itself plus the caller's overrides. */
export function callOptions(
  options: RequestOptions,
  body: unknown,
  extra?: RequestExtra,
): CallOptions {
  return {
    ...options,
    body,
    ...(extra?.pathParams ? { pathParams: extra.pathParams } : {}),
    ...(extra?.query ? { query: extra.query as Query } : {}),
  };
}
