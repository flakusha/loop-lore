// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { moveLocationOrError, } from "./location-tree-move";

/**
 * Reparent a location through LocationTreeService.moveSubtree. A raw
 * parent_location_id UPDATE could create a parent cycle, which wedges the
 * recursive-CTE path-rewrite trigger and stalls the whole DB.
 *
 * @param database
 * @param worldId world the moved location must live in
 * @param locId location being moved
 * @param parentId new parent id
 * @returns error Response, or null when the move succeeded
 * @throws {Error} unexpected moveSubtree failure (rethrown for the 500 path)
 */
export async function reparentLocation(
  database: Kysely<DB>,
  worldId: string,
  locId: string,
  parentId: string,
): Promise<Response | null> {
  // A missing row is 404; a cross-world parent also reads as not-found here.
  return await moveLocationOrError(database, worldId, locId, parentId, ["not-found", "cross-world",],);
}
