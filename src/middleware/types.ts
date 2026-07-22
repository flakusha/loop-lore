/**
 * Middleware types — RequestContext + Middleware signature
 *
 * Context is populated by auth middleware, consumed by route handlers
 * and downstream middleware (role guards, ownership checks).
 */

import type { Locale, TranslatorFn, } from "../i18n/types";

/**
 * Per-request context extracted/auth'd by middleware pipeline.
 * Passed to all route dispatch functions.
 */
export interface RequestContext {
  /** Authenticated user ID. null in solo/demo mode (implicit solo user). */
  userId: string | null;
  /** User role from users table. null before auth, "solo" in demo mode. */
  userRole: string | null;
  /** Active session ID. null in solo/demo mode. */
  sessionId: string | null;
  /** Detected locale for this request. Defaults to "en" if not set. */
  locale: Locale;
  /** Translator function for this request's locale. Returns key as-is if not set. */
  t: TranslatorFn;
}

/**
 * Create a minimal RequestContext with default locale/t.
 * Use when creating context outside the middleware pipeline.
 */
export function createRequestContext(
  partial: Pick<RequestContext, "userId" | "userRole" | "sessionId">,
): RequestContext {
  return {
    ...partial,
    locale: "en",
    t: (key: string,) => key,
  };
}

/**
 * Middleware function signature.
 *
 * Each middleware inspects/modifies context, then either:
 *   - short-circuits by returning a Response (auth failure, 403, etc.)
 *   - calls next() to continue the chain with (potentially enriched) context
 *
 * Errors should be caught and returned as error Responses, not thrown.
 */
export type Middleware = (
  request: Request,
  context: RequestContext,
  next: () => Promise<Response>,
) => Promise<Response>;

/**
 * Final handler in the chain — receives enriched context,
 * dispatches to the appropriate route controller.
 */
export type RouteHandler = (request: Request, context: RequestContext,) => Promise<Response> | Response;
