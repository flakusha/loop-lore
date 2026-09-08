// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// size-allow: 350

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

import type { HeadersConfig, } from "../config/schema";
import { jsonStringifyOr, } from "../utils/safe-json";
import { getNonce, } from "./csp-nonce";

/** Canonical header names for case-insensitive comparison. */
const CANONICAL_HEADER_NAMES = new Map<string, string>([
  ["referrer-policy", "Referrer-Policy",],
  ["x-content-type-options", "X-Content-Type-Options",],
  ["x-frame-options", "X-Frame-Options",],
  ["cross-origin-resource-policy", "Cross-Origin-Resource-Policy",],
  ["cross-origin-opener-policy", "Cross-Origin-Opener-Policy",],
  ["cross-origin-embedder-policy", "Cross-Origin-Embedder-Policy",],
  ["permissions-policy", "Permissions-Policy",],
  ["content-security-policy", "Content-Security-Policy",],
  ["content-security-policy-report-only", "Content-Security-Policy-Report-Only",],
  ["accept-ch", "Accept-CH",],
  ["critical-ch", "Critical-CH",],
  ["save-data", "Save-Data",],
  ["reporting-endpoints", "Reporting-Endpoints",],
  ["link", "Link",],
  ["nel", "NEL",],
  ["vary", "Vary",],
  ["cache-control", "Cache-Control",],
  ["content-encoding", "Content-Encoding",],
  ["timing-allow-origin", "Timing-Allow-Origin",],
  ["strict-transport-security", "Strict-Transport-Security",],
  ["report-to", "Report-To",],
  ["origin-agent-cluster", "Origin-Agent-Cluster",],
  ["x-dns-prefetch-control", "X-DNS-Prefetch-Control",],
],);

/** Default `Cache-Control` value applied to `application/json` API responses
 *  when the route omitted one. Asset bytes under `/api/assets/*` carry
 *  non-JSON `Content-Type` and are excluded from this default. */
const API_JSON_DEFAULT_CACHE_CONTROL = "no-store";

/** Enables origin-keyed agent clusters (process-isolation hardening). Pairs
 *  with COOP/COEP; emitted on HTML unless a route opts out via the additive
 *  precedence rule. */
const ORIGIN_AGENT_CLUSTER_VALUE = "?1";

/** Default `X-DNS-Prefetch-Control` value for HTML: opt out of speculative
 *  DNS lookups for privacy. Routes can override. */
const DNS_PREFETCH_CONTROL_VALUE = "off";

/** Reporting-endpoints header pair — both formats are emitted when at least
 *  one endpoint is configured. */
interface ReportingEndpointsValue {
  /** `Reporting-Endpoints: name="url", …` (current spec). */
  reporting: string;
  /** `Report-To: {"group":…,"max_age":…,"endpoints":[…]}` legacy format
   *  used by Chromium < 96 and Safari. */
  reportTo: string;
}

/**
 * Normalize header key to canonical casing for case-insensitive comparison.
 * @param key
 */
export function normalizeHeaderKey(key: string,): string {
  const lower = key.toLowerCase();
  return CANONICAL_HEADER_NAMES.get(lower,) ?? key;
}

/** Classification of an outgoing response, driving which headers apply. */
export type RouteKind = "html" | "api" | "static" | "sse";

/** Matches bun's content-hashed asset names, e.g. `alpine-tx4kdwfm.js`. */
const HASHED_ASSET_PATTERN = /-[a-z0-9]{8}\.(?:js|css|svg|png|jpe?g|webp|gif|woff2?)$/;

/** Max-age at/above which `immutable` is semantically valid (1 year, matching static-files hashed assets). */
const IMMUTABLE_CACHE_MAX_AGE = 31_536_000;

/** Options for {@link ResponseHeaderPolicy.apply}. */
export interface ApplyOptions {
  /** Incoming request (used for hashed-asset detection). */
  request: Request;
  /** Response to decorate with policy headers. */
  response: Response;
}

/** */
export class ResponseHeaderPolicy {
  /**
   * @param config - Resolved `headers` config block.
   */
  constructor(private readonly config: HeadersConfig,) {}

  /**
   * Decorate a response with the configured header set.
   * @param options - request + response to process
   * @param options.request
   * @param options.response
   * @returns A new Response carrying the merged headers (original untouched).
   */
  apply({ request, response, }: ApplyOptions,): Response {
    if (!this.config.enabled) { return response; }

    const kind = this.classify({ request, response, },);

    // SSE and streaming responses pass through without wrapping (preserve body stream).
    if (kind === "sse") { return response; }

    const additions = this.buildHeaders(kind, request,);

    const headers = new Headers(response.headers,);
    for (const [name, value,] of Object.entries(additions,)) {
      const canonical = normalizeHeaderKey(name,);
      // Route-set headers win on conflict (never clobber Content-Type, Cache-Control, SSE).
      if (headers.has(canonical,)) { continue; }
      headers.set(canonical, value,);
    }

    if (kind === "static" && this.config.immutableHashedAssets) {
      this.augmentImmutable({ request, headers, },);
    }

    // Default `Cache-Control: no-store` for `application/json` API responses
    // when the route did not set one. Asset bytes served under `/api/assets/*`
    // carry non-JSON content-types and are exempt from this gate.
    if (kind === "api") {
      const contentType = headers.get("content-type",) ?? "";
      if (
        contentType.includes("application/json",) &&
        !headers.has("cache-control",)
      ) {
        headers.set("Cache-Control", API_JSON_DEFAULT_CACHE_CONTROL,);
      }
    }

    // Preserve `statusText` on re-wrap — `new Response(body, { status, headers })`
    // drops the reason phrase, breaking HTTP/1.1 clients that read it.
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    },);
  }

  /**
   * Classify a response into a route kind.
   * HTML → html; SSE (content-type) → sse; `/api/*` → api; static → static.
   * @param root0
   * @param root0.request
   * @param root0.response
   */
  private classify({ request, response, }: ApplyOptions,): RouteKind {
    const contentType = response.headers.get("content-type",) ?? "";
    if (contentType.startsWith("text/html",)) { return "html"; }
    if (contentType.includes("text/event-stream",)) { return "sse"; }
    if (request && new URL(request.url,).pathname.startsWith("/api/",)) { return "api"; }
    return "static";
  }

  /**
   * Build the header map for a given route kind. Route headers are not present
   * here — merge logic in {@link apply} handles precedence.
   * @param kind
   * @param request
   */
  private buildHeaders(kind: RouteKind, request: Request,): Record<string, string> {
    const cfg = this.config;
    const headers: Record<string, string> = {};

    if (cfg.referrerPolicy) { headers["Referrer-Policy"] = cfg.referrerPolicy; }
    if (cfg.xContentTypeOptions) { headers["X-Content-Type-Options"] = "nosniff"; }
    if (cfg.xFrameOptions) { headers["X-Frame-Options"] = cfg.xFrameOptions; }

    // CORP: documents get same-origin, static subresources keep configured value.
    if (cfg.crossOriginResourcePolicy) {
      headers["Cross-Origin-Resource-Policy"] = kind === "static" ? cfg.crossOriginResourcePolicy : "same-origin";
    }

    if (cfg.timingAllowOrigin) { headers["Timing-Allow-Origin"] = cfg.timingAllowOrigin; }

    if (kind === "html") {
      this.applyHtmlHeaders(headers, request,);
    }
    if (kind === "api" && cfg.permissionsPolicy) {
      headers["Permissions-Policy"] = cfg.permissionsPolicy;
    }

    // Headers shared by html and api
    if (kind === "html" || kind === "api") {
      const reporting = this.buildReportingEndpoints();
      if (reporting) {
        headers["Reporting-Endpoints"] = reporting.reporting;
        if (reporting.reportTo) { headers["Report-To"] = reporting.reportTo; }
      }
      if (cfg.nel) { headers.NEL = cfg.nel; }
    }

    // Strict-Transport-Security: only on HTTPS. Detects via URL protocol
    // (covers TLS-terminating proxies that preserve the original scheme
    // in the request URL).
    if (cfg.hsts.enabled && new URL(request.url,).protocol === "https:") {
      const parts = [`max-age=${cfg.hsts.maxAge}`,];
      if (cfg.hsts.includeSubDomains) { parts.push("includeSubDomains",); }
      if (cfg.hsts.preload) { parts.push("preload",); }
      headers["Strict-Transport-Security"] = parts.join("; ",);
    }
    return headers;
  }

  /** Apply document-specific security/policy headers (CSP, COOP, COEP, hints,
   *  origin-agent-cluster, dns-prefetch-control). */
  /**
   * @param headers
   * @param request
   */
  private applyHtmlHeaders(headers: Record<string, string>, request: Request,): void {
    const cfg = this.config;
    if (cfg.csp.enabled) {
      const headerName = cfg.csp.reportOnly
        ? "Content-Security-Policy-Report-Only"
        : "Content-Security-Policy";
      headers[headerName] = this.buildCsp(request,);
    }
    if (cfg.crossOriginOpenerPolicy) { headers["Cross-Origin-Opener-Policy"] = cfg.crossOriginOpenerPolicy; }
    if (cfg.crossOriginEmbedderPolicy) {
      headers["Cross-Origin-Embedder-Policy"] = cfg.crossOriginEmbedderPolicy;
    }
    if (cfg.permissionsPolicy) { headers["Permissions-Policy"] = cfg.permissionsPolicy; }
    if (cfg.timingAllowOrigin) {
      headers["Timing-Allow-Origin"] = cfg.timingAllowOrigin;
    }
    const link = this.buildLinkHeader();
    if (link) { headers.Link = link; }
    if (cfg.acceptClientHints.length > 0) {
      const hints = cfg.acceptClientHints.join(", ",);
      headers["Accept-CH"] = hints;
      headers["Critical-CH"] = hints;
      if (cfg.saveData) { headers["Save-Data"] = "on"; }
    }
    // Process-isolation hardening. Routes win via the additive merge in `apply()`.
    headers["Origin-Agent-Cluster"] = ORIGIN_AGENT_CLUSTER_VALUE;
    // Privacy default: opt HTML out of speculative DNS lookups.
    headers["X-DNS-Prefetch-Control"] = DNS_PREFETCH_CONTROL_VALUE;
  }

  /**
   * @param request
   */
  private buildCsp(request: Request,): string {
    const c = this.config.csp;
    const nonce = getNonce(request,);
    const directives: string[] = [];
    const push = (name: string, values: string[],): void => {
      if (values.length > 0) { directives.push(`${name} ${values.join(" ",)}`,); }
    };

    push("default-src", c.defaultSrc,);

    // Inject per-request nonce into script-src when available — allows
    // inline <script nonce="..."> without 'unsafe-inline' for those tags.
    const scriptSrc = nonce
      ? [...c.scriptSrc, `'nonce-${nonce}'`,]
      : c.scriptSrc;
    push("script-src", scriptSrc,);

    push("style-src", c.styleSrc,);
    push("img-src", c.imgSrc,);
    push("font-src", c.fontSrc,);
    push("connect-src", c.connectSrc,);
    push("object-src", c.objectSrc,);
    push("base-uri", c.baseUri,);
    push("frame-ancestors", c.frameAncestors,);
    push("form-action", c.formAction,);
    if (c.upgradeInsecureRequests) { directives.push("upgrade-insecure-requests",); }

    return directives.join("; ",);
  }

  /** Build `Link: <…>; rel=preload` hints with a best-effort `as` token. */
  private buildLinkHeader(): string {
    if (this.config.linkPreload.length === 0) { return ""; }
    return Array.from(this.config.linkPreload, (path,) => {
      const as = path.endsWith(".css",) ? "style" : (path.endsWith(".js",) ? "script" : "");
      const suffix = as ? `; as=${as}` : "";
      return `<${path}>; rel=preload${suffix}`;
    },).join(", ",);
  }

  /** Build the dual-format reporting pair. Returns `null` when no endpoints
   *  are configured. `reportTo` follows the legacy `Report-To` JSON shape
   *  using the first configured endpoint as the single group, with a 1-day
   *  `max_age`. Older Chromium/Safari only read `Report-To`. */
  private buildReportingEndpoints(): ReportingEndpointsValue | null {
    const entries = Object.entries(this.config.reportingEndpoints,);
    if (entries.length === 0) { return null; }
    const reporting = Array.from(entries, ([name, url,],) => `${name}="${url}"`,).join(", ",);
    const [firstName, firstUrl,] = entries[0] ?? ["", "",];
    if (!firstName) { return { reporting, reportTo: "", }; }
    const reportTo = jsonStringifyOr({
      group: firstName,
      max_age: 86400,
      endpoints: [{ url: firstUrl, },],
    }, "",);
    return { reporting, reportTo, };
  }

  /**
   * Append `immutable` to an existing `Cache-Control: …max-age…` value when the
   * requested path is a content-hashed asset AND the TTL is already long-lived.
   * Appending to a short dev TTL (e.g. max-age=60) would pin stale content in
   * shared caches; duplicating immutable after static-files already set it is
   * redundant
   * (BUG-static-asset-caching-unconditional-vary-immutable-on-short-t).
   * @param root0
   * @param root0.request
   * @param root0.headers
   */
  private augmentImmutable({ request, headers, }: { request: Request; headers: Headers },): void {
    const cacheControl = headers.get("Cache-Control",);
    if (!cacheControl?.includes("max-age",) || cacheControl.includes("immutable",)) { return; }
    const maxAge = /max-age=(\d+)/.exec(cacheControl,);
    if (!maxAge || Number(maxAge[1],) < IMMUTABLE_CACHE_MAX_AGE) { return; }
    if (HASHED_ASSET_PATTERN.test(new URL(request.url,).pathname,)) {
      headers.set("Cache-Control", `${cacheControl}, immutable`,);
    }
  }
}
