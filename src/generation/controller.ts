/**
 * Generation Controller
 *
 * Routes for LLM generation control. Dispatches to handler
 * functions in generation-routes.ts.
 *
 *   POST /api/generation/cancel       — Cancel active generation
 *   GET  /api/generation/status/:id   — Check generation status
 *   POST /api/generation/continue     — Continue partial/cancelled message
 *   POST /api/generation/retry        — Retry with step-from-point
 *   POST /api/generation/regenerate   — Replace AI response
 *   GET  /api/generation/active       — List active (admin)
 */

import {
  handleCancelGeneration,
  handleGenerationStatus,
  handleRetryGeneration,
  handleContinueGeneration,
  handleListActiveGenerations,
  handleRegenerate,
} from "./generation-routes";
import { jsonError } from "../routes/http-utils";

/**
 * Dispatch generation-related API requests.
 * Returns a Response or null if the path doesn't match.
 *
 * @param userId  Authenticated user ID (from auth middleware). May be null.
 * @param _userRole  User role for future access checks.
 */
export async function dispatch(
  request: Request,
  _userId?: string | null,
  _userRole?: string | null,
): Promise<Response | null> {
  const url = new URL(request.url);
  const { pathname } = url;

  // POST /api/generation/cancel
  if (pathname === "/api/generation/cancel" && request.method === "POST") {
    let body: unknown;
    try {
      body = await request.json();
    } catch (parseError) {
      return jsonError(`Invalid JSON: ${(parseError as Error).message}`, 400);
    }
    return handleCancelGeneration(body);
  }

  // GET /api/generation/status/:chatId
  const statusMatch = /^\/api\/generation\/status\/([^/]+)$/.exec(pathname);
  if (statusMatch && request.method === "GET") {
    return handleGenerationStatus(statusMatch[1]);
  }

  // GET /api/generation/active
  if (pathname === "/api/generation/active" && request.method === "GET") {
    return handleListActiveGenerations();
  }

  // POST /api/generation/retry
  if (pathname === "/api/generation/retry" && request.method === "POST") {
    let body: unknown;
    try {
      body = await request.json();
    } catch (parseError) {
      return jsonError(`Invalid JSON: ${(parseError as Error).message}`, 400);
    }
    return handleRetryGeneration(body);
  }

  // POST /api/generation/continue
  if (pathname === "/api/generation/continue" && request.method === "POST") {
    let body: unknown;
    try {
      body = await request.json();
    } catch (parseError) {
      return jsonError(`Invalid JSON: ${(parseError as Error).message}`, 400);
    }
    return handleContinueGeneration(body);
  }

  // POST /api/generation/regenerate
  if (pathname === "/api/generation/regenerate" && request.method === "POST") {
    let body: unknown;
    try {
      body = await request.json();
    } catch (parseError) {
      return jsonError(`Invalid JSON: ${(parseError as Error).message}`, 400);
    }
    return handleRegenerate(body);
  }

  return null; // Not a generation route
}
