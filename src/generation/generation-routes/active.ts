// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Context, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { forbiddenResponse, jsonResponse, requireUserId, } from "../../routes/http-utils";
import { can, } from "../../users/permissions";
import { listActiveGenerations, } from "../cancellation-manager";

/** Auth fields populated by the global Elysia derive middleware. */
interface AuthContext {
  userId: string | null;
  userRole: string | null;
}
/** Typed request context for authenticated generation routes. */
export type Ctx = Context & AuthContext;

// ── Route: List active generations ─────────────────────────

/**
 * GET /api/generation/active
 *
 * List all currently active generation attempts (admin/debugging).
 * Admin-only: the listing spans every chat and user, so it is a global
 * control-plane endpoint (BUG-generation-control-plane-routes-lack-authorization).
 * @param _database
 * @param userId
 * @param userRole
 * @returns {Response}
 */
export function handleListActiveGenerations(
  _database?: Kysely<DB>,
  userId?: string,
  userRole?: string | null,
): Response {
  const authUserId = requireUserId({ userId, },);
  if (typeof authUserId !== "string") { return authUserId; }
  if (!can(userRole, "admin.system",)) {
    return forbiddenResponse();
  }

  const active = listActiveGenerations();
  return jsonResponse({
    count: active.length,
    generations: active,
  },);
}

// ── Route: Caller's own active count ──────────────────────

/**
 * GET /api/v1/generation/active/me
 *
 * Count only the caller's in-flight generations. A user's actor row uses
 * their user id, so `actorId` is the ownership key.
 * @param ctx - typed request context carrying the derived auth fields
 * @returns a 401 JSON error, or `{ count }` for the authenticated caller
 */
export function handleOwnActiveCount(ctx: Ctx,): Response {
  const userId = requireUserId(ctx,);
  if (typeof userId !== "string") { return userId; }

  const count = listActiveGenerations().filter((gen,) => gen.actorId === userId).length;
  return jsonResponse({ count, },);
}
