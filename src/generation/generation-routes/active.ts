// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { jsonResponse, } from "../../routes/http-utils";
import { listActiveGenerations, } from "../cancellation-manager";

// ── Route: List active generations ─────────────────────────

/**
 * GET /api/generation/active
 *
 * List all currently active generation attempts (admin/debugging).
 * @param _database
 */
export function handleListActiveGenerations(_database?: Kysely<DB>,): Response {
  const active = listActiveGenerations();
  return jsonResponse({
    count: active.length,
    generations: active,
  },);
}
