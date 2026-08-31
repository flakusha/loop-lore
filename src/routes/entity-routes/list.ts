// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, } from "elysia";
import type { Config, } from "../../config/schema";
import type { Db, } from "../../db";
import { parseIntOr, } from "../../utils/parse-number";
import { ErrorResponse, SuccessResponse, } from "../../validation/schemas";
import { HttpStatus, jsonError, jsonPaginated, } from "../http-utils";
import { checkOwnership, entityPaths, } from "./context";
import { applyResponseTransforms, } from "./helpers";
import type { EntityConfig, } from "./types";

/**
 * @param config
 * @param opts
 * @param opts.database
 * @param opts.config
 */
export function listRoutes(config: EntityConfig, opts: { database: Db; config: Config },): Elysia {
  const { basePath, parentParam, } = entityPaths(config,);

  return new Elysia({ name: `${config.entityPath}-list`, },)
    .get(basePath, async (ctx,) => {
      const db = opts.database as any;
      const parentId = (ctx.params as any)[parentParam];
      const userId = (ctx as any).userId as string | null;
      const userRole = (ctx as any).userRole as string | null;
      const searchParams = new URL((ctx as any).request.url,).searchParams;

      const ownershipOk = await checkOwnership(opts.database, config, parentId, userId, userRole,);
      if (!ownershipOk) {
        return jsonError({ message: `${config.entityName} not found`, status: HttpStatus.NotFound, },);
      }

      const page = parseIntOr(searchParams.get("page",) ?? "1", 1,);
      const pageSize = parseIntOr(searchParams.get("pageSize",) ?? "50", 50,);
      const offset = (page - 1) * pageSize;

      const countQuery = db
        .selectFrom(config.tableName,)
        .select(db.fn.countAll().as("total",),)
        .where(config.parentFk, "=", parentId,);
      const listQuery = db.selectFrom(config.tableName,).selectAll().where(config.parentFk, "=", parentId,);

      if (config.filterField) {
        const filterValue = searchParams.get(config.filterField.param,);
        if (filterValue) {
          countQuery.where(config.filterField.column, "=", filterValue,);
          listQuery.where(config.filterField.column, "=", filterValue,);
        }
      }

      const countResult: { total?: number | bigint } = await countQuery.executeTakeFirst();
      const total = Number(countResult?.total ?? 0,);

      let query = listQuery;
      for (const ob of config.orderBy) {
        query = query.orderBy(ob.column, ob.dir,);
      }
      const entities = await query.limit(pageSize,).offset(offset,).execute();
      const mapped = Array.from(entities, (e,) => applyResponseTransforms(config, e as Record<string, unknown>,),);

      return jsonPaginated({ data: mapped, total, page, pageSize, },);
    }, {
      response: {
        200: SuccessResponse,
        401: ErrorResponse,
        404: ErrorResponse,
      },
      detail: {
        summary: `List ${config.entityName}`,
        description: `List all ${config.entityName} entities for a parent. Paginated.`,
        tags: [config.entityName,],
      },
    },);
}
