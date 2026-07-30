/**
 * Story Items Routes (World-level item definitions + world item instances)
 *
 * Wraps ItemsService for frontend access:
 *   GET    /api/worlds/:worldId/items            — list item definitions (paginated)
 *   POST   /api/worlds/:worldId/items            — create item definition
 *   GET    /api/worlds/:worldId/items/:id        — get definition
 *   PUT    /api/worlds/:worldId/items/:id        — update definition
 *   DELETE /api/worlds/:worldId/items/:id        — delete definition
 *   GET    /api/worlds/:worldId/items/:id/instances — list placed instances
 *   POST   /api/worlds/:worldId/item-instances   — place item in location / give to NPC
 *   POST   /api/worlds/:worldId/item-instances/:instanceId/transfer — move items
 *   DELETE /api/worlds/:worldId/item-instances/:instanceId — destroy instance
 */

import { Elysia, t, } from "elysia";
import type { Kysely, } from "kysely";
import { ItemCategory, ItemRarity, } from "../db/enums";
import type { DB, } from "../db/schema";
import { ItemsService, } from "../story/items";
import { safeJsonStringify, uid, } from "../utils";
import { notFound, } from "../validation/middleware";
import { ErrorResponse, Id, ListResponse, StoryItemInstanceBody, StoryItemResponse, SuccessResponse, } from "../validation/schemas";
import { HttpStatus, jsonCreated, jsonError, jsonNoContent, jsonPaginated, jsonResponse, } from "./http-utils";

/** Validate a value against an enum's values. Returns the value if valid, fallback otherwise. */
function enumOr<T extends string,>(value: unknown, validValues: readonly T[], fallback: T,): T {
  return typeof value === "string" && (validValues as readonly string[]).includes(value,)
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
    .selectFrom("worlds",)
    .select(["owner_id",],)
    .where("id", "=", worldId,)
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
  if (!(await checkWorldOwnership(database, worldId, userId, userRole,))) {
    return jsonError({ message: "Item not found", status: HttpStatus.NotFound, },);
  }

  const instances = await database
    .selectFrom("world_items",)
    .selectAll()
    .where("world_id", "=", worldId,)
    .where("item_id", "=", itemId,)
    .execute();
  return jsonResponse(instances,);
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
  if (!(await checkWorldOwnership(database, worldId, userId, userRole,))) {
    return jsonError({ message: "Item not found", status: HttpStatus.NotFound, },);
  }

  const items = new ItemsService(database,);

  if (method === "GET") {
    const def = await items.getDefinition(itemId,);
    if (!def) { return notFound("Item not found",); }
    return jsonResponse(def,);
  }

  const updates: Record<string, unknown> = {};
  if (body?.name != null) { updates.name = body.name; }
  if (body?.description != null) { updates.description = body.description; }
  if (body?.category != null) { updates.category = body.category; }
  if (body?.rarity != null) { updates.rarity = body.rarity; }
  if (body?.value != null) { updates.value = body.value; }
  if (body?.weight != null) { updates.weight = body.weight; }
  if (body?.properties != null) {
    const r = safeJsonStringify(body.properties,);
    if (r.ok) { updates.properties = r.value; }
  }
  updates.updated_at = new Date().toISOString();
  await database
    .updateTable("items",)
    .set(updates,)
    .where("id", "=", itemId,)
    .where("world_id", "=", worldId,)
    .execute();

  const updated = await items.getDefinition(itemId,);
  return jsonResponse(updated,);
}

async function handleDeleteDefinition(
  database: Kysely<DB>,
  worldId: string,
  itemId: string,
  userId: string | null,
  userRole: string | null,
) {
  if (!(await checkWorldOwnership(database, worldId, userId, userRole,))) {
    return jsonError({ message: "Item not found", status: HttpStatus.NotFound, },);
  }

  await database.deleteFrom("world_items",).where("item_id", "=", itemId,).execute();
  await database.deleteFrom("items",).where("id", "=", itemId,).where("world_id", "=", worldId,).execute();
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
  if (!(await checkWorldOwnership(database, worldId, userId, userRole,))) {
    return jsonError({ message: "World not found", status: HttpStatus.NotFound, },);
  }

  const items = new ItemsService(database,);
  if (method === "GET") {
    const allDefs = await items.listDefinitions(
      worldId,
      category ? enumOr(category, Object.values(ItemCategory,), "other",) : undefined,
    );
    const total = allDefs.length;
    const paged = allDefs.slice((page - 1) * pageSize, page * pageSize,);
    return jsonPaginated({ data: paged, total, page, pageSize, },);
  }

  if (!body?.name) { return jsonError({ message: "name is required", status: HttpStatus.BadRequest, },); }
  const id = await items.createDefinition({
    worldId,
    name: body.name as string,
    description: (body.description as string) ?? "",
    category: enumOr(body.category, Object.values(ItemCategory,), "other",),
    rarity: enumOr(body.rarity, Object.values(ItemRarity,), "common",),
    stackable: (body.stackable as boolean) ?? false,
    maxStack: (body.maxStack as number) ?? 1,
    properties: (body.properties as Record<string, unknown>) ?? {},
    value: (body.value as number) ?? 0,
    weight: (body.weight as number) ?? 0,
  },);
  return jsonCreated({ id, },);
}

async function handleTransfer(
  database: Kysely<DB>,
  worldId: string,
  instanceId: string,
  userId: string | null,
  userRole: string | null,
  body?: Record<string, unknown>,
) {
  if (!(await checkWorldOwnership(database, worldId, userId, userRole,))) {
    return jsonError({ message: "Item instance not found", status: HttpStatus.NotFound, },);
  }

  const items = new ItemsService(database,);
  const quantity = (body?.quantity as number) ?? 1;
  const result = await items.transfer(
    instanceId,
    quantity,
    (body?.toLocationId as string) ?? undefined,
    (body?.toActorId as string) ?? undefined,
  );
  return jsonResponse(result,);
}

async function handleInstance(
  database: Kysely<DB>,
  worldId: string,
  instanceId: string,
  userId: string | null,
  userRole: string | null,
) {
  if (!(await checkWorldOwnership(database, worldId, userId, userRole,))) {
    return jsonError({ message: "Item instance not found", status: HttpStatus.NotFound, },);
  }

  const items = new ItemsService(database,);
  await items.destroy(instanceId,);
  return jsonNoContent();
}

// ── Elysia plugin ───────────────────────────────────────────

export function storyItemsRoutes({ database, }: { database: Kysely<DB> },): Elysia {
  return new Elysia({ name: "story-items", },)
    .post("/api/worlds/:worldId/item-instances", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      const userRole = ctx.userRole as string | null;
      const { worldId, } = ctx.params;

      if (!(await checkWorldOwnership(database, worldId, userId, userRole,))) {
        return jsonError({ message: "World not found", status: HttpStatus.NotFound, },);
      }

      const { itemId, locationId, quantity = 1, } = ctx.body;

      const id = uid();
      await database
        .insertInto("world_items",)
        .values({
          id,
          world_id: worldId,
          item_id: itemId,
          location_id: locationId,
          quantity,
          visibility: "visible",
          respawnable: 0,
        },)
        .execute();

      return jsonCreated({ id, },);
    }, {
      params: t.Object({ worldId: Id, },),
      body: StoryItemInstanceBody,
      response: {
        201: t.Object({ id: t.String(), },),
        401: ErrorResponse,
        404: ErrorResponse,
      },
      detail: {
        summary: "Place item in world",
        description: "Place an item instance at a location in a world.",
        tags: ["Story Items",],
      },
    },)
    .get("/api/worlds/:worldId/item-instances", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      const userRole = ctx.userRole as string | null;
      const { worldId, } = ctx.params;

      if (!(await checkWorldOwnership(database, worldId, userId, userRole,))) {
        return jsonError({ message: "World not found", status: HttpStatus.NotFound, },);
      }

      const locationId = ctx.query?.locationId as string | undefined;
      let query = database.selectFrom("world_items",).selectAll().where("world_id", "=", worldId,);
      if (locationId) {
        query = query.where("location_id", "=", locationId,);
      }
      const instances = await query.execute();
      return jsonResponse(instances,);
    }, {
      params: t.Object({ worldId: Id, },),
      response: {
        200: ListResponse(StoryItemResponse,),
        401: ErrorResponse,
        404: ErrorResponse,
      },
      detail: {
        summary: "List item instances",
        description: "List all item instances in a world, optionally filtered by location.",
        tags: ["Story Items",],
      },
    },)
    .get("/api/worlds/:worldId/items/:itemId/instances", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      const userRole = ctx.userRole as string | null;
      const { worldId, itemId, } = ctx.params;
      return handleInstances(database, worldId, itemId, userId, userRole,);
    }, {
      params: t.Object({ worldId: Id, itemId: Id, },),
      response: {
        200: ListResponse(StoryItemResponse,),
        401: ErrorResponse,
        404: ErrorResponse,
      },
      detail: {
        summary: "List instances of item",
        description: "List all placed instances of a specific item definition in a world.",
        tags: ["Story Items",],
      },
    },)
    .get("/api/worlds/:worldId/items/:itemId", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      const userRole = ctx.userRole as string | null;
      const { worldId, itemId, } = ctx.params;
      return handleDefinition(database, "GET", worldId, itemId, userId, userRole,);
    }, {
      params: t.Object({ worldId: Id, itemId: Id, },),
      response: {
        200: StoryItemResponse,
        401: ErrorResponse,
        404: ErrorResponse,
      },
      detail: {
        summary: "Get item definition",
        description: "Get a single item definition by ID.",
        tags: ["Story Items",],
      },
    },)
    .put("/api/worlds/:worldId/items/:itemId", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      const userRole = ctx.userRole as string | null;
      const { worldId, itemId, } = ctx.params;
      return handleDefinition(database, "PUT", worldId, itemId, userId, userRole, ctx.body as Record<string, unknown>,);
    }, {
      params: t.Object({ worldId: Id, itemId: Id, },),
      response: {
        200: StoryItemResponse,
        401: ErrorResponse,
        404: ErrorResponse,
      },
      detail: {
        summary: "Update item definition",
        description: "Update an item definition's properties (name, description, category, rarity, etc).",
        tags: ["Story Items",],
      },
    },)
    .delete("/api/worlds/:worldId/items/:itemId", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      const userRole = ctx.userRole as string | null;
      const { worldId, itemId, } = ctx.params;
      return handleDeleteDefinition(database, worldId, itemId, userId, userRole,);
    }, {
      params: t.Object({ worldId: Id, itemId: Id, },),
      response: {
        200: SuccessResponse,
        401: ErrorResponse,
        404: ErrorResponse,
      },
      detail: {
        summary: "Delete item definition",
        description: "Delete an item definition and all its instances.",
        tags: ["Story Items",],
      },
    },)
    .get("/api/worlds/:worldId/items", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      const userRole = ctx.userRole as string | null;
      const { worldId, } = ctx.params;
      const category = ctx.query?.category as string | undefined;
      return handleDefinitions(
        database,
        "GET",
        worldId,
        userId,
        userRole,
        Number(ctx.query?.page,) || 1,
        Number(ctx.query?.pageSize,) || 20,
        category,
      );
    }, {
      params: t.Object({ worldId: Id, },),
      response: {
        200: ListResponse(StoryItemResponse,),
        401: ErrorResponse,
        404: ErrorResponse,
      },
      detail: {
        summary: "List item definitions",
        description: "List all item definitions in a world, optionally filtered by category. Paginated.",
        tags: ["Story Items",],
      },
    },)
    .post("/api/worlds/:worldId/items", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      const userRole = ctx.userRole as string | null;
      const { worldId, } = ctx.params;
      return handleDefinitions(
        database,
        "POST",
        worldId,
        userId,
        userRole,
        1,
        20,
        undefined,
        ctx.body as Record<string, unknown>,
      );
    }, {
      params: t.Object({ worldId: Id, },),
      response: {
        200: StoryItemResponse,
        401: ErrorResponse,
        404: ErrorResponse,
      },
      detail: {
        summary: "Create item definition",
        description: "Create a new item definition in a world. Requires a name.",
        tags: ["Story Items",],
      },
    },)
    .post("/api/worlds/:worldId/item-instances/:instanceId/transfer", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      const userRole = ctx.userRole as string | null;
      const { worldId, instanceId, } = ctx.params;
      return handleTransfer(
        database,
        worldId,
        instanceId,
        userId,
        userRole,
        ctx.body as Record<string, unknown>,
      );
    }, {
      params: t.Object({ worldId: Id, instanceId: Id, },),
      response: {
        200: StoryItemResponse,
        401: ErrorResponse,
        404: ErrorResponse,
      },
      detail: {
        summary: "Transfer item instance",
        description: "Transfer an item instance between locations or actors.",
        tags: ["Story Items",],
      },
    },)
    .delete("/api/worlds/:worldId/item-instances/:instanceId", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      const userRole = ctx.userRole as string | null;
      const { worldId, instanceId, } = ctx.params;
      return handleInstance(database, worldId, instanceId, userId, userRole,);
    }, {
      params: t.Object({ worldId: Id, instanceId: Id, },),
      response: {
        200: SuccessResponse,
        401: ErrorResponse,
        404: ErrorResponse,
      },
      detail: {
        summary: "Destroy item instance",
        description: "Destroy an item instance from the world.",
        tags: ["Story Items",],
      },
    },) as unknown as Elysia;
}
