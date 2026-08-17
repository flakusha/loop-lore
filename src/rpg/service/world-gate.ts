// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * World-Gate — RPG mechanics opt-in per world.
 *
 * Worlds set `rpg_enabled = 1` to activate RPG features.
 * Routes that modify RPG state should call `requireRpgEnabled` when a
 * world context is available.
 */

import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";

export interface WorldGateResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Check if a world has RPG mechanics enabled.
 *
 * @returns `{ allowed: true }` or `{ allowed: false, reason }`.
 */
export async function checkRpgEnabled(
  database: Kysely<DB>,
  worldId: string,
): Promise<WorldGateResult> {
  const world = await database
    .selectFrom("worlds",)
    .select("rpg_enabled",)
    .where("id", "=", worldId,)
    .executeTakeFirst();

  if (!world) {
    return { allowed: false, reason: "World not found", };
  }

  if (!world.rpg_enabled) {
    return { allowed: false, reason: "RPG mechanics are not enabled for this world", };
  }

  return { allowed: true, };
}
