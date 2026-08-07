import { Elysia, t, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import {
  ErrorResponse,
  Id,
  ListResponse,
  QuestProgressBody,
  QuestResponse,
} from "../../validation/schemas";
import { handleProgress, } from "./handlers";

export function questProgressRoutes({ database, }: { database: Kysely<DB> },) {
  return new Elysia({ name: "quests-progress", },)
    .post("/api/quests/:id/progress", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      const userRole = ctx.userRole as string | null;
      return handleProgress(
        database,
        ctx.params.id,
        undefined,
        userId,
        userRole,
        ctx.body,
      );
    }, {
      params: t.Object({ id: Id, },),
      body: QuestProgressBody,
      response: {
        200: QuestResponse,
        401: ErrorResponse,
        404: ErrorResponse,
      },
      detail: {
        summary: "Update quest progress",
        description: "Update quest progress for a quest. Optionally link to a chat session.",
        tags: ["Quests",],
      },
    },)
    .get("/api/quests/:id/progress/:chatId", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      const userRole = ctx.userRole as string | null;
      return handleProgress(
        database,
        ctx.params.id,
        ctx.params.chatId,
        userId,
        userRole,
      );
    }, {
      params: t.Object({ id: Id, chatId: Id, },),
      response: {
        200: ListResponse(QuestResponse,),
        401: ErrorResponse,
        404: ErrorResponse,
      },
      detail: {
        summary: "Get quest progress by chat",
        description: "Get quest progress for a specific chat session.",
        tags: ["Quests",],
      },
    },);
}
