// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, t, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import {
  ErrorResponse,
  Id,
  ListResponse,
  StoryItemResponse,
  SuccessResponse,
} from "../../validation/schemas";
import { handleDefinition, handleDefinitions, handleDeleteDefinition, } from "./handlers";

export function storyItemDefinitionsRoutes({ database, }: { database: Kysely<DB> }, prefix = "/api",) {
  return new Elysia({ name: "story-items-definitions", },)
    .get(`${prefix}/worlds/:worldId/items/:itemId`, async (ctx: any,) => {
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
    .put(`${prefix}/worlds/:worldId/items/:itemId`, async (ctx: any,) => {
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
    .delete(`${prefix}/worlds/:worldId/items/:itemId`, async (ctx: any,) => {
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
    .get(`${prefix}/worlds/:worldId/items`, async (ctx: any,) => {
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
    .post(`${prefix}/worlds/:worldId/items`, async (ctx: any,) => {
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
    },);
}
