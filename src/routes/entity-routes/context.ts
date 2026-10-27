// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Db, } from "../../db";
import { can, } from "../../users/permissions";
import type { EntityConfig, } from "./types";

/** */
export interface EntityPaths {
  parentParam: string;
  basePath: string;
  withIdPath: string;
}

/**
 * @param config
 * @param basePathPrefix
 * @returns {EntityPaths}
 */
export function entityPaths(config: EntityConfig, basePathPrefix = "/api",): EntityPaths {
  const parentParam = config.parentParam == null ? "id" : config.parentParam;
  const basePath = `${basePathPrefix}/${config.parentPrefix}/:${parentParam}/${config.entityPath}`;
  const withIdPath = `${basePath}/:entityId`;
  return { parentParam, basePath, withIdPath, };
}

/**
 * @param database
 * @param config
 * @param parentId
 * @param userId
 * @param userRole
 * @returns {Promise<boolean>}
 */
export async function checkOwnership(
  database: Db,
  config: EntityConfig,
  parentId: string,
  userId: string | null,
  userRole: string | null,
): Promise<boolean> {
  if (config.checkOwnership) {
    return config.checkOwnership({
      database,
      parentId,
      _entityId: null,
      userId,
      userRole,
    },);
  }

  // An `actors` row carries two ownership links: `user_id` (the user's own
  // persona) and `owner_id` (a character they own). Either grants access,
  // mirroring `resolveActorAccess` in src/routes/actor-access.ts.
  const columns: string[] = config.ownershipTable === "actors"
    ? ["user_id", "owner_id",]
    : [config.ownershipFkColumn,];

  const owner = await (database as any)
    .selectFrom(config.ownershipTable,)
    .select(columns,)
    .where("id", "=", parentId,)
    .executeTakeFirst();

  if (!owner) { return false; }
  if (can(userRole, "admin.character",)) { return true; }
  // A NULL ownership column must never match a NULL (anonymous) userId:
  // `null === null` would hand an unauthenticated caller the row.
  if (typeof userId !== "string" || userId.length === 0) { return false; }

  return columns.some((column,) => owner[column] === userId);
}
