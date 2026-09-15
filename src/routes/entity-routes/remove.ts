// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, } from "elysia";
import type { Config, } from "../../config/schema";
import type { Db, } from "../../db";
import { notFound, } from "../../validation/middleware";
import { ErrorResponse, SuccessResponse, } from "../../validation/schemas";
import { jsonError, jsonNoContent, } from "../http-utils";
import { checkOwnership, entityPaths, } from "./context";
import type { EntityConfig, } from "./types";

/**
 * @param config
 * @param opts
 * @param opts.database
 * @param opts.config
 * @param prefix
 */
export function removeRoutes(config: EntityConfig, opts: { database: Db; config: Config }, prefix = "/api",): Elysia {
  const { withIdPath, parentParam, } = entityPaths(config, prefix,);

  return new Elysia({ name: `${config.entityPath}-remove`, },)
    .delete(withIdPath, async (ctx,) => {
      const db = opts.database as any;
      const parentId = (ctx.params as any)[parentParam];
      const { entityId, } = ctx.params as any;
      const userId = (ctx as any).userId as string | null;
      const userRole = (ctx as any).userRole as string | null;

      const ownershipOk = await checkOwnership(opts.database, config, parentId, userId, userRole,);
      if (!ownershipOk) {
        return notFound(`${config.entityName} not found`,);
      }
      if (config.writeGuard) {
        const row = (await db
          .selectFrom(config.tableName,)
          .selectAll()
          .where("id", "=", entityId,)
          .where(config.parentFk, "=", parentId,)
          .executeTakeFirst()) ?? null;
        const guard = await config.writeGuard({ body: {}, existing: row, userId, userRole, },);
        if (!guard.ok) {
          return jsonError({ message: guard.message, status: guard.status, },);
        }
      }

      const result = await db
        .deleteFrom(config.tableName,)
        .where("id", "=", entityId,)
        .where(config.parentFk, "=", parentId,)
        .execute();

      if ((result as any[]).length === 0) {
        return notFound(`${config.entityName} not found`,);
      }
      return jsonNoContent();
    }, {
      response: {
        204: SuccessResponse,
        401: ErrorResponse,
        404: ErrorResponse,
      },
      detail: {
        summary: `Delete ${config.entityName}`,
        description: `Delete a ${config.entityName} entity by ID.`,
        tags: [config.entityName,],
      },
    },);
}
