// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Deprecation headers middleware (FEAT-038).
 *
 * Applies RFC 8594 `Sunset` / `Deprecation` / `Link` headers to a response
 * without touching the body. Wired into the v1 barrel and the legacy
 * `/api/*` surface via `deprecationAfterHandle` / `applyDeprecationHeaders`.
 * @see docs/spec/api-versioning.md
 */

/** Options for deprecation header injection. */
export interface DeprecationHeadersOptions {
  /** Deprecated version, e.g. `"1"`. */
  deprecatedVersion: string;
  /** Successor version clients should migrate to, e.g. `"2"`. */
  successorVersion: string;
  /** Sunset date as an HTTP-date string, e.g. `"Sat, 01 Jan 2028 00:00:00 GMT"`. */
  sunset: string;
}

/** Config-derived options resolved from env/defaults for the deprecated surface. */
export interface DeprecationConfig {
  /**
   * Whether the deprecation envelope is active (e.g. `API_V1_DEPRECATED === "1"`).
   * A function is evaluated at request time so operators can flip the flag
   * without a restart.
   */
  enabled: boolean | (() => boolean);
  deprecatedVersion: string;
  successorVersion: string;
  sunset: string;
}

/** Resolve a possibly-lazy `enabled` flag to a concrete boolean. */
function isEnabled(enabled: DeprecationConfig["enabled"],): boolean {
  return typeof enabled === "function" ? enabled() : enabled;
}

/**
 * Return a copy of `response` with deprecation headers set.
 *
 * Body, status, and existing headers pass through untouched.
 * @param response - Outgoing response to annotate.
 * @param options - Deprecated/successor versions and sunset date.
 * @returns New response carrying `Sunset`, `Deprecation`, and `Link` headers.
 * @example
 * return withDeprecationHeaders(res, {
 *   deprecatedVersion: "1",
 *   successorVersion: "2",
 *   sunset: "Sat, 01 Jan 2028 00:00:00 GMT",
 * },);
 */
export function withDeprecationHeaders(
  response: Response,
  options: DeprecationHeadersOptions,
): Response {
  const headers = new Headers(response.headers,);
  headers.set("Sunset", options.sunset,);
  headers.set("Deprecation", "true",);
  headers.set(
    "Link",
    `</api/v${options.successorVersion}>; rel="successor-version"`,
  );
  headers.set("X-API-Deprecated-Version", options.deprecatedVersion,);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  },);
}

/**
 * Apply deprecation headers when the deprecation envelope is enabled;
 * return the original response otherwise.
 * @param response - Outgoing response.
 * @param config - Deprecation config (checked for `enabled`).
 * @returns Wrapped response when enabled, the input response otherwise.
 * @example
 * return applyDeprecationHeaders(res, {
 *   enabled: true,
 *   deprecatedVersion: "1",
 *   successorVersion: "2",
 *   sunset: "Sat, 01 Jan 2028 00:00:00 GMT",
 * },);
 */
export function applyDeprecationHeaders(
  response: Response,
  config: DeprecationConfig,
): Response {
  if (!isEnabled(config.enabled,)) {
    return response;
  }
  return withDeprecationHeaders(response, {
    deprecatedVersion: config.deprecatedVersion,
    successorVersion: config.successorVersion,
    sunset: config.sunset,
  },);
}

/**
 * Elysia `onAfterHandle` callback factory. Mutates `context.set.headers` so
 * deprecation headers land on the final response for **both** plain-object
 * handlers (Elysia serializes them with `set` metadata) and handlers that
 * return a `Response` (the Bun adapter merges `set.headers` on top).
 *
 * Returning a new `Response` does NOT work here: a plain-object handler has
 * no `Response` in `ctx.response` at this stage — `ctx.response` is the raw
 * handler value (e.g. `{ meta, data }`), so a `Response`-wrapping rewrite
 * would silently drop headers on the majority of routes. `ctx.set.headers`
 * is the single mechanism Elysia applies uniformly.
 * @param config - Deprecation config.
 * @returns AfterHandle handler that annotates `ctx.set.headers` in place.
 * @example
 * app.onAfterHandle(deprecationAfterHandle({ enabled: () => process.env.API_V1_DEPRECATED === "1", ... }));
 */
export function deprecationAfterHandle(
  config: DeprecationConfig,
): (ctx: { set: { headers: Record<string, string | number> } },) => void {
  return (ctx,) => {
    if (!isEnabled(config.enabled,)) {
      return;
    }
    const headers = ctx.set.headers;
    headers["Sunset"] = config.sunset;
    headers["Deprecation"] = "true";
    headers["Link"] = `</api/v${config.successorVersion}>; rel="successor-version"`;
    headers["X-API-Deprecated-Version"] = config.deprecatedVersion;
  };
}
