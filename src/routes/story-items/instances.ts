import { Elysia, t, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { uid, } from "../../utils";
import {
  ErrorResponse,
  Id,
  ListResponse,
  StoryItemInstanceBody,
  StoryItemResponse,
  SuccessResponse,
} from "../../validation/schemas";
import { HttpStatus, jsonCreated, jsonError, jsonResponse, } from "../http-utils";
import { checkWorldOwnership, handleInstance, handleInstances, handleTransfer, } from "./handlers";

export function storyItemInstanceRoutes({ database, }: { database: Kysely<DB> }, prefix = "/api",) {
  return new Elysia({ name: "story-items-instances", },)
    .post(`${prefix}/worlds/:worldId/item-instances`, async (ctx: any,) => {
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
    .get(`${prefix}/worlds/:worldId/item-instances`, async (ctx: any,) => {
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
    .get(`${prefix}/worlds/:worldId/items/:itemId/instances`, async (ctx: any,) => {
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
    .post(`${prefix}/worlds/:worldId/item-instances/:instanceId/transfer`, async (ctx: any,) => {
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
    .delete(`${prefix}/worlds/:worldId/item-instances/:instanceId`, async (ctx: any,) => {
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
    },);
}
