/* eslint-disable @typescript-eslint/no-explicit-any */

import { Elysia } from "elysia";
import type { Kysely } from "kysely";
import type { DB } from "../db/schema";
import { uid, safeJsonStringify, jsonParseOr } from "../utils";
import {
  jsonResponse,
  jsonError,
  jsonPaginated,
  jsonCreated,
  jsonNoContent,
  HttpStatus,
} from "./http-utils";
import { ActorType, AgentType } from "../db/enums";

interface HandlerOpts {
  database: Kysely<DB>;
}

export function charactersRoutes(opts: HandlerOpts) {
  const { database } = opts;

  return new Elysia({ name: "characters" })
    .get("/api/actors", async (ctx: any) => {
      const page = Number(ctx.query.page) || 1;
      const pageSize = Number(ctx.query.pageSize) || 20;
      const offset = (page - 1) * pageSize;
      const type = ctx.query.type as string | undefined;

      let countQuery = database.selectFrom("actors").select(database.fn.countAll<number>().as("total"));
      let listQuery = database.selectFrom("actors").selectAll();

      if (type) {
        countQuery = countQuery.where("actor_type", "=", type as ActorType);
        listQuery = listQuery.where("actor_type", "=", type as ActorType);
      }

      const userId = ctx.userId as string | null;
      if (userId) {
        countQuery = countQuery.where((eb) => eb("owner_id", "=", userId).or("owner_id", "is", null));
        listQuery = listQuery.where((eb) => eb("owner_id", "=", userId).or("owner_id", "is", null));
      }

      const countResult = await countQuery.executeTakeFirst();
      const total = countResult?.total ?? 0;
      const actors = await listQuery.orderBy("display_name", "asc").limit(pageSize).offset(offset).execute();

      return jsonPaginated({ data: actors, total, page, pageSize });
    })
    .post("/api/actors", async (ctx: any) => {
      const body = ctx.body as Record<string, unknown>;
      const userId = ctx.userId as string | null;
      if (!userId) return jsonError({ message: "Unauthorized", status: HttpStatus.Unauthorized });

      const displayName = body.displayName as string | undefined;
      if (!displayName) return jsonError({ message: "displayName is required", status: HttpStatus.BadRequest });

      const id = uid();
      await database
        .insertInto("actors")
        .values({
          id,
          actor_type: (body.actorType as ActorType | undefined) ?? ActorType.Character,
          display_name: displayName,
          user_id: userId,
          owner_id: userId,
          agent_type: (body.agentType as AgentType | undefined) ?? AgentType.Ai,
          description: (body.description as string | undefined) ?? null,
          system_prompt: (body.systemPrompt as string | undefined) ?? null,
          settings: "{}",
          import_spec: "raw",
          data_version: 0,
        })
        .execute();

      return jsonCreated({ id });
    })
    .get("/api/actors/:id", async (ctx: any) => {
      const actor = await database.selectFrom("actors").selectAll().where("id", "=", ctx.params.id).executeTakeFirst();
      if (!actor) return jsonError({ message: "Actor not found", status: HttpStatus.NotFound });

      if (actor.visibility !== "public" && actor.user_id !== ctx.userId && ctx.userRole !== "admin") {
        return jsonError({ message: "Actor not found", status: HttpStatus.NotFound });
      }
      return jsonResponse(actor);
    })
    .get("/api/actors/:id/card", async (ctx: any) => {
      const actor = await database.selectFrom("actors").selectAll().where("id", "=", ctx.params.id).executeTakeFirst();
      if (!actor) return jsonError({ message: "Actor not found", status: HttpStatus.NotFound });

      if (actor.visibility !== "public" && actor.user_id !== ctx.userId && ctx.userRole !== "admin") {
        return jsonError({ message: "Actor not found", status: HttpStatus.NotFound });
      }

      const card = {
        spec: "chara_card_v2",
        spec_version: "2.0",
        data: {
          name: actor.display_name,
          description: actor.description ?? "",
          personality: actor.personality ?? "",
          scenario: actor.scenario ?? "",
          first_mes: actor.welcome_message ?? "",
          mes_example: actor.mes_example ?? "",
          system_prompt: actor.system_prompt ?? "",
          post_history_instructions: actor.post_history_instructions ?? "",
          alternate_greetings: actor.alternate_greetings ? jsonParseOr(actor.alternate_greetings, []) : [],
          creator_notes: actor.creator_notes ?? "",
          creator: actor.creator ?? "",
          character_version: actor.character_version ?? "",
          tags: [],
          extensions: {},
        },
      };
      return jsonResponse(card);
    })
    .put("/api/actors/:id", async (ctx: any) => {
      const body = ctx.body as Record<string, unknown>;
      const userId = ctx.userId as string | null;
      if (!userId) return jsonError({ message: "Unauthorized", status: HttpStatus.Unauthorized });

      const actor = await database.selectFrom("actors").selectAll().where("id", "=", ctx.params.id).executeTakeFirst();
      if (!actor) return jsonError({ message: "Actor not found", status: HttpStatus.NotFound });

      if (actor.owner_id !== userId && ctx.userRole !== "admin") {
        return jsonError({ message: "Forbidden", status: HttpStatus.Forbidden });
      }

      const updates: Record<string, unknown> = {};
      if (body.displayName) updates.display_name = body.displayName;
      if (body.description) updates.description = body.description;
      if (body.systemPrompt) updates.system_prompt = body.systemPrompt;
      if (body.avatarAssetId !== undefined) updates.avatar_asset_id = body.avatarAssetId;
      if (body.personality) updates.personality = body.personality;
      if (body.welcomeMessage) updates.welcome_message = body.welcomeMessage;
      if (body.mesExample) updates.mes_example = body.mesExample;
      if (body.scenario) updates.scenario = body.scenario;
      if (body.postHistoryInstructions) updates.post_history_instructions = body.postHistoryInstructions;
      if (body.creatorNotes) updates.creator_notes = body.creatorNotes;
      if (body.creator) updates.creator = body.creator;
      if (body.characterVersion) updates.character_version = body.characterVersion;
      if (body.settings) {
        const settingsResult = safeJsonStringify(body.settings);
        if (!settingsResult.ok) return jsonError({ message: "Invalid settings data", status: HttpStatus.BadRequest });
        updates.settings = settingsResult.value;
      }
      updates.updated_at = new Date().toISOString();

      await database.updateTable("actors").set(updates).where("id", "=", ctx.params.id).execute();
      return jsonResponse({ ok: true });
    })
    .delete("/api/actors/:id", async (ctx: any) => {
      const userId = ctx.userId as string | null;
      if (!userId) return jsonError({ message: "Unauthorized", status: HttpStatus.Unauthorized });

      const actor = await database.selectFrom("actors").selectAll().where("id", "=", ctx.params.id).executeTakeFirst();
      if (!actor) return jsonError({ message: "Actor not found", status: HttpStatus.NotFound });

      if (actor.owner_id !== userId && ctx.userRole !== "admin") {
        return jsonError({ message: "Forbidden", status: HttpStatus.Forbidden });
      }

      await database.deleteFrom("actors").where("id", "=", ctx.params.id).execute();
      return jsonNoContent();
    });
}