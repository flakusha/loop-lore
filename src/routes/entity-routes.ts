/**
 * Entity Routes Factory
 *
 * Generic CRUD route generator for child-entity patterns:
 *   GET    /api/:parentPrefix/:parentId/:entityPath       — list (paginated)
 *   POST   /api/:parentPrefix/:parentId/:entityPath       — create
 *   GET    /api/:parentPrefix/:parentId/:entityPath/:id   — get
 *   PUT    /api/:parentPrefix/:parentId/:entityPath/:id   — update
 *   DELETE /api/:parentPrefix/:parentId/:entityPath/:id   — delete
 */
/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any */

import type { Db } from "../db";
import type { RouteDispatch, RouteDispatchParams } from "./router";
import { registerRoute } from "./router";
import { uid, jsonStringifyOr } from "../utils";
import {
  BAD_METHOD,
  jsonResponse,
  jsonError,
  jsonPaginated,
  jsonCreated,
  jsonNoContent,
  HttpStatus,
  ErrorCode,
  parseBody,
  parsePagination,
} from "./http-utils";

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
    entityId: string | null;
    userId: string | null;
    userRole: string | null;
  }) => Promise<boolean>;
}

function extractIds({
  pathname,
  parentPrefix,
  entityPath,
}: {
  pathname: string;
  parentPrefix: string;
  entityPath: string;
}): { parentId: string | null; entityId: string | null } {
  const parentMatch = new RegExp(
    String.raw`^\/api\/${parentPrefix}\/([a-f0-9-]+)\/${entityPath}(?:\/([a-f0-9-]+))?$`,
  ).exec(pathname);
  return { parentId: parentMatch?.[1] ?? null, entityId: parentMatch?.[2] ?? null };
}

async function defaultOwnershipCheck({
  database,
  parentId,
  userId,
  userRole,
  config,
}: {
  database: Db;
  parentId: string;
  _entityId: string | null;
  userId: string | null;
  userRole: string | null;
  config: EntityConfig;
}): Promise<boolean> {
  const db = database as any;
  const owner = await db
    .selectFrom(config.ownershipTable)
    .select(config.ownershipFkColumn)
    .where("id", "=", parentId)
    .executeTakeFirst();
  return !!owner && (owner[config.ownershipFkColumn] === userId || userRole === "admin");
}

function buildCreateValues({
  config,
  parentId,
  body,
}: {
  config: EntityConfig;
  parentId: string;
  body: Record<string, unknown>;
}): Record<string, unknown> {
  const values: Record<string, unknown> = {
    id: uid(),
    [config.parentFk]: parentId,
  };
  for (const [camel, col] of Object.entries(config.fieldMappings)) {
    const val = body[camel] ?? config.defaults[camel];
    if (val != null) {
      values[col] = config.jsonFields.includes(camel) ? jsonStringifyOr(val) : val;
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
}): Record<string, unknown> {
  const updates: Record<string, unknown> = {};
  for (const [camel, col] of Object.entries(config.fieldMappings)) {
    if (body[camel] != null) {
      updates[col] = config.jsonFields.includes(camel) ? jsonStringifyOr(body[camel]) : body[camel];
    }
  }
  updates.updated_at = new Date().toISOString();
  return updates;
}

export function createEntityRoutes(config: EntityConfig): { dispatch: RouteDispatch } {
  const dispatch: RouteDispatch = async ({ request, context, database }: RouteDispatchParams) => {
    const url = new URL(request.url);
    const { pathname, searchParams } = url;
    const method = request.method;

    const { parentId, entityId } = extractIds({
      pathname,
      parentPrefix: config.parentPrefix,
      entityPath: config.entityPath,
    });
    if (!parentId) return null;

    const ownershipOk = config.checkOwnership
      ? await config.checkOwnership({
          database,
          parentId: parentId,
          entityId: entityId ?? null,
          userId: context.userId,
          userRole: context.userRole,
        })
      : await defaultOwnershipCheck({
          database,
          parentId,
          _entityId: entityId ?? null,
          userId: context.userId,
          userRole: context.userRole,
          config,
        });
    if (!ownershipOk)
      return jsonError({ message: `${config.entityName} not found`, status: HttpStatus.NotFound });

    if (entityId) {
      if (method === "GET") return handleGet({ database, parentId, entityId, config });
      if (method === "PUT") {
        const body = await parseBody(request);
        if (body instanceof Response) return body;
        return handleUpdate({ database, parentId, entityId, body, config });
      }
      if (method === "DELETE") return handleDelete({ database, parentId, entityId, config });
      return BAD_METHOD();
    }

    if (method === "GET") {
      const { page, pageSize } = parsePagination(searchParams);
      const filterValue = config.filterField
        ? (searchParams.get(config.filterField.param) ?? undefined)
        : undefined;
      return handleList({ database, parentId, page, pageSize, config, filterValue });
    }
    if (method === "POST") {
      const body = await parseBody(request);
      if (body instanceof Response) return body;
      return handleCreate({ database, parentId, config, body });
    }

    return BAD_METHOD();
  };

  registerRoute(dispatch);
  return { dispatch };
}

async function handleList({
  database,
  parentId,
  page,
  pageSize,
  config,
  filterValue,
}: {
  database: Db;
  parentId: string;
  page: number;
  pageSize: number;
  config: EntityConfig;
  filterValue?: string;
}): Promise<Response> {
  const offset = (page - 1) * pageSize;
  const db = database as any;

  const countQuery = db
    .selectFrom(config.tableName)
    .select(db.fn.countAll().as("total"))
    .where(config.parentFk, "=", parentId);
  const listQuery = db.selectFrom(config.tableName).selectAll().where(config.parentFk, "=", parentId);

  if (config.filterField && filterValue) {
    const fc = config.filterField.column;
    countQuery.where(fc, "=", filterValue);
    listQuery.where(fc, "=", filterValue);
  }

  const countResult: any = await countQuery.executeTakeFirst();
  const total = (countResult?.total as number | undefined) ?? 0;

  let query = listQuery;
  for (const ob of config.orderBy) {
    query = query.orderBy(ob.column, ob.dir);
  }
  const entities: any[] = await query.limit(pageSize).offset(offset).execute();

  return jsonPaginated({ data: entities, total, page, pageSize });
}

async function handleCreate({
  database,
  parentId,
  config,
  body,
}: {
  database: Db;
  parentId: string;
  config: EntityConfig;
  body: Record<string, unknown>;
}): Promise<Response> {
  for (const required of config.createRequired) {
    if (body[required] == null || body[required] === "") {
      return jsonError({ message: `${required} is required`, status: HttpStatus.BadRequest });
    }
  }

  const values = buildCreateValues({ config, parentId, body });
  const db = database as any;

  await db.insertInto(config.tableName).values(values).execute();

  const created = await db
    .selectFrom(config.tableName)
    .selectAll()
    .where("id", "=", values.id)
    .executeTakeFirst();

  return jsonCreated(created);
}

async function handleGet({
  database,
  parentId,
  entityId,
  config,
}: {
  database: Db;
  parentId: string;
  entityId: string;
  config: EntityConfig;
}): Promise<Response> {
  const db = database as any;
  const entity = await db
    .selectFrom(config.tableName)
    .selectAll()
    .where("id", "=", entityId)
    .where(config.parentFk, "=", parentId)
    .executeTakeFirst();

  if (!entity)
    return jsonError({
      message: `${config.entityName} not found`,
      status: HttpStatus.NotFound,
      code: ErrorCode.NotFound,
    });
  return jsonResponse(entity);
}

async function handleUpdate({
  database,
  parentId,
  entityId,
  body,
  config,
}: {
  database: Db;
  parentId: string;
  entityId: string;
  body: Record<string, unknown>;
  config: EntityConfig;
}): Promise<Response> {
  const db = database as any;
  const existing = await db
    .selectFrom(config.tableName)
    .select("id")
    .where("id", "=", entityId)
    .where(config.parentFk, "=", parentId)
    .executeTakeFirst();

  if (!existing)
    return jsonError({
      message: `${config.entityName} not found`,
      status: HttpStatus.NotFound,
      code: ErrorCode.NotFound,
    });

  const updates = buildUpdateValues({ config, body });
  if (Object.keys(updates).length <= 1) return jsonResponse(existing);

  await db.updateTable(config.tableName).set(updates).where("id", "=", entityId).execute();

  const updated = await db
    .selectFrom(config.tableName)
    .selectAll()
    .where("id", "=", entityId)
    .executeTakeFirst();

  return jsonResponse(updated);
}

async function handleDelete({
  database,
  parentId,
  entityId,
  config,
}: {
  database: Db;
  parentId: string;
  entityId: string;
  config: EntityConfig;
}): Promise<Response> {
  const db = database as any;
  const result = await db
    .deleteFrom(config.tableName)
    .where("id", "=", entityId)
    .where(config.parentFk, "=", parentId)
    .execute();

  if (result.length === 0) {
    return jsonError({
      message: `${config.entityName} not found`,
      status: HttpStatus.NotFound,
      code: ErrorCode.NotFound,
    });
  }
  return jsonNoContent();
}
