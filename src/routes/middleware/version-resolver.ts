/**
 * Version resolver middleware.
 *
 * Extracts the API version from the URL path (/api/v1/...) or falls back to
 * Accept header content negotiation. Sets `ctx.apiVersion` for downstream
 * handlers and plugins.
 *
 * @see docs/spec/api-versioning.md
 */
import { Elysia, } from "elysia";

/** Supported API versions. */
export type ApiVersion = "1";

/** Default version when none is detected. */
const DEFAULT_VERSION: ApiVersion = "1";

/** Regex matching /api/vN/ prefix in URL path. */
const PATH_VERSION_RE = /^\/api\/v(\d+)\//;

/** Regex matching Accept header version negotiation. */
const ACCEPT_VERSION_RE = /application\/vnd\.loop-lore\.v(\d+)\+json/;

/**
 * Resolve API version from request.
 *
 * Priority:
 * 1. URL path: `/api/v1/{resource}` → `"1"`
 * 2. Accept header: `application/vnd.loop-lore.v1+json` → `"1"`
 * 3. Default: `"1"`
 */
export function resolveVersion(request: Request): ApiVersion {
  const url = new URL(request.url ?? "",);
  const pathMatch = url.pathname.match(PATH_VERSION_RE,);
  if (pathMatch?.[1]) {
    const v = parseInt(pathMatch[1], 10,);
    if (v === 1) { return "1"; }
  }

  const accept = request.headers?.get("Accept",) ?? "";
  const vndMatch = accept.match(ACCEPT_VERSION_RE,);
  if (vndMatch?.[1]) {
    const v = parseInt(vndMatch[1], 10,);
    if (v === 1) { return "1"; }
  }

  return DEFAULT_VERSION;
}

/**
 * Elysia plugin that injects `apiVersion` into the context.
 *
 * @example
 * app.use(versionResolver())
 * // ctx.apiVersion === "1"
 */
export function versionResolver() {
  return new Elysia({ name: "version-resolver", },)
    .derive({ as: "global", }, (ctx: any,) => ({
      apiVersion: resolveVersion(ctx.request,),
    }),);
}
