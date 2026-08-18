// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Db, } from "../../db";
import { can, } from "../../users/permissions";
import type { EntityConfig, } from "./types";

export interface EntityPaths {
  parentParam: string;
  basePath: string;
  withIdPath: string;
}

export function entityPaths(config: EntityConfig,): EntityPaths {
  const parentParam = config.parentParam ?? "id";
  const basePath = `/api/${config.parentPrefix}/:${parentParam}/${config.entityPath}`;
  const withIdPath = `${basePath}/:entityId`;
  return { parentParam, basePath, withIdPath, };
}

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
  const owner = await (database as any)
    .selectFrom(config.ownershipTable,)
    .select(config.ownershipFkColumn,)
    .where("id", "=", parentId,)
    .executeTakeFirst();
  return (
    !!owner && (owner[config.ownershipFkColumn] === userId || can(userRole, "admin.character",))
  );
}
