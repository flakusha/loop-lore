// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { jsonResponse, } from "../http-utils";
import { requireWorldOwner, } from "./access";
import { moveLocationOrError, } from "./location-tree-move";

/**
 * Move a location (and its subtree) under a new parent via
 * LocationTreeService.moveSubtree, which rejects self-parents, cycles and
 * cross-world parents at the application layer. A raw parent_location_id
 * UPDATE would bypass those checks and can wedge the recursive-CTE
 * path-rewrite trigger.
 *
 * @param database
 * @param worldId world the moved location must live in
 * @param locId location being moved
 * @param newParentId new parent id, or null to make the location a root
 * @param userId
 * @param userRole
 * @returns {Promise<Response>}
 */
export async function handleMoveLocation(
  database: Kysely<DB>,
  worldId: string,
  locId: string,
  newParentId: string | null,
  userId: string | null,
  userRole: string | null,
) {
  const worldErr = await requireWorldOwner(database, worldId, userId, userRole,);
  if (worldErr) { return worldErr; }

  // Cycle/self-parent/cross-world are client errors (400); only a truly
  // missing row is a 404.
  const moveErr = await moveLocationOrError(database, worldId, locId, newParentId, ["not-found",],);
  return moveErr ?? jsonResponse({ ok: true, },);
}
