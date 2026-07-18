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

import { Elysia } from "elysia";
import type { Kysely } from "kysely";
import type { DB } from "../db/schema";
import { uid, safeJsonStringify } from "../utils";
import { jsonResponse, jsonError, jsonPaginated, jsonCreated, jsonNoContent, HttpStatus } from "./http-utils";
import { ItemsService } from "../story/items";
import { notFound } from "../validation/middleware";
import { ItemCategory, ItemRarity } from "../db/enums";

/** Validate a value against an enum's values. Returns the value if valid, fallback otherwise. */
function enumOr<T extends string>(value: unknown, validValues: readonly T[], fallback: T): T {
  return typeof value === "string" && (validValues as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

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
  return !(!worldCheck || (worldCheck.owner_id !== userId && userRole !== "admin"));
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
    if (!def) return notFound("Item not found");
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
    const allDefs = await items.listDefinitions(
      worldId,
      enumOr(category, Object.values(ItemCategory), "other") as ItemCategory,
    );
    const total = allDefs.length;
    const paged = allDefs.slice((page - 1) * pageSize, page * pageSize);
    return jsonPaginated({ data: paged, total, page, pageSize });
  }

  if (!body?.name) return jsonError({ message: "name is required", status: HttpStatus.BadRequest });
  const id = await items.createDefinition({
    worldId,
    name: body.name as string,
    description: (body.description as string) ?? "",
    category: enumOr(body.category, Object.values(ItemCategory), "other"),
    rarity: enumOr(body.rarity, Object.values(ItemRarity), "common"),
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
    .post("/api/worlds/:id/item-instances", async (ctx: any) => {
      const userId = ctx.userId as string | null;
      const userRole = ctx.userRole as string | null;
      const worldId = ctx.params.id as string;

      if (!(await checkWorldOwnership(database, worldId, userId, userRole))) {
        return jsonError({ message: "World not found", status: HttpStatus.NotFound });
      }

      const body = ctx.body as Record<string, unknown>;
      const itemId = body.itemId as string;
      const locationId = body.locationId as string;
      const quantity = (body.quantity as number) ?? 1;

      if (!itemId) return jsonError({ message: "itemId is required", status: HttpStatus.BadRequest });
      if (!locationId) return jsonError({ message: "locationId is required", status: HttpStatus.BadRequest });

      const id = uid();
      await database
        .insertInto("world_items")
        .values({
          id,
          world_id: worldId,
          item_id: itemId,
          location_id: locationId,
          quantity,
          visibility: "visible",
          respawnable: 0,
        })
        .execute();

      return jsonCreated({ id });
    })
    .get("/api/worlds/:id/item-instances", async (ctx: any) => {
      const userId = ctx.userId as string | null;
      const userRole = ctx.userRole as string | null;
      const worldId = ctx.params.id as string;

      if (!(await checkWorldOwnership(database, worldId, userId, userRole))) {
        return jsonError({ message: "World not found", status: HttpStatus.NotFound });
      }

      const locationId = ctx.query?.locationId as string | undefined;
      let query = database.selectFrom("world_items").selectAll().where("world_id", "=", worldId);
      if (locationId) {
        query = query.where("location_id", "=", locationId);
      }
      const instances = await query.execute();
      return jsonResponse(instances);
    })
    .get("/api/worlds/:id/items/:itemId/instances", async (ctx: any) => {
      const userId = ctx.userId as string | null;
      const userRole = ctx.userRole as string | null;
      return handleInstances(
        database,
        ctx.params.id as string,
        ctx.params.itemId as string,
        userId,
        userRole,
      );
    })
    .get("/api/worlds/:id/items/:itemId", async (ctx: any) => {
      const userId = ctx.userId as string | null;
      const userRole = ctx.userRole as string | null;
      return handleDefinition(
        database,
        "GET",
        ctx.params.id as string,
        ctx.params.itemId as string,
        userId,
        userRole,
      );
    })
    .put("/api/worlds/:id/items/:itemId", async (ctx: any) => {
      const userId = ctx.userId as string | null;
      const userRole = ctx.userRole as string | null;
      return handleDefinition(
        database,
        "PUT",
        ctx.params.id as string,
        ctx.params.itemId as string,
        userId,
        userRole,
        ctx.body as Record<string, unknown>,
      );
    })
    .delete("/api/worlds/:id/items/:itemId", async (ctx: any) => {
      const userId = ctx.userId as string | null;
      const userRole = ctx.userRole as string | null;
      return handleDeleteDefinition(
        database,
        ctx.params.id as string,
        ctx.params.itemId as string,
        userId,
        userRole,
      );
    })
    .get("/api/worlds/:id/items", async (ctx: any) => {
      const userId = ctx.userId as string | null;
      const userRole = ctx.userRole as string | null;
      const category = ctx.query?.category as string | undefined;
      return handleDefinitions(
        database,
        "GET",
        ctx.params.id as string,
        userId,
        userRole,
        Number(ctx.query?.page) || 1,
        Number(ctx.query?.pageSize) || 20,
        category,
      );
    })
    .post("/api/worlds/:id/items", async (ctx: any) => {
      const userId = ctx.userId as string | null;
      const userRole = ctx.userRole as string | null;
      return handleDefinitions(
        database,
        "POST",
        ctx.params.id as string,
        userId,
        userRole,
        1,
        20,
        undefined,
        ctx.body as Record<string, unknown>,
      );
    })
    .post("/api/worlds/:id/item-instances/:instanceId/transfer", async (ctx: any) => {
      const userId = ctx.userId as string | null;
      const userRole = ctx.userRole as string | null;
      return handleTransfer(
        database,
        ctx.params.id as string,
        ctx.params.instanceId as string,
        userId,
        userRole,
        ctx.body as Record<string, unknown>,
      );
    })
    .delete("/api/worlds/:id/item-instances/:instanceId", async (ctx: any) => {
      const userId = ctx.userId as string | null;
      const userRole = ctx.userRole as string | null;
      return handleInstance(
        database,
        ctx.params.id as string,
        ctx.params.instanceId as string,
        userId,
        userRole,
      );
    }) as unknown as Elysia;
}
