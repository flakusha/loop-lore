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

import type { Kysely } from "kysely";
import type { DB } from "../db/schema";
import type { RequestContext } from "../middleware/types";
import type { RouteDispatch } from "./router";
import { registerRoute } from "./router";
import { uid, safeJsonStringify } from "../utils";
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
import { ItemsService } from "../story/items";

// ── Dispatch ──────────────────────────────────────────────────

const dispatch: RouteDispatch = async ({ request, context, database }) => {
  const url = new URL(request.url);
  const { pathname, searchParams } = url;
  const method = request.method;
  const items = new ItemsService(database);

  // /api/worlds/:worldId/items/:itemId/instances
  const defInstMatch = /^\/api\/worlds\/([a-f0-9-]+)\/items\/([a-f0-9-]+)\/instances$/.exec(pathname);
  if (defInstMatch) {
    const [, worldId, itemId] = defInstMatch;
    // Verify world ownership
    const worldCheck = await database
      .selectFrom("worlds")
      .select(["owner_id"])
      .where("id", "=", worldId)
      .executeTakeFirst();
    if (!worldCheck || (worldCheck.owner_id !== context.userId && context.userRole !== "admin")) {
      return jsonError("Item not found", HttpStatus.NotFound);
    }
    if (method === "GET") {
      // list world_item instances for this definition
      const instances = await database
        .selectFrom("world_items")
        .selectAll()
        .where("world_id", "=", worldId)
        .where("item_id", "=", itemId)
        .execute();
      return jsonResponse(instances);
    }
    return BAD_METHOD();
  }

  // /api/worlds/:worldId/items/:itemId
  const defMatch = /^\/api\/worlds\/([a-f0-9-]+)\/items\/([a-f0-9-]+)$/.exec(pathname);
  if (defMatch) {
    const [, worldId, itemId] = defMatch;
    // Verify world ownership
    const worldCheck = await database
      .selectFrom("worlds")
      .select(["owner_id"])
      .where("id", "=", worldId)
      .executeTakeFirst();
    if (!worldCheck || (worldCheck.owner_id !== context.userId && context.userRole !== "admin")) {
      return jsonError("Item not found", HttpStatus.NotFound);
    }
    if (method === "GET") {
      const def = await items.getDefinition(itemId);
      if (!def) return jsonError("Item not found", HttpStatus.NotFound, ErrorCode.NotFound);
      return jsonResponse(def);
    }
    if (method === "PUT") {
      const body = await parseBody(request);
      if (body instanceof Response) return body;
      const updates: Record<string, unknown> = {};
      if (body.name != null) updates.name = body.name;
      if (body.description != null) updates.description = body.description;
      if (body.category != null) updates.category = body.category;
      if (body.rarity != null) updates.rarity = body.rarity;
      if (body.value != null) updates.value = body.value;
      if (body.weight != null) updates.weight = body.weight;
      if (body.properties != null) {
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
    if (method === "DELETE") {
      await database.deleteFrom("world_items").where("item_id", "=", itemId).execute();
      await database.deleteFrom("items").where("id", "=", itemId).where("world_id", "=", worldId).execute();
      return jsonNoContent();
    }
    return BAD_METHOD();
  }

  // /api/worlds/:worldId/items (collection)
  const collMatch = /^\/api\/worlds\/([a-f0-9-]+)\/items$/.exec(pathname);
  if (collMatch) {
    const [, worldId] = collMatch;
    // Verify world ownership
    const worldCheck = await database
      .selectFrom("worlds")
      .select(["owner_id"])
      .where("id", "=", worldId)
      .executeTakeFirst();
    if (!worldCheck || (worldCheck.owner_id !== context.userId && context.userRole !== "admin")) {
      return jsonError("World not found", HttpStatus.NotFound);
    }
    if (method === "GET") {
      const { page, pageSize } = parsePagination(searchParams);
      const category = searchParams.get("category") ?? undefined;
      const allDefs = await items.listDefinitions(worldId, category as never);
      const total = allDefs.length;
      const paged = allDefs.slice((page - 1) * pageSize, page * pageSize);
      return jsonPaginated(paged, total, page, pageSize);
    }
    if (method === "POST") {
      const body = await parseBody(request);
      if (body instanceof Response) return body;
      if (!body.name) return jsonError("name is required", HttpStatus.BadRequest);
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
    return BAD_METHOD();
  }

  // /api/worlds/:worldId/item-instances/:instanceId/transfer
  const transferMatch = /^\/api\/worlds\/([a-f0-9-]+)\/item-instances\/([a-f0-9-]+)\/transfer$/.exec(
    pathname,
  );
  if (transferMatch) {
    const [, worldId, instanceId] = transferMatch;
    // Verify world ownership
    const worldCheck = await database
      .selectFrom("worlds")
      .select(["owner_id"])
      .where("id", "=", worldId)
      .executeTakeFirst();
    if (!worldCheck || (worldCheck.owner_id !== context.userId && context.userRole !== "admin")) {
      return jsonError("Item instance not found", HttpStatus.NotFound);
    }
    if (method === "POST") {
      const body = await parseBody(request);
      if (body instanceof Response) return body;
      const quantity = (body.quantity as number) ?? 1;
      const result = await items.transfer(
        instanceId,
        quantity,
        (body.toLocationId as string) ?? undefined,
        (body.toActorId as string) ?? undefined,
      );
      return jsonResponse(result);
    }
    return BAD_METHOD();
  }

  // /api/worlds/:worldId/item-instances/:instanceId
  const instMatch = /^\/api\/worlds\/([a-f0-9-]+)\/item-instances\/([a-f0-9-]+)$/.exec(pathname);
  if (instMatch) {
    const [, worldId, instanceId] = instMatch;
    // Verify world ownership
    const worldCheck = await database
      .selectFrom("worlds")
      .select(["owner_id"])
      .where("id", "=", worldId)
      .executeTakeFirst();
    if (!worldCheck || (worldCheck.owner_id !== context.userId && context.userRole !== "admin")) {
      return jsonError("Item instance not found", HttpStatus.NotFound);
    }
    if (method === "DELETE") {
      await items.destroy(instanceId);
      return jsonNoContent();
    }
    return BAD_METHOD();
  }

  // /api/worlds/:worldId/item-instances (create placement)
  const instCollMatch = /^\/api\/worlds\/([a-f0-9-]+)\/item-instances$/.exec(pathname);
  if (instCollMatch) {
    const [, worldId] = instCollMatch;
    // Verify world ownership
    const worldCheck = await database
      .selectFrom("worlds")
      .select(["owner_id"])
      .where("id", "=", worldId)
      .executeTakeFirst();
    if (!worldCheck || (worldCheck.owner_id !== context.userId && context.userRole !== "admin")) {
      return jsonError("World not found", HttpStatus.NotFound);
    }
    if (method === "POST") {
      const body = await parseBody(request);
      if (body instanceof Response) return body;
      if (!body.itemId) return jsonError("itemId is required", HttpStatus.BadRequest);

      if (body.actorId) {
        const id = await items.giveToNpc(
          body.itemId as string,
          body.actorId as string,
          worldId,
          (body.quantity as number) ?? 1,
        );
        return jsonCreated({ id });
      }
      if (body.locationId) {
        const id = await items.placeInLocation(
          body.itemId as string,
          body.locationId as string,
          worldId,
          (body.quantity as number) ?? 1,
        );
        return jsonCreated({ id });
      }
      return jsonError("locationId or actorId is required", HttpStatus.BadRequest);
    }
    if (method === "GET") {
      const locationId = searchParams.get("locationId");
      const actorId = searchParams.get("actorId");
      if (locationId) {
        const instances = await items.getAtLocation(locationId);
        return jsonResponse(instances);
      }
      if (actorId) {
        const instances = await items.getNpcInventory(actorId);
        return jsonResponse(instances);
      }
      return jsonError("locationId or actorId query parameter required", HttpStatus.BadRequest);
    }
    return BAD_METHOD();
  }

  return null;
};

registerRoute(dispatch);
