// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { forbiddenResponse, jsonResponse, requireUserId, } from "../../routes/http-utils";
import { can, } from "../../users/permissions";
import { listActiveGenerations, } from "../cancellation-manager";

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
