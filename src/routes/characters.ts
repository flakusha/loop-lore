import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { exportToCcV2Json, } from "../characters/exporters/ccv2";
import { exportToCcV3Json, } from "../characters/exporters/ccv3";
import { exportToToml, } from "../characters/exporters/toml";
import { exportToYaml, } from "../characters/exporters/yaml";
import type { CanonicalCharacter, } from "../characters/parser";
import { ActorType, AgentType, } from "../db/enums";
import type { DB, } from "../db/schema";
import { jsonParseOr, safeJsonStringify, uid, } from "../utils";
import { HttpStatus, jsonCreated, jsonError, jsonNoContent, jsonPaginated, jsonResponse, } from "./http-utils";

interface HandlerOpts {
  database: Kysely<DB>;
}

export function charactersRoutes(opts: HandlerOpts,) {
  const { database, } = opts;

  return new Elysia({ name: "characters", },)
    .get("/api/actors", async (ctx: any,) => {
      const page = Number(ctx.query.page,) || 1;
      const pageSize = Number(ctx.query.pageSize,) || 20;
      const offset = (page - 1) * pageSize;
      const type = ctx.query.type as string | undefined;

      let countQuery = database.selectFrom("actors",).select(database.fn.countAll<number>().as("total",),);
      let listQuery = database.selectFrom("actors",).selectAll();

      if (type) {
        countQuery = countQuery.where("actor_type", "=", type as ActorType,);
        listQuery = listQuery.where("actor_type", "=", type as ActorType,);
      }

      const userId = ctx.userId as string | null;
      if (userId) {
        countQuery = countQuery.where((eb,) => eb("owner_id", "=", userId,).or("owner_id", "is", null,));
        listQuery = listQuery.where((eb,) => eb("owner_id", "=", userId,).or("owner_id", "is", null,));
      }

      const countResult = await countQuery.executeTakeFirst();
      const total = countResult?.total ?? 0;
      const actors = await listQuery.orderBy("display_name", "asc",).limit(pageSize,).offset(offset,).execute();

      return jsonPaginated({ data: actors, total, page, pageSize, },);
    },)
    .post("/api/actors", async (ctx: any,) => {
      const body = ctx.body as Record<string, unknown>;
      const userId = ctx.userId as string | null;
      if (!userId) { return jsonError({ message: "Unauthorized", status: HttpStatus.Unauthorized, },); }

      const displayName = body.displayName as string | undefined;
      if (!displayName) {
        return jsonError({ message: "displayName is required", status: HttpStatus.BadRequest, },);
      }

      const id = uid();
      const tags = body.tags ? (body.tags as string).split(",",).map((t: string,) => t.trim()).filter(Boolean,) : [];
      const settings = tags.length > 0 ? JSON.stringify({ tags, },) : "{}";
      await database
        .insertInto("actors",)
        .values({
          id,
          actor_type: (body.actorType as ActorType | undefined) ?? ActorType.Character,
          display_name: displayName,
          user_id: userId,
          owner_id: userId,
          agent_type: (body.agentType as AgentType | undefined) ?? AgentType.Ai,
          description: (body.description as string | undefined) ?? null,
          personality: (body.personality as string | undefined) ?? null,
          scenario: (body.scenario as string | undefined) ?? null,
          welcome_message: (body.welcomeMessage as string | undefined) ?? null,
          system_prompt: (body.systemPrompt as string | undefined) ?? null,
          settings,
          import_spec: "raw",
          data_version: 0,
        },)
        .execute();

      return jsonCreated({ id, },);
    },)
    .get("/api/actors/:actorId", async (ctx: any,) => {
      const actor = await database
        .selectFrom("actors",)
        .selectAll()
        .where("id", "=", ctx.params.actorId,)
        .executeTakeFirst();
      if (!actor) { return jsonError({ message: "Actor not found", status: HttpStatus.NotFound, },); }

      // Solo role is admin-equivalent for own actors (instance owner)
      const isAdminOrSolo = ctx.userRole === "admin" || ctx.userRole === "solo";
      if (actor.visibility !== "public" && actor.user_id !== ctx.userId && !isAdminOrSolo) {
        return jsonError({ message: "Actor not found", status: HttpStatus.NotFound, },);
      }
      return jsonResponse(actor,);
    },)
    .get("/api/actors/:actorId/card", async (ctx: any,) => {
      const actor = await database
        .selectFrom("actors",)
        .selectAll()
        .where("id", "=", ctx.params.actorId,)
        .executeTakeFirst();
      if (!actor) { return jsonError({ message: "Actor not found", status: HttpStatus.NotFound, },); }

      // Solo role is admin-equivalent for own actors
      const isAdminOrSolo = ctx.userRole === "admin" || ctx.userRole === "solo";
      if (actor.visibility !== "public" && actor.user_id !== ctx.userId && !isAdminOrSolo) {
        return jsonError({ message: "Actor not found", status: HttpStatus.NotFound, },);
      }

      const settings = jsonParseOr(actor.settings, {},) as Record<string, unknown>;
      const tags = Array.isArray(settings.tags,) ? settings.tags : [];
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
          alternate_greetings: actor.alternate_greetings ? jsonParseOr(actor.alternate_greetings, [],) : [],
          creator_notes: actor.creator_notes ?? "",
          creator: actor.creator ?? "",
          character_version: actor.character_version ?? "",
          tags,
          extensions: {},
        },
      };
      return jsonResponse(card,);
    },)
    .put("/api/actors/:actorId", async (ctx: any,) => {
      const body = ctx.body as Record<string, unknown>;
      const userId = ctx.userId as string | null;
      if (!userId) { return jsonError({ message: "Unauthorized", status: HttpStatus.Unauthorized, },); }

      const actor = await database
        .selectFrom("actors",)
        .selectAll()
        .where("id", "=", ctx.params.actorId,)
        .executeTakeFirst();
      if (!actor) { return jsonError({ message: "Actor not found", status: HttpStatus.NotFound, },); }

      if (actor.owner_id !== userId && ctx.userRole !== "admin") {
        return jsonError({ message: "Forbidden", status: HttpStatus.Forbidden, },);
      }

      const updates: Record<string, unknown> = {};
      if (body.displayName) { updates.display_name = body.displayName; }
      if (body.description) { updates.description = body.description; }
      if (body.systemPrompt) { updates.system_prompt = body.systemPrompt; }
      if (body.avatarAssetId !== undefined) { updates.avatar_asset_id = body.avatarAssetId; }
      if (body.personality) { updates.personality = body.personality; }
      if (body.welcomeMessage) { updates.welcome_message = body.welcomeMessage; }
      if (body.mesExample) { updates.mes_example = body.mesExample; }
      if (body.scenario) { updates.scenario = body.scenario; }
      if (body.postHistoryInstructions) { updates.post_history_instructions = body.postHistoryInstructions; }
      if (body.creatorNotes) { updates.creator_notes = body.creatorNotes; }
      if (body.creator) { updates.creator = body.creator; }
      if (body.characterVersion) { updates.character_version = body.characterVersion; }
      if (body.settings) {
        const settingsResult = safeJsonStringify(body.settings,);
        if (!settingsResult.ok) {
          return jsonError({ message: "Invalid settings data", status: HttpStatus.BadRequest, },);
        }
        updates.settings = settingsResult.value;
      }
      updates.updated_at = new Date().toISOString();

      await database.updateTable("actors",).set(updates,).where("id", "=", ctx.params.actorId,).execute();
      return jsonResponse({ ok: true, },);
    },)
    .delete("/api/actors/:actorId", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      if (!userId) { return jsonError({ message: "Unauthorized", status: HttpStatus.Unauthorized, },); }

      const actor = await database
        .selectFrom("actors",)
        .selectAll()
        .where("id", "=", ctx.params.actorId,)
        .executeTakeFirst();
      if (!actor) { return jsonError({ message: "Actor not found", status: HttpStatus.NotFound, },); }

      if (actor.owner_id !== userId && ctx.userRole !== "admin") {
        return jsonError({ message: "Forbidden", status: HttpStatus.Forbidden, },);
      }

      await database.deleteFrom("actors",).where("id", "=", ctx.params.actorId,).execute();
      return jsonNoContent();
    },)
    .get("/api/actors/:actorId/export", async (ctx: any,) => {
      const format = (ctx.query.format as string) ?? "json";

      const actor = await database
        .selectFrom("actors",)
        .selectAll()
        .where("id", "=", ctx.params.actorId,)
        .executeTakeFirst();
      if (!actor) { return jsonError({ message: "Actor not found", status: HttpStatus.NotFound, },); }

      // Solo role is admin-equivalent for own actors
      const isAdminOrSolo = ctx.userRole === "admin" || ctx.userRole === "solo";
      if (actor.visibility !== "public" && actor.user_id !== ctx.userId && !isAdminOrSolo) {
        return jsonError({ message: "Actor not found", status: HttpStatus.NotFound, },);
      }

      // Convert to canonical format
      const canonical: CanonicalCharacter = {
        name: actor.display_name,
        description: actor.description ?? "",
        personality: actor.personality ?? undefined,
        scenario: actor.scenario ?? undefined,
        welcome_message: actor.welcome_message ?? undefined,
        mes_example: actor.mes_example ?? undefined,
        system_prompt: actor.system_prompt ?? undefined,
        post_history_instructions: actor.post_history_instructions ?? undefined,
        creator: actor.creator ?? undefined,
        creator_notes: actor.creator_notes ?? undefined,
        character_version: actor.character_version ?? undefined,
        alternate_greetings: actor.alternate_greetings
          ? jsonParseOr(actor.alternate_greetings, [],)
          : undefined,
      };

      const safeName = actor.display_name.replaceAll(/[^a-z0-9]/gi, "_",).toLowerCase();

      switch (format) {
        case "yaml": {
          return new Response(exportToYaml(canonical,), {
            headers: {
              "Content-Type": "text/yaml; charset=utf-8",
              "Content-Disposition": `attachment; filename="${safeName}.yaml"`,
            },
          },);
        }
        case "toml": {
          return new Response(exportToToml(canonical,), {
            headers: {
              "Content-Type": "text/plain; charset=utf-8",
              "Content-Disposition": `attachment; filename="${safeName}.toml"`,
            },
          },);
        }
        case "ccv2": {
          return new Response(exportToCcV2Json(canonical,), {
            headers: {
              "Content-Type": "application/json; charset=utf-8",
              "Content-Disposition": `attachment; filename="${safeName}.json"`,
            },
          },);
        }
        case "ccv3":
        case "json":
        default: {
          return new Response(exportToCcV3Json(canonical,), {
            headers: {
              "Content-Type": "application/json; charset=utf-8",
              "Content-Disposition": `attachment; filename="${safeName}.json"`,
            },
          },);
        }
      }
    },);
}
