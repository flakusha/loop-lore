// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Response-header policy engine (FExBE).
 *
 * Centralizes security / isolation / perf / observability header injection so
 * no dispatcher (views, api, static, docs) needs to know about them. Construct
 * once per server start from `config.headers`, then call `apply()` on every
 * outgoing Response at the top of the fetch handler.
 *
 * Design notes:
 *   - Route-aware: classifies each response as html | api | static and tailors
 *     the header set accordingly.
 *   - Additive: existing route headers (Content-Type, Cache-Control, SSE
 *     headers) always win; the policy only sets headers the route omitted.
 *   - Streaming-safe: re-wraps via `new Response(response.body, …)` — the body
 *     ReadableStream passes through without buffering, so SSE is unaffected.
 */

import type { HeadersConfig } from "../config/schema";

/** Classification of an outgoing response, driving which headers apply. */
export type RouteKind = "html" | "api" | "static";

/** Matches bun's content-hashed asset names, e.g. `alpine-tx4kdwfm.js`. */
const HASHED_ASSET_PATTERN = /-[a-z0-9]{8}\.(?:js|css|svg|png|jpe?g|webp|gif|woff2?)$/;

/** Options for {@link ResponseHeaderPolicy.apply}. */
export interface ApplyOptions {
  /** Incoming request (used for route classification + hashed-asset detection). */
  request: Request;
  /** Response to decorate with policy headers. */
  response: Response;
}

export class ResponseHeaderPolicy {
  /**
   * @param config - Resolved `headers` config block.
   */
  constructor(private readonly config: HeadersConfig) {}

  /**
   * Decorate a response with the configured header set.
   *
   * @param options - request + response to process
   * @returns A new Response carrying the merged headers (original untouched).
   */
  apply({ request, response }: ApplyOptions): Response {
    if (!this.config.enabled) return response;

    const kind = this.classify({ request, response });
    const additions = this.buildHeaders(kind);

    const headers = new Headers(response.headers);
    for (const [name, value] of Object.entries(additions)) {
      // Route-set headers win on conflict (never clobber Content-Type, Cache-Control, SSE).
      if (headers.has(name)) continue;
      headers.set(name, value);
    }

    if (kind === "static" && this.config.immutableHashedAssets) {
      this.augmentImmutable({ request, headers });
    }

    return new Response(response.body, { status: response.status, headers });
  }

  /**
   * Classify a response into a route kind.
   * HTML (incl. docs HTML) → html; `/api/*` → api; everything else → static.
   */
  private classify({ request, response }: ApplyOptions): RouteKind {
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.startsWith("text/html")) return "html";
    if (new URL(request.url).pathname.startsWith("/api/")) return "api";
    return "static";
  }

  /**
   * Build the header map for a given route kind. Route headers are not present
   * here — merge logic in {@link apply} handles precedence.
   */
  private buildHeaders(kind: RouteKind): Record<string, string> {
    const cfg = this.config;
    const headers: Record<string, string> = {};

    if (cfg.referrerPolicy) headers["Referrer-Policy"] = cfg.referrerPolicy;
    if (cfg.xContentTypeOptions) headers["X-Content-Type-Options"] = "nosniff";
    if (cfg.xFrameOptions) headers["X-Frame-Options"] = cfg.xFrameOptions;

    // CORP: documents get same-origin, static subresources keep configured value.
    if (cfg.crossOriginResourcePolicy) {
      headers["Cross-Origin-Resource-Policy"] =
        kind === "static" ? cfg.crossOriginResourcePolicy : "same-origin";
    }

    if ((kind === "html" || kind === "api") && cfg.permissionsPolicy) {
      headers["Permissions-Policy"] = cfg.permissionsPolicy;
    }

    if (kind === "html") {
      if (cfg.csp.enabled) {
        const headerName = cfg.csp.reportOnly
          ? "Content-Security-Policy-Report-Only"
          : "Content-Security-Policy";
        headers[headerName] = this.buildCsp();
      }
      if (cfg.crossOriginOpenerPolicy) headers["Cross-Origin-Opener-Policy"] = cfg.crossOriginOpenerPolicy;
      if (cfg.crossOriginEmbedderPolicy)
        headers["Cross-Origin-Embedder-Policy"] = cfg.crossOriginEmbedderPolicy;

      const link = this.buildLinkHeader();
      if (link) headers.Link = link;

      if (cfg.acceptClientHints.length > 0) {
        const hints = cfg.acceptClientHints.join(", ");
        headers["Accept-CH"] = hints;
        headers["Critical-CH"] = hints;
        if (cfg.saveData) headers["Save-Data"] = "on";
      }
    }

    if (kind === "html" || kind === "api") {
      const reporting = this.buildReportingEndpoints();
      if (reporting) headers["Reporting-Endpoints"] = reporting;
      if (cfg.nel) headers.NEL = cfg.nel;
    }

    return headers;
  }

  /** Serialize the CSP directive set into a single header value. */
  private buildCsp(): string {
    const c = this.config.csp;
    const directives: string[] = [];
    const push = (name: string, values: string[]): void => {
      if (values.length > 0) directives.push(`${name} ${values.join(" ")}`);
    };

    push("default-src", c.defaultSrc);
    push("script-src", c.scriptSrc);
    push("style-src", c.styleSrc);
    push("img-src", c.imgSrc);
    push("font-src", c.fontSrc);
    push("connect-src", c.connectSrc);
    push("object-src", c.objectSrc);
    push("base-uri", c.baseUri);
    push("frame-ancestors", c.frameAncestors);
    if (c.upgradeInsecureRequests) directives.push("upgrade-insecure-requests");

    return directives.join("; ");
  }

  /** Build `Link: <…>; rel=preload` hints with a best-effort `as` token. */
  private buildLinkHeader(): string {
    if (this.config.linkPreload.length === 0) return "";
    return this.config.linkPreload
      .map((path) => {
        const as = path.endsWith(".css") ? "style" : path.endsWith(".js") ? "script" : "";
        const suffix = as ? `; as=${as}` : "";
        return `<${path}>; rel=preload${suffix}`;
      })
      .join(", ");
  }

  /** Build `Reporting-Endpoints: name="url", …` from the config map. */
  private buildReportingEndpoints(): string {
    const entries = Object.entries(this.config.reportingEndpoints);
    if (entries.length === 0) return "";
    return entries.map(([name, url]) => `${name}="${url}"`).join(", ");
  }

  /**
   * Append `immutable` to an existing `Cache-Control: …max-age…` value when the
   * requested path is a content-hashed asset (safe long-term caching).
   */
  private augmentImmutable({ request, headers }: { request: Request; headers: Headers }): void {
    const cacheControl = headers.get("Cache-Control");
    if (!cacheControl?.includes("max-age")) return;
    if (HASHED_ASSET_PATTERN.test(new URL(request.url).pathname)) {
      headers.set("Cache-Control", `${cacheControl}, immutable`);
    }
  }
}
