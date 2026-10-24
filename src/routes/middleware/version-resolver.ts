// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Version resolver middleware.
 *
 * Extracts the API version from the URL path (/api/v1/...) or falls back to
 * Accept header content negotiation. Sets `ctx.apiVersion` for downstream
 * handlers and plugins, and rejects requests that name a version this server
 * does not serve - an unknown version is a client error (400), not a silent
 * fallback to the default version.
 * @see docs/spec/api-versioning.md
 */
import { Elysia, } from "elysia";
import { HttpStatus, jsonError, } from "../http-utils";

/** API versions this server serves. */
const SUPPORTED_API_VERSIONS = ["1",] as const;

/** A version this server serves. */
export type ApiVersion = (typeof SUPPORTED_API_VERSIONS)[number];

/** Default version when none is detected. */
const DEFAULT_VERSION: ApiVersion = "1";

/** Regex matching /api/vN prefix in URL path. */
const PATH_VERSION_RE = /^\/api\/v(\d+)(?:\/|$)/;

/** Regex matching Accept header version negotiation. */
const ACCEPT_VERSION_RE = /application\/vnd\.loop-lore\.v(\d+)\+json/;

/**
 * The API version the client explicitly asked for, if any.
 *
 * Priority (same as `resolveVersion`): URL path first, Accept header second.
 * @param request
 * @returns the requested version, or null when the client named no version
 */
function requestedVersion(request: Request,): string | null {
  const url = new URL(request.url ?? "",);
  const pathMatch = PATH_VERSION_RE.exec(url.pathname,);
  if (pathMatch?.[1]) { return pathMatch[1]; }

  const accept = request.headers?.get("Accept",) ?? "";
  const acceptMatch = ACCEPT_VERSION_RE.exec(accept,);
  if (acceptMatch?.[1]) { return acceptMatch[1]; }

  return null;
}

/**
 * True when this server serves the given version.
 * @param version
 */
function isSupportedVersion(version: string,): version is ApiVersion {
  return (SUPPORTED_API_VERSIONS as readonly string[]).includes(version,);
}

/**
 * Reject a request that names an API version this server does not serve.
 *
 * Without this, an unknown version fell through to the default version and
 * the catch-all 308'd `/api/v2/x` to `/api/v1/v2/x` - a redirect to a 404
 * instead of a clear error.
 * @param request
 * @returns a 400 JSON error envelope naming the supported versions, or
 * undefined when the requested version is supported (or absent)
 */
function unsupportedVersionResponse(request: Request,): Response | undefined {
  const requested = requestedVersion(request,);
  if (!requested || isSupportedVersion(requested,)) { return undefined; }

  return jsonError({
    message: `Unsupported API version "${requested}". Supported versions: ${SUPPORTED_API_VERSIONS.join(", ",)}.`,
    status: HttpStatus.BadRequest,
  },);
}

/**
 * Resolve API version from request.
 *
 * Priority:
 * 1. URL path: `/api/v1/{resource}` → `"1"`
 * 2. Accept header: `application/vnd.loop-lore.v1+json` → `"1"`
 * 3. Default: `"1"`
 *
 * A request that names an unsupported version is rejected by
 * `unsupportedVersionResponse` before it ever reaches this resolver.
 * @param request
 * @returns {"1"}
 */
export function resolveVersion(request: Request,): ApiVersion {
  const requested = requestedVersion(request,);
  if (requested && isSupportedVersion(requested,)) { return requested; }

  return DEFAULT_VERSION;
}

/**
 * Elysia plugin that injects `apiVersion` into the context and rejects a
 * request that names an API version this server does not serve.
 *
 * The gate lives here so every caller of the version middleware gets it: a
 * request for an unsupported version is answered with a 400 envelope before
 * it can reach a route (or the legacy redirect to a 404).
 * @returns {Elysia<"", { decorator: {}; store: {}; derive: { readonly apiVersion: "1"; }; resolve: {}; }, { typebox: {}; error: {}; }, { schema: {}; standaloneSchema: {}; macro: {}; macroFn: {}; parser: {}; response: ExtractErrorFromHandle<{ readonly apiVersion: "1"; }>; }, {}, { ...; }, { ...; }>}
 */
export function versionResolver() {
  return new Elysia({ name: "version-resolver", },)
    .onRequest((ctx: { request: Request },) => unsupportedVersionResponse(ctx.request,))
    .derive({ as: "global", }, (ctx: any,) => ({
      apiVersion: resolveVersion(ctx.request,),
    }),);
}
