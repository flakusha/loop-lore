// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * RPG route handler helpers — eliminates the repeated auth + try/catch
 * boilerplate across route files.
 */
import { getRpgLog, } from "../../rpg/shared/rpg-service-utils";
import { ErrorResponse, SuccessResponse, } from "../../validation/schemas";
import { jsonError, requireUserId, } from "../http-utils";

/** Minimal Elysia context shape used inside RPG handlers. */
export interface RpgRouteContext {
  body: unknown;
  userId?: unknown;
  t?: unknown;
  [key: string]: unknown;
}

/**
 * Wrap an authenticated RPG route handler with auth check + try/catch +
 * structured logging. The inner function receives the validated userId
 * and the Elysia context. Returns a standard 500 error JSON on any
 * unhandled exception.
 * @param fn
 * @param errorLabel
 * @example
 * .post(
 *   "/api/rpg/dice/roll",
 *   rpgHandler(async (_userId, ctx) => {
 *     const body = ctx.body as DiceRollBody;
 *     return rollDice(body.sides, body.count ?? 1, body.modifier ?? 0);
 *   }, "Failed to roll dice"),
 *   rpgRouteConfig(DiceRollBody, "Roll dice", "...", "Dice"),
 * )
 */
export function rpgHandler<T = unknown,>(
  fn: (userId: string, ctx: RpgRouteContext,) => Promise<T | Response>,
  errorLabel: string,
) {
  return async (ctx: RpgRouteContext,) => {
    const userId = requireUserId(ctx,);
    if (typeof userId !== "string") { return userId; }
    try {
      return await fn(userId, ctx,);
    } catch (error) {
      getRpgLog("rpg-routes",).error(errorLabel, error instanceof Error ? error : undefined,);
      return jsonError("Internal server error", 500,);
    }
  };
}

/**
 * Standard Elysia route config for RPG endpoints:
 * - `response`: 200 SuccessResponse / 401 ErrorResponse
 * - `detail`: summary, description, tags with `["RPG", category]`
 * @param body
 * @param summary
 * @param description
 * @param category
 */
export function rpgRouteConfig(
  body: unknown,
  summary: string,
  description: string,
  category: string,
): {
  body: unknown;
  response: Record<number, unknown>;
  detail: { summary: string; description: string; tags: readonly string[] };
} {
  return {
    body,
    response: {
      200: SuccessResponse,
      401: ErrorResponse,
    },
    detail: {
      summary,
      description,
      tags: ["RPG", category,],
    },
  };
}
