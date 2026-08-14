import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import {
  ErrorResponse,
  ListResponse,
  QuestCreateBody,
  QuestResponse,
} from "../../validation/schemas";
import { handleCreateQuest, handleListQuests, } from "./handlers";

export function questWorldRoutes({ database, }: { database: Kysely<DB> }, prefix = "/api",) {
  return new Elysia({ name: "quests-world", },)
    .get(prefix + "/worlds/:worldId/quests", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      const userRole = ctx.userRole as string | null;
      return handleListQuests(
        database,
        ctx.params.worldId as string,
        Number(ctx.query?.page,) || 1,
        Number(ctx.query?.pageSize,) || 20,
        userId,
        userRole,
      );
    }, {
      response: {
        200: ListResponse(QuestResponse,),
        401: ErrorResponse,
        404: ErrorResponse,
      },
      detail: {
        summary: "List world quests",
        description: "List quests in a world. Paginated.",
        tags: ["Quests",],
      },
    },)
    .post(
      prefix + "/worlds/:worldId/quests",
      async (ctx: any,) => {
        const userId = ctx.userId as string | null;
        const userRole = ctx.userRole as string | null;
        return handleCreateQuest(
          database,
          ctx.params.worldId as string,
          userId,
          userRole,
          ctx.body as Record<string, unknown>,
        );
      },
      {
        body: QuestCreateBody,
        response: {
          200: QuestResponse,
          401: ErrorResponse,
          404: ErrorResponse,
        },
        detail: {
          summary: "Create quest",
          description: "Create a new quest in a world.",
          tags: ["Quests",],
        },
      },
    );
}
