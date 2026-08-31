// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, } from "elysia";
import type { Config, } from "../../config/schema";
import type { Db, } from "../../db";
import { notFound, } from "../../validation/middleware";
import { ErrorResponse, SuccessResponse, } from "../../validation/schemas";
import { jsonNoContent, } from "../http-utils";
import { checkOwnership, entityPaths, } from "./context";
import type { EntityConfig, } from "./types";

/**
 * @param config
 * @param opts
 * @param opts.database
 * @param opts.config
 */
export function removeRoutes(config: EntityConfig, opts: { database: Db; config: Config },): Elysia {
  const { withIdPath, parentParam, } = entityPaths(config,);

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
