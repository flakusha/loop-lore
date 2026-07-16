/**
 * Story Items Routes (World-level item definitions + world item instances)
 *
 * Wraps ItemsService for frontend access:
 *   GET    /api/worlds/:id/items            — list item definitions (paginated)
 *   POST   /api/worlds/:id/items            — create item definition
 *   GET    /api/worlds/:id/items/:id        — get definition
 *   PUT    /api/worlds/:id/items/:id        — update definition
 *   DELETE /api/worlds/:id/items/:id        — delete definition
 *   GET    /api/worlds/:id/items/:id/instances — list placed instances
 *   POST   /api/worlds/:id/item-instances   — place item in location / give to NPC
 *   POST   /api/worlds/:id/item-instances/:instanceId/transfer — move items
 *   DELETE /api/worlds/:id/item-instances/:instanceId — destroy instance
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { Elysia } from "elysia";
import type { Kysely } from "kysely";
import type { DB } from "../db/schema";
import { safeJsonStringify } from "../utils";
import {
  jsonResponse,
  jsonError,
  jsonPaginated,
  jsonCreated,
  jsonNoContent,
  HttpStatus,
  ErrorCode,
} from "./http-utils";
import { ItemsService } from "../story/items";

// ── Handlers ────────────────────────────────────────────────

async function checkWorldOwnership(
  database: Kysely<DB>,
  worldId: string,
  userId: string | null,
  userRole: string | null,
) {
  const worldCheck = await database
    .selectFrom("worlds")
    .select(["owner_id"])
    .where("id", "=", worldId)
    .executeTakeFirst();
  if (!worldCheck || (worldCheck.owner_id !== userId && userRole !== "admin")) {
    return false;
  }
  return true;
}

async function handleInstances(
  database: Kysely<DB>,
  worldId: string,
  itemId: string,
  userId: string | null,
  userRole: string | null,
) {
  if (!(await checkWorldOwnership(database, worldId, userId, userRole))) {
    return jsonError({ message: "Item not found", status: HttpStatus.NotFound });
  }

  const instances = await database
    .selectFrom("world_items")
    .selectAll()
    .where("world_id", "=", worldId)
    .where("item_id", "=", itemId)
    .execute();
  return jsonResponse(instances);
}

async function handleDefinition(
  database: Kysely<DB>,
  method: string,
  worldId: string,
  itemId: string,
  userId: string | null,
  userRole: string | null,
  body?: Record<string, unknown>,
) {
  if (!(await checkWorldOwnership(database, worldId, userId, userRole))) {
    return jsonError({ message: "Item not found", status: HttpStatus.NotFound });
  }

  const items = new ItemsService(database);

  if (method === "GET") {
    const def = await items.getDefinition(itemId);
    if (!def)
      return jsonError({ message: "Item not found", status: HttpStatus.NotFound, code: ErrorCode.NotFound });
    return jsonResponse(def);
  }

  const updates: Record<string, unknown> = {};
  if (body?.name != null) updates.name = body.name;
  if (body?.description != null) updates.description = body.description;
  if (body?.category != null) updates.category = body.category;
  if (body?.rarity != null) updates.rarity = body.rarity;
  if (body?.value != null) updates.value = body.value;
  if (body?.weight != null) updates.weight = body.weight;
  if (body?.properties != null) {
    const r = safeJsonStringify(body.properties);
    if (r.ok) updates.properties = r.value;
  }
  updates.updated_at = new Date().toISOString();
  await database
    .updateTable("items")
    .set(updates)
    .where("id", "=", itemId)
    .where("world_id", "=", worldId)
    .execute();

  const updated = await items.getDefinition(itemId);
  return jsonResponse(updated);
}

async function handleDeleteDefinition(
  database: Kysely<DB>,
  worldId: string,
  itemId: string,
  userId: string | null,
  userRole: string | null,
) {
  if (!(await checkWorldOwnership(database, worldId, userId, userRole))) {
    return jsonError({ message: "Item not found", status: HttpStatus.NotFound });
  }

  await database.deleteFrom("world_items").where("item_id", "=", itemId).execute();
  await database.deleteFrom("items").where("id", "=", itemId).where("world_id", "=", worldId).execute();
  return jsonNoContent();
}

async function handleDefinitions(
  database: Kysely<DB>,
  method: string,
  worldId: string,
  userId: string | null,
  userRole: string | null,
  page: number,
  pageSize: number,
  category?: string,
  body?: Record<string, unknown>,
) {
  if (!(await checkWorldOwnership(database, worldId, userId, userRole))) {
    return jsonError({ message: "World not found", status: HttpStatus.NotFound });
  }

  const items = new ItemsService(database);
  if (method === "GET") {
    const allDefs = await items.listDefinitions(worldId, category as never);
    const total = allDefs.length;
    const paged = allDefs.slice((page - 1) * pageSize, page * pageSize);
    return jsonPaginated({ data: paged, total, page, pageSize });
  }

  if (!body?.name) return jsonError({ message: "name is required", status: HttpStatus.BadRequest });
  const id = await items.createDefinition({
    worldId,
    name: body.name as string,
    description: (body.description as string) ?? "",
    category: (body.category as never) ?? "misc",
    rarity: (body.rarity as never) ?? "common",
    stackable: (body.stackable as boolean) ?? false,
    maxStack: (body.maxStack as number) ?? 1,
    properties: (body.properties as Record<string, unknown>) ?? {},
    value: (body.value as number) ?? 0,
    weight: (body.weight as number) ?? 0,
  });
  return jsonCreated({ id });
}

async function handleTransfer(
  database: Kysely<DB>,
  worldId: string,
  instanceId: string,
  userId: string | null,
  userRole: string | null,
  body?: Record<string, unknown>,
) {
  if (!(await checkWorldOwnership(database, worldId, userId, userRole))) {
    return jsonError({ message: "Item instance not found", status: HttpStatus.NotFound });
  }

  const items = new ItemsService(database);
  const quantity = (body?.quantity as number) ?? 1;
  const result = await items.transfer(
    instanceId,
    quantity,
    (body?.toLocationId as string) ?? undefined,
    (body?.toActorId as string) ?? undefined,
  );
  return jsonResponse(result);
}

async function handleInstance(
  database: Kysely<DB>,
  worldId: string,
  instanceId: string,
  userId: string | null,
  userRole: string | null,
) {
  if (!(await checkWorldOwnership(database, worldId, userId, userRole))) {
    return jsonError({ message: "Item instance not found", status: HttpStatus.NotFound });
  }

  const items = new ItemsService(database);
  await items.destroy(instanceId);
  return jsonNoContent();
}

// ── Elysia plugin ───────────────────────────────────────────

export function storyItemsRoutes({ database }: { database: Kysely<DB> }): Elysia {
  return new Elysia({ name: "story-items" })
    .get("/api/worlds/:id/items/:itemId/instances", async ({ params, query }) => {
      const userId = (query as any).userId as string | null;
      const userRole = (query as any).userRole as string | null;
      return handleInstances(database, params.id as string, params.itemId as string, userId, userRole);
    })
    .get("/api/worlds/:id/items/:itemId", async ({ params, query }) => {
      const userId = (query as any).userId as string | null;
      const userRole = (query as any).userRole as string | null;
      return handleDefinition(
        database,
        "GET",
        params.id as string,
        params.itemId as string,
        userId,
        userRole,
      );
    })
    .put("/api/worlds/:id/items/:itemId", async ({ params, body, query }) => {
      const userId = (query as any).userId as string | null;
      const userRole = (query as any).userRole as string | null;
      return handleDefinition(
        database,
        "PUT",
        params.id as string,
        params.itemId as string,
        userId,
        userRole,
        body as Record<string, unknown>,
      );
    })
    .delete("/api/worlds/:id/items/:itemId", async ({ params, query }) => {
      const userId = (query as any).userId as string | null;
      const userRole = (query as any).userRole as string | null;
      return handleDeleteDefinition(
        database,
        params.id as string,
        params.itemId as string,
        userId,
        userRole,
      );
    })
    .get("/api/worlds/:id/items", async ({ params, query }) => {
      const userId = (query as any).userId as string | null;
      const userRole = (query as any).userRole as string | null;
      const category = (query as any).category as string | undefined;
      return handleDefinitions(
        database,
        "GET",
        params.id as string,
        userId,
        userRole,
        Number(query.page) || 1,
        Number(query.pageSize) || 20,
        category,
      );
    })
    .post("/api/worlds/:id/items", async ({ params, body, query }) => {
      const userId = (query as any).userId as string | null;
      const userRole = (query as any).userRole as string | null;
      return handleDefinitions(
        database,
        "POST",
        params.id as string,
        userId,
        userRole,
        1,
        20,
        undefined,
        body as Record<string, unknown>,
      );
    })
    .post("/api/worlds/:id/item-instances/:instanceId/transfer", async ({ params, body, query }) => {
      const userId = (query as any).userId as string | null;
      const userRole = (query as any).userRole as string | null;
      return handleTransfer(
        database,
        params.id as string,
        params.instanceId as string,
        userId,
        userRole,
        body as Record<string, unknown>,
      );
    })
    .delete("/api/worlds/:id/item-instances/:instanceId", async ({ params, query }) => {
      const userId = (query as any).userId as string | null;
      const userRole = (query as any).userRole as string | null;
      return handleInstance(database, params.id as string, params.instanceId as string, userId, userRole);
    });
}
