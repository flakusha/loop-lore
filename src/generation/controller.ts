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
import { handleGenerate } from "./generate-route";
import { jsonError } from "../routes/http-utils";
import type { Config } from "../config/schema";
import { loadConfig } from "../config/load";

// ── Helpers ──────────────────────────────────────────────────

/** Parse JSON request body, returning an error Response on parse failure */
async function parseJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch (parseError) {
    return jsonError(`Invalid JSON: ${(parseError as Error).message}`, 400);
  }
}

/**
 * Dispatch generation-related API requests.
 * Returns a Response or null if the path doesn't match.
 *
 * @param userId  Authenticated user ID (from auth middleware). May be null.
 * @param _userRole  User role for future access checks.
 */
// eslint-disable-next-line sonarjs/cognitive-complexity
export async function dispatch(
  request: Request,
  _userId?: string | null,
  _userRole?: string | null,
  config?: Config,
): Promise<Response | null> {
  const url = new URL(request.url);
  const { pathname } = url;

  // POST /api/generation/generate — main generation endpoint
  if (pathname === "/api/generation/generate" && request.method === "POST") {
    const body = await parseJsonBody(request);
    if (body instanceof Response) return body;
    const cfg = config ?? loadConfig();
    return handleGenerate(body, cfg, _userId ?? undefined);
  }

  // POST /api/generation/cancel
  if (pathname === "/api/generation/cancel" && request.method === "POST") {
    const body = await parseJsonBody(request);
    if (body instanceof Response) return body;
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
    const body = await parseJsonBody(request);
    if (body instanceof Response) return body;
    return handleRetryGeneration(body);
  }

  // POST /api/generation/continue
  if (pathname === "/api/generation/continue" && request.method === "POST") {
    const body = await parseJsonBody(request);
    if (body instanceof Response) return body;
    return handleContinueGeneration(body);
  }

  // POST /api/generation/regenerate
  if (pathname === "/api/generation/regenerate" && request.method === "POST") {
    const body = await parseJsonBody(request);
    if (body instanceof Response) return body;
    return handleRegenerate(body);
  }

  return null; // Not a generation route
}
