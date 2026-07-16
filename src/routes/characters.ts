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
import { load as yamlLoad } from "js-yaml";
import { parse as parseToml } from "smol-toml";
import { extractCharacterDataFromPng } from "../characters/steganography";

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
    })
    .post("/api/actors/import", async (ctx: any) => {
      const contentType = ctx.request.headers.get("content-type") ?? "";

      if (contentType.includes("multipart/form-data")) {
        // eslint-disable-next-line @typescript-eslint/no-deprecated
        const formData = await ctx.request.formData();
        const file = formData.get("file");
        if (!file || !(file instanceof File)) return jsonError({ message: "file field is required", status: HttpStatus.BadRequest });

        const buffer = Buffer.from(await file.arrayBuffer());
        const filename = (file.name ?? "").toLowerCase();

        let data: Record<string, unknown>;
        let spec: string | undefined;

        if (filename.endsWith(".json")) {
          const parsed = jsonParseOr(await file.text(), null);
          if (!parsed || typeof parsed !== "object") return jsonError({ message: "Invalid JSON file", status: HttpStatus.BadRequest });
          data = parsed;
          spec = data.spec === "chara_card_v2" ? "chara_card_v2" : undefined;
        } else if (filename.endsWith(".png")) {
          const extracted = extractCharacterDataFromPng(buffer);
          if (!extracted) return jsonError({ message: "No character data found in PNG", status: HttpStatus.BadRequest });
          data = extracted.data;
          spec = extracted.spec;
        } else if (filename.endsWith(".yaml") || filename.endsWith(".yml")) {
          const parsed = yamlLoad(await file.text());
          if (!parsed || typeof parsed !== "object") return jsonError({ message: "Invalid YAML file", status: HttpStatus.BadRequest });
          data = parsed as Record<string, unknown>;
        } else if (filename.endsWith(".toml")) {
          const parsed = parseToml(await file.text());
          if (!parsed || typeof parsed !== "object") return jsonError({ message: "Invalid TOML file", status: HttpStatus.BadRequest });
          data = parsed;
        } else {
          return jsonError({
            message: "Unsupported file type. Use .json, .png, .yaml, or .toml",
            status: HttpStatus.BadRequest,
          });
        }

        return importActor({ data, spec, database, userId: ctx.userId as string });
      }

      // JSON body
      const body = ctx.body as Record<string, unknown>;
      const data = (body.data ?? body) as Record<string, unknown>;
      const spec = body.spec === "chara_card_v2" ? "chara_card_v2" : undefined;
      return importActor({ data, spec, database, userId: ctx.userId as string });
    });
}

interface ImportActorOpts {
  data: Record<string, unknown>;
  spec?: string;
  database: Kysely<DB>;
  userId: string;
}

async function importActor(opts: ImportActorOpts): Promise<Response> {
  const { data, spec, database, userId } = opts;

  const displayName = (data.name ?? data.displayName ?? data.display_name) as string | undefined;
  if (!displayName) return jsonError({ message: "Actor name is required", status: HttpStatus.BadRequest });

  const id = uid();
  await database
    .insertInto("actors")
    .values({
      id,
      actor_type: "character",
      display_name: displayName,
      user_id: userId,
      owner_id: userId,
      agent_type: "ai",
      description: (data.description as string | undefined) ?? null,
      system_prompt: (data.system_prompt as string | undefined) ?? null,
      welcome_message: (data.first_mes as string | undefined) ?? null,
      personality: (data.personality as string | undefined) ?? null,
      scenario: (data.scenario as string | undefined) ?? null,
      mes_example: (data.mes_example as string | undefined) ?? null,
      post_history_instructions: (data.post_history_instructions as string | undefined) ?? null,
      creator_notes: (data.creator_notes as string | undefined) ?? null,
      creator: (data.creator as string | undefined) ?? null,
      character_version: (data.character_version as string | undefined) ?? null,
      import_spec: spec ?? "raw",
      alternate_greetings: data.alternate_greetings
        ? (() => {
            const r = safeJsonStringify(data.alternate_greetings);
            return r.ok ? r.value : null;
          })()
        : null,
      settings: "{}",
      data_version: 1,
    })
    .execute();

  return jsonCreated({ id });
}