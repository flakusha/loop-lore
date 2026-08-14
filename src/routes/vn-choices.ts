/**
 * VN Choices Routes
 *
 * REST endpoints for Visual Novel branching choices:
 *   GET    /api/chats/:chatId/vn-choices — list choices for a scene
 *   POST   /api/chats/:chatId/vn-choices — create a choice
 *   POST   /api/chats/:chatId/vn-choices/:choiceId/select — select a choice
 *   GET    /api/chats/:chatId/vn-choices/history — choice history
 */

import { Elysia, t, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { getLogger, type Logger, } from "../logger";
import { jsonParseOr, jsonStringifyOr, uid, } from "../utils";
import {
  forbiddenResponse as forbidden,
  HttpStatus,
  jsonCreated,
  jsonError,
  jsonResponse,
  notFoundResponse as notFound,
  requireUserId,
} from "./http-utils";

function log(): Logger {
  return getLogger().child({ module: "vn-choices", },);
}

interface HandlerOpts {
  database: Kysely<DB>;
}

export function vnChoiceRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, } = opts;

  return (
    new Elysia({ name: "vn-choices", },)
      // List available choices for a scene
      .get(
        `${prefix}/chats/:id/vn-choices`,
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }

          const { id: chatId, } = ctx.params;
          const sceneIndex = parseInt(ctx.query.sceneIndex ?? "0", 10,);

          const chat = await database
            .selectFrom("chats",)
            .selectAll()
            .where("id", "=", chatId,)
            .executeTakeFirst();

          if (!chat) { return notFound("Chat not found",); }
          if (chat.created_by !== userId) { return forbidden(); }

          const choices = await database
            .selectFrom("vn_choices",)
            .selectAll()
            .where("chat_id", "=", chatId,)
            .where("scene_index", "=", sceneIndex,)
            .orderBy("created_at", "asc",)
            .execute();

          return jsonResponse({ data: choices, },);
        },
        {
          params: t.Object({ id: t.String(), },),
          query: t.Object({ sceneIndex: t.Optional(t.String(),), },),
        },
      )
      // Create a new choice
      .post(
        `${prefix}/chats/:id/vn-choices`,
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }

          const { id: chatId, } = ctx.params;
          const body = ctx.body;

          const chat = await database
            .selectFrom("chats",)
            .selectAll()
            .where("id", "=", chatId,)
            .executeTakeFirst();

          if (!chat) { return notFound("Chat not found",); }
          if (chat.created_by !== userId) { return forbidden(); }

          const id = uid();
          const now = new Date().toISOString();

          await database
            .insertInto("vn_choices",)
            .values({
              id,
              chat_id: chatId,
              scene_index: body.sceneIndex,
              label: body.label,
              description: body.description ?? null,
              consequences: jsonStringifyOr(body.consequences ?? {},),
              relationship_impact: jsonStringifyOr(body.relationshipImpact ?? {},),
              mood_impact: jsonStringifyOr(body.moodImpact ?? {},),
              unlock_conditions: jsonStringifyOr(body.unlockConditions ?? {},),
              created_at: now,
            },)
            .execute();

          log().info("Created VN choice", { chatId, sceneIndex: body.sceneIndex, },);

          return jsonCreated({ data: { id, }, },);
        },
        {
          params: t.Object({ id: t.String(), },),
          body: t.Object({
            sceneIndex: t.Number(),
            label: t.String({ minLength: 1, },),
            description: t.Optional(t.String(),),
            consequences: t.Optional(t.Record(t.String(), t.Any(),),),
            relationshipImpact: t.Optional(t.Record(t.String(), t.Number(),),),
            moodImpact: t.Optional(t.Record(t.String(), t.Number(),),),
            unlockConditions: t.Optional(t.Record(t.String(), t.Any(),),),
          },),
        },
      )
      // Select a choice
      .post(
        `${prefix}/chats/:id/vn-choices/:choiceId/select`,
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }

          const { id: chatId, choiceId, } = ctx.params;

          const chat = await database
            .selectFrom("chats",)
            .selectAll()
            .where("id", "=", chatId,)
            .executeTakeFirst();

          if (!chat) { return notFound("Chat not found",); }
          if (chat.created_by !== userId) { return forbidden(); }

          const choice = await database
            .selectFrom("vn_choices",)
            .selectAll()
            .where("id", "=", choiceId,)
            .where("chat_id", "=", chatId,)
            .executeTakeFirst();

          if (!choice) { return notFound("Choice not found",); }
          if (choice.selected) {
            return jsonError("Choice already selected", HttpStatus.Conflict,);
          }

          const now = new Date().toISOString();

          await database
            .updateTable("vn_choices",)
            .set({
              selected: 1,
              selected_at: now,
            },)
            .where("id", "=", choiceId,)
            .execute();

          log().info("Selected VN choice", { chatId, choiceId, },);

          return jsonResponse({
            data: {
              ...choice,
              selected: 1,
              selected_at: now,
              consequences: jsonParseOr(choice.consequences, {},),
              relationship_impact: jsonParseOr(choice.relationship_impact, {},),
              mood_impact: jsonParseOr(choice.mood_impact, {},),
              unlock_conditions: jsonParseOr(choice.unlock_conditions, {},),
            },
          },);
        },
        {
          params: t.Object({
            id: t.String(),
            choiceId: t.String(),
          },),
        },
      )
      // Get choice history (all selected choices)
      .get(
        `${prefix}/chats/:id/vn-choices/history`,
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }

          const { id: chatId, } = ctx.params;

          const chat = await database
            .selectFrom("chats",)
            .selectAll()
            .where("id", "=", chatId,)
            .executeTakeFirst();

          if (!chat) { return notFound("Chat not found",); }
          if (chat.created_by !== userId) { return forbidden(); }

          const history = await database
            .selectFrom("vn_choices",)
            .selectAll()
            .where("chat_id", "=", chatId,)
            .where("selected", "=", 1,)
            .orderBy("selected_at", "asc",)
            .execute();

          return jsonResponse({
            data: Array.from(history, (h,) => ({
              ...h,
              consequences: jsonParseOr(h.consequences, {},),
              relationship_impact: jsonParseOr(h.relationship_impact, {},),
              mood_impact: jsonParseOr(h.mood_impact, {},),
              unlock_conditions: jsonParseOr(h.unlock_conditions, {},),
            }),),
          },);
        },
        {
          params: t.Object({ id: t.String(), },),
        },
      )
  );
}
