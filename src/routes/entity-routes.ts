/**
 * Entity Routes Factory for Elysia
 *
 * Generic CRUD route generator for child-entity patterns:
 *   GET    /api/:parentPrefix/:parentId/:entityPath       — list (paginated)
 *   POST   /api/:parentPrefix/:parentId/:entityPath       — create
 *   GET    /api/:parentPrefix/:parentId/:entityPath/:id   — get
 *   PUT    /api/:parentPrefix/:parentId/:entityPath/:id   — update
 *   DELETE /api/:parentPrefix/:parentId/:entityPath/:id   — delete
 */

import { Elysia, } from "elysia";
import type { Config, } from "../config/schema";
import type { Db, } from "../db";
import { jsonStringifyOr, uid, } from "../utils";
import { notFound, } from "../validation/middleware";
import { EntityCreateBody, EntityUpdateBody, } from "../validation/schemas";
import { HttpStatus, jsonCreated, jsonError, jsonNoContent, jsonPaginated, jsonResponse, } from "./http-utils";

export interface EntityConfig {
  parentPrefix: string;
  entityPath: string;
  entityName: string;
  tableName: string;
  parentFk: string;
  ownershipTable: string;
  ownershipFkColumn: string;
  orderBy: { column: string; dir: "asc" | "desc" }[];
  filterField?: { param: string; column: string };
  fieldMappings: Record<string, string>;
  jsonFields: string[];
  defaults: Record<string, unknown>;
  createRequired: string[];
  checkOwnership?: (opts: {
    database: Db;
    parentId: string;
    _entityId: string | null;
    userId: string | null;
    userRole: string | null;
  },) => Promise<boolean>;
}

function buildCreateValues({
  config,
  parentId,
  body,
}: {
  config: EntityConfig;
  parentId: string;
  body: Record<string, unknown>;
},): Record<string, unknown> {
  const values: Record<string, unknown> = {
    id: uid(),
    [config.parentFk]: parentId,
  };
  for (const [camel, col,] of Object.entries(config.fieldMappings,)) {
    const val = body[camel] ?? config.defaults[camel];
    if (val != null) {
      values[col] = config.jsonFields.includes(camel,) ? jsonStringifyOr(val,) : val;
    }
  }
  return values;
}

function buildUpdateValues({
  config,
  body,
}: {
  config: EntityConfig;
  body: Record<string, unknown>;
},): Record<string, unknown> {
  const updates: Record<string, unknown> = {};
  for (const [camel, col,] of Object.entries(config.fieldMappings,)) {
    if (body[camel] != null) {
      updates[col] = config.jsonFields.includes(camel,) ? jsonStringifyOr(body[camel],) : body[camel];
    }
  }
  updates.updated_at = new Date().toISOString();
  return updates;
}

export function createEntityRoutes(config: EntityConfig, opts: { database: Db; config: Config },): Elysia {
  const basePath = `/api/${config.parentPrefix}/:id/${config.entityPath}`;
  const withIdPath = `${basePath}/:entityId`;

  async function checkOwnership(
    database: Db,
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
      !!owner && (owner[config.ownershipFkColumn] === userId || userRole === "admin" || userRole === "solo")
    );
  }

  return new Elysia({ name: config.entityPath, },)
    .get(basePath, async (ctx,) => {
      const db = opts.database as any;
      const { id: parentId, } = ctx.params as any;
      const userId = (ctx as any).userId as string | null;
      const userRole = (ctx as any).userRole as string | null;
      const searchParams = new URL((ctx as any).request.url,).searchParams;

      const ownershipOk = await checkOwnership(opts.database, parentId, userId, userRole,);
      if (!ownershipOk) {
        return jsonError({ message: `${config.entityName} not found`, status: HttpStatus.NotFound, },);
      }

      const page = parseInt(searchParams.get("page",) ?? "1", 10,);
      const pageSize = parseInt(searchParams.get("pageSize",) ?? "50", 10,);
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

      return jsonPaginated({ data: entities, total, page, pageSize, },);
    },)
    .post(
      basePath,
      async (ctx,) => {
        const db = opts.database as any;
        const { id: parentId, } = ctx.params as any;
        const userId = (ctx as any).userId as string | null;
        const userRole = (ctx as any).userRole as string | null;
        const body = ((ctx as any).body || {}) as Record<string, unknown>;

        const ownershipOk = await checkOwnership(opts.database, parentId, userId, userRole,);
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

        return jsonCreated(created,);
      },
      { body: EntityCreateBody, },
    )
    .get(withIdPath, async (ctx,) => {
      const db = opts.database as any;
      const { id: parentId, entityId, } = ctx.params as any;
      const userId = (ctx as any).userId as string | null;
      const userRole = (ctx as any).userRole as string | null;

      const ownershipOk = await checkOwnership(opts.database, parentId, userId, userRole,);
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
      return jsonResponse(entity,);
    },)
    .put(
      withIdPath,
      async (ctx,) => {
        const db = opts.database as any;
        const { id: parentId, entityId, } = ctx.params as any;
        const userId = (ctx as any).userId as string | null;
        const userRole = (ctx as any).userRole as string | null;
        const body = ((ctx as any).body || {}) as Record<string, unknown>;

        const ownershipOk = await checkOwnership(opts.database, parentId, userId, userRole,);
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
      { body: EntityUpdateBody, },
    )
    .delete(withIdPath, async (ctx,) => {
      const db = opts.database as any;
      const { id: parentId, entityId, } = ctx.params as any;
      const userId = (ctx as any).userId as string | null;
      const userRole = (ctx as any).userRole as string | null;

      const ownershipOk = await checkOwnership(opts.database, parentId, userId, userRole,);
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
    },);
}
