/**
 * Middleware pipeline runner.
 *
 * Composes an array of Middleware functions into a single handler.
 * Each middleware receives (request, context, next) and decides:
 *   - short-circuit: return Response (stops chain)
 *   - pass through: await next() after enriching context
 *
 * Usage:
 *   const handler = compose([authMiddleware, roleGuard, router]);
 *   const response = await handler(request, initialContext);
 */

import { getLogger, } from "../logger";
import { ErrorCode, HttpStatus, jsonError, } from "../routes/http-utils";
import type { Middleware, RequestContext, RouteHandler, } from "./types";
import { createRequestContext, } from "./types";

/**
 * Composite handler — middleware chain ready to invoke.
 * Takes just request + context (no next parameter — this IS the terminal).
 */
export type Pipeline = (request: Request, context: RequestContext,) => Promise<Response>;

/**
 * Compose middleware array into a single handler.
 *
 * Middleware runs left-to-right. Each receives the context returned
 * by the previous middleware. The last middleware is the route handler.
 */
export function compose(middleware: Middleware[], finalHandler: RouteHandler,): Pipeline {
  return async (request: Request, context: RequestContext,): Promise<Response> => {
    // Build the chain from right to left so the first middleware
    // in the array is the outermost layer.
    let chain = async (req: Request, ctx: RequestContext,): Promise<Response> => {
      return finalHandler(req, ctx,);
    };

    // Wrap from rightmost middleware inward
    for (let i = middleware.length - 1; i >= 0; i--) {
      const mw = middleware[i];
      const next = chain;
      chain = async (req: Request, ctx: RequestContext,): Promise<Response> => {
        return mw!(req, ctx, () => next(req, ctx,),);
      };
    }

    return chain(request, context,);
  };
}

/**
 * Error boundary middleware.
 * Catches any thrown errors and returns a 500 Response.
 * Use as the outermost middleware (first in the array).
 */
export async function errorBoundary(
  _request: Request,
  context: RequestContext,
  next: () => Promise<Response>,
): Promise<Response> {
  try {
    return await next();
  } catch (error: unknown) {
    const logger = (context as unknown as Record<string, unknown>).logger as import("../logger").Logger | undefined;
    (logger ?? getLogger()).error("Unhandled middleware error", error instanceof Error ? error : undefined,);
    const message = error instanceof Error
      ? error.message
      : (context.t?.("errors.serverError",) ?? "Internal server error");
    return jsonError({ message, status: HttpStatus.InternalServerError, code: ErrorCode.ServerError, },);
  }
}

/**
 * Create an initial empty RequestContext.
 */
export function emptyContext(): RequestContext {
  return createRequestContext({ userId: null, userRole: null, sessionId: null, },);
}
