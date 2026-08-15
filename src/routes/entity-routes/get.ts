import { Elysia, } from "elysia";
import type { Config, } from "../../config/schema";
import type { Db, } from "../../db";
import { notFound, } from "../../validation/middleware";
import { ErrorResponse, SuccessResponse, } from "../../validation/schemas";
import { jsonResponse, } from "../http-utils";
import { checkOwnership, entityPaths, } from "./context";
import { applyResponseTransforms, } from "./helpers";
import type { EntityConfig, } from "./types";

export function getRoutes(config: EntityConfig, opts: { database: Db; config: Config },): Elysia {
  const { withIdPath, parentParam, } = entityPaths(config,);

  return new Elysia({ name: `${config.entityPath}-get`, },)
    .get(withIdPath, async (ctx,) => {
      const db = opts.database as any;
      const parentId = (ctx.params as any)[parentParam];
      const { entityId, } = ctx.params as any;
      const userId = (ctx as any).userId as string | null;
      const userRole = (ctx as any).userRole as string | null;

      const ownershipOk = await checkOwnership(opts.database, config, parentId, userId, userRole,);
      if (!ownershipOk) {
        return notFound(`${config.entityName} not found`,);
      }

      const entity = await db
        .selectFrom(config.tableName,)
        .selectAll()
        .where("id", "=", entityId,)
        .where(config.parentFk, "=", parentId,)
        .executeTakeFirst();

      if (!entity) { return notFound(`${config.entityName} not found`,); }
      return jsonResponse(applyResponseTransforms(config, entity,),);
    }, {
      response: {
        200: SuccessResponse,
        401: ErrorResponse,
        404: ErrorResponse,
      },
      detail: {
        summary: `Get ${config.entityName}`,
        description: `Get a single ${config.entityName} entity by ID.`,
        tags: [config.entityName,],
      },
    },);
}
