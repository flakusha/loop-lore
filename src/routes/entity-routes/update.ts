// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, } from "elysia";
import type { Config, } from "../../config/schema";
import type { Db, } from "../../db";
import { notFound, } from "../../validation/middleware";
import { EntityUpdateBody, ErrorResponse, SuccessResponse, } from "../../validation/schemas";
import { jsonResponse, } from "../http-utils";
import { checkOwnership, entityPaths, } from "./context";
import { buildUpdateValues, } from "./helpers";
import type { EntityConfig, } from "./types";

export function updateRoutes(config: EntityConfig, opts: { database: Db; config: Config },): Elysia {
  const { withIdPath, parentParam, } = entityPaths(config,);

  return new Elysia({ name: `${config.entityPath}-update`, },)
    .put(
      withIdPath,
      async (ctx,) => {
        const db = opts.database as any;
        const parentId = (ctx.params as any)[parentParam];
        const { entityId, } = ctx.params as any;
        const userId = (ctx as any).userId as string | null;
        const userRole = (ctx as any).userRole as string | null;
        const body = ((ctx as any).body || {}) as Record<string, unknown>;

        const ownershipOk = await checkOwnership(opts.database, config, parentId, userId, userRole,);
        if (!ownershipOk) {
          return notFound(`${config.entityName} not found`,);
        }

        const existing = await db
          .selectFrom(config.tableName,)
          .select("id",)
          .where("id", "=", entityId,)
          .where(config.parentFk, "=", parentId,)
          .executeTakeFirst();

        if (!existing) { return notFound(`${config.entityName} not found`,); }

        const updates = buildUpdateValues({ config, body, },);
        if (Object.keys(updates,).length <= 1) { return jsonResponse(existing,); }

        await db.updateTable(config.tableName,).set(updates,).where("id", "=", entityId,).execute();

        const updated = await db
          .selectFrom(config.tableName,)
          .selectAll()
          .where("id", "=", entityId,)
          .executeTakeFirst();

        return jsonResponse(updated,);
      },
      {
        body: EntityUpdateBody,
        response: {
          200: SuccessResponse,
          401: ErrorResponse,
          404: ErrorResponse,
        },
        detail: {
          summary: `Update ${config.entityName}`,
          description: `Update an existing ${config.entityName} entity.`,
          tags: [config.entityName,],
        },
      },
    );
}
