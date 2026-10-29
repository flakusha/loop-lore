// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
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
 * Row shape of a config-driven entity table: the table name and its columns
 * are only known at runtime, so every row is read as a plain record.
 */
export type EntityRow = Record<string, unknown>;

/**
 * The single Kysely boundary for config-driven tables: an open table map
 * whose rows are plain records.
 */
export type EntityDb = Kysely<Record<string, EntityRow>>;

/**
 * @param database
 * @returns The database seen through the config-driven entity table boundary.
 */
export function entityDb(database: Db,): EntityDb {
  // The one cast for config-driven tables: the entity table name comes from
  // config, so it is not part of the static schema and Kysely needs the
  // widened table map to resolve it at runtime.
  return database as unknown as EntityDb;
}

/** Auth fields the app-level derive attaches to the request context. */
export interface EntityAuth {
  userId: string | null;
  userRole: string | null;
}

/**
 * @param ctx
 * @returns The auth fields of the request context.
 */
export function readEntityAuth(ctx: unknown,): EntityAuth {
  const source = (ctx ?? {}) as Record<string, unknown>;
  return {
    userId: typeof source.userId === "string" ? source.userId : null,
    userRole: typeof source.userRole === "string" ? source.userRole : null,
  };
}

/**
 * @param params
 * @returns The string route params of the request.
 */
export function readEntityParams(params: unknown,): Record<string, string | undefined> {
  const source = (params ?? {}) as Record<string, unknown>;
  const out: Record<string, string | undefined> = {};
  for (const [key, value,] of Object.entries(source,)) {
    if (typeof value === "string") { out[key] = value; }
  }

  return out;
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

  const owner = await entityDb(database,)
    .selectFrom(config.ownershipTable,)
    .select(columns,)
    .where("id", "=", parentId,)
    .executeTakeFirst();

  if (!owner) { return false; }
  if (can(userRole, "admin.character",)) { return true; }
  // A NULL ownership column must never match a NULL (anonymous) userId:
  // `null === null` would hand an unauthenticated caller the row.
  if (typeof userId !== "string" || userId.length === 0) { return false; }

  return columns.some((column,) => {
    const value = owner[column];
    return typeof value === "string" && value === userId;
  },);
}
