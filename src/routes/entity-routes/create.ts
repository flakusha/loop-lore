// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, } from "elysia";
import type { Config, } from "../../config/schema";
import type { Db, } from "../../db";
import { EntityCreateBody, ErrorResponse, SuccessResponse, } from "../../validation/schemas";
import { HttpStatus, jsonCreated, jsonError, } from "../http-utils";
import { checkOwnership, entityDb, entityPaths, readEntityAuth, readEntityParams, } from "./context";
import { applyResponseTransforms, buildCreateValues, } from "./helpers";
import type { EntityConfig, } from "./types";

/**
 * @param config
 * @param opts
 * @param opts.database
 * @param opts.config
 * @param prefix
 * @returns Elysia plugin serving the entity create endpoint.
 */
export function createRoutes(config: EntityConfig, opts: { database: Db; config: Config }, prefix = "/api",): Elysia {
  const { basePath, parentParam, } = entityPaths(config, prefix,);

  return new Elysia({ name: `${config.entityPath}-create`, },)
    .post(
      basePath,
      async (ctx,) => {
        // Auth derive fields (userId/userRole) are set on the context at
        // runtime by the app-level auth middleware, but stay statically
        // invisible on this self-contained Elysia instance — narrow them
        // structurally instead of casting the whole context to `any`
        // (BUG-route-bootstrap-as-any).
        const { userId, userRole, } = readEntityAuth(ctx,);
        const params = readEntityParams(ctx.params,);
        const parentId = params[parentParam];
        if (!parentId) {
          return jsonError({ message: `${config.entityName} not found`, status: HttpStatus.NotFound, },);
        }

        const body: Record<string, unknown> = { ...(ctx.body ?? {}), };

        // Config-driven table name: Kysely's builder needs the literal table
        // union, so the dynamic access is isolated to the shared boundary.
        const db = entityDb(opts.database,);

        const ownershipOk = await checkOwnership(opts.database, config, parentId, userId, userRole,);
        if (!ownershipOk) {
          return jsonError({ message: `${config.entityName} not found`, status: HttpStatus.NotFound, },);
        }

        if (config.writeGuard) {
          const guard = await config.writeGuard({ body, existing: null, userId, userRole, },);
          if (!guard.ok) {
            return jsonError({ message: guard.message, status: guard.status, },);
          }
        }

        for (const required of config.createRequired) {
          if (body[required] == null || body[required] === "") {
            return jsonError({ message: `${required} is required`, status: HttpStatus.BadRequest, },);
          }
        }

        const values = buildCreateValues({ config, parentId, body, },);
        await db.insertInto(config.tableName,).values(values,).execute();

        const created = await db
          .selectFrom(config.tableName,)
          .selectAll()
          .where("id", "=", String(values.id,),)
          .executeTakeFirst();

        return jsonCreated(applyResponseTransforms(config, created ?? {},),);
      },
      {
        body: EntityCreateBody,
        response: {
          201: SuccessResponse,
          401: ErrorResponse,
          404: ErrorResponse,
        },
        detail: {
          summary: `Create ${config.entityName}`,
          description: `Create a new ${config.entityName} entity.`,
          tags: [config.entityName,],
        },
      },
    );
}
