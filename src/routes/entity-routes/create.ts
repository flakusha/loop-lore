import { Elysia, } from "elysia";
import type { Config, } from "../../config/schema";
import type { Db, } from "../../db";
import { EntityCreateBody, ErrorResponse, SuccessResponse, } from "../../validation/schemas";
import { HttpStatus, jsonCreated, jsonError, } from "../http-utils";
import { checkOwnership, entityPaths, } from "./context";
import { applyResponseTransforms, buildCreateValues, } from "./helpers";
import type { EntityConfig, } from "./types";

export function createRoutes(config: EntityConfig, opts: { database: Db; config: Config },): Elysia {
  const { basePath, parentParam, } = entityPaths(config,);

  return new Elysia({ name: `${config.entityPath}-create`, },)
    .post(
      basePath,
      async (ctx,) => {
        const db = opts.database as any;
        const parentId = (ctx.params as any)[parentParam];
        const userId = (ctx as any).userId as string | null;
        const userRole = (ctx as any).userRole as string | null;
        const body = ((ctx as any).body || {}) as Record<string, unknown>;

        const ownershipOk = await checkOwnership(opts.database, config, parentId, userId, userRole,);
        if (!ownershipOk) {
          return jsonError({ message: `${config.entityName} not found`, status: HttpStatus.NotFound, },);
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
          .where("id", "=", values.id,)
          .executeTakeFirst();

        return jsonCreated(applyResponseTransforms(config, created,),);
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
