// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, t, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import {
  ErrorResponse,
  Id,
  QuestResponse,
  QuestUpdateBody,
  SuccessResponse,
} from "../../validation/schemas";
import { handleAbandonQuest, handleQuest, } from "./handlers";

export function questCrudRoutes({ database, }: { database: Kysely<DB> }, prefix = "/api",) {
  return new Elysia({ name: "quests-crud", },)
    .get(`${prefix}/quests/:id`, async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      const userRole = ctx.userRole as string | null;
      return handleQuest(database, "GET", ctx.params.id, userId, userRole,);
    }, {
      params: t.Object({ id: Id, },),
      response: {
        200: QuestResponse,
        401: ErrorResponse,
        404: ErrorResponse,
      },
      detail: {
        summary: "Get quest",
        description: "Get a single quest by ID.",
        tags: ["Quests",],
      },
    },)
    .put(`${prefix}/quests/:id`, async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      const userRole = ctx.userRole as string | null;
      return handleQuest(
        database,
        "PUT",
        ctx.params.id,
        userId,
        userRole,
        ctx.body,
      );
    }, {
      params: t.Object({ id: Id, },),
      body: QuestUpdateBody,
      response: {
        200: QuestResponse,
        401: ErrorResponse,
        404: ErrorResponse,
      },
      detail: {
        summary: "Update quest",
        description: "Update a quest's properties (title, description, status, objectives).",
        tags: ["Quests",],
      },
    },)
    .delete(`${prefix}/quests/:id`, async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      const userRole = ctx.userRole as string | null;
      return handleAbandonQuest(database, ctx.params.id, userId, userRole,);
    }, {
      params: t.Object({ id: Id, },),
      response: {
        200: SuccessResponse,
        401: ErrorResponse,
        404: ErrorResponse,
      },
      detail: {
        summary: "Abandon quest",
        description: "Abandon/delete a quest by ID.",
        tags: ["Quests",],
      },
    },);
}
