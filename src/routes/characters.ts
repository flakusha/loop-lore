import { Elysia, t, } from "elysia";
import type { Kysely, } from "kysely";
import { readFileSync, } from "node:fs";
import { createCharx, } from "../characters/charx";
import { exportToCcV2Json, } from "../characters/exporters/ccv2";
import { exportToCcV3Json, } from "../characters/exporters/ccv3";
import { exportToToml, } from "../characters/exporters/toml";
import { exportToYaml, } from "../characters/exporters/yaml";
import type { CanonicalCharacter, } from "../characters/parser";
import { getMinimalPng, insertCharacterDataIntoPng, } from "../characters/steganography";
import { ActorType, AgentType, } from "../db/enums";
import { updateWithVersionCheck, } from "../db/optimistic-locking";
import type { DB, } from "../db/schema";
import { jsonParseOr, jsonStringifyOr, safeJsonStringify, uid, } from "../utils";
import {
  ActorCreateBody,
  ActorIdParams,
  ActorsQuery,
  ActorUpdateBody,
  ErrorResponse,
  SuccessResponse,
} from "../validation/schemas";
import {
  HttpStatus,
  jsonCreated,
  jsonError,
  jsonNoContent,
  jsonPaginated,
  jsonResponse,
  requireUserId,
} from "./http-utils";

interface HandlerOpts {
  database: Kysely<DB>;
}

export function charactersRoutes(opts: HandlerOpts,) {
  const { database, } = opts;

  return new Elysia({ name: "characters", },)
    .get(
      "/api/actors",
      async (ctx: any,) => {
        const { page, pageSize, type, } = ctx.query;
        const offset = (page - 1) * pageSize;

        let countQuery = database.selectFrom("actors",).select(database.fn.countAll<number>().as("total",),);
        let listQuery = database.selectFrom("actors",).selectAll();

        if (type) {
          countQuery = countQuery.where("actor_type", "=", type,);
          listQuery = listQuery.where("actor_type", "=", type,);
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
      },
      {
        query: ActorsQuery,
        response: {
          200: t.Object({ data: t.Array(t.Any(),), total: t.Number(), page: t.Number(), pageSize: t.Number(), },),
          401: ErrorResponse,
        },
        detail: {
          summary: "List actors",
          description: "List characters and other actors. Supports pagination and type filtering.",
          tags: ["Characters",],
        },
      },
    )
    .post(
      "/api/actors",
      async (ctx: any,) => {
        const {
          displayName,
          tags,
          actorType,
          agentType,
          agentRole,
          description,
          personality,
          scenario,
          welcomeMessage,
          systemPrompt,
        } = ctx.body;
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }

        const id = uid();
        const parsedTags = tags ? tags.split(",",).map((t: string,) => t.trim()).filter(Boolean,) : [];
        const settings = parsedTags.length > 0 ? jsonStringifyOr({ tags: parsedTags, },) : "{}";
        await database
          .insertInto("actors",)
          .values({
            id,
            actor_type: actorType ?? ActorType.Character,
            display_name: displayName,
            user_id: userId,
            owner_id: userId,
            agent_type: agentType ?? AgentType.Ai,
            agent_role: agentRole ?? null,
            description: description ?? null,
            personality: personality ?? null,
            scenario: scenario ?? null,
            welcome_message: welcomeMessage ?? null,
            system_prompt: systemPrompt ?? null,
            settings,
            import_spec: "raw",
            data_source_format: "json",
            data_raw: null,
            format_version: 0,
          },)
          .execute();

        return jsonCreated({ id, },);
      },
      {
        body: ActorCreateBody,
        response: {
          201: t.Object({ id: t.String(), },),
          401: ErrorResponse,
        },
        detail: {
          summary: "Create actor",
          description: "Create a new character or actor. Requires authentication.",
          tags: ["Characters",],
        },
      },
    )
    .get(
      "/api/actors/:actorId",
      async (ctx: any,) => {
        const actor = await database
          .selectFrom("actors",)
          .selectAll()
          .where("id", "=", ctx.params.actorId,)
          .executeTakeFirst();
        if (!actor) {
          return jsonError({
            message: ctx.t?.("characters.actorNotFound",) ?? "Actor not found",
            status: HttpStatus.NotFound,
          },);
        }

        // Solo role is admin-equivalent for own actors (instance owner)
        const isAdminOrSolo = ctx.userRole === "admin" || ctx.userRole === "solo";
        if (actor.visibility !== "public" && actor.user_id !== ctx.userId && !isAdminOrSolo) {
          return jsonError({
            message: ctx.t?.("characters.actorNotFound",) ?? "Actor not found",
            status: HttpStatus.NotFound,
          },);
        }
        return jsonResponse(actor,);
      },
      {
        params: ActorIdParams,
        response: {
          200: t.Any(),
          401: ErrorResponse,
          404: ErrorResponse,
        },
        detail: {
          summary: "Get actor",
          description: "Get a character or actor by ID. Respects visibility rules.",
          tags: ["Characters",],
        },
      },
    )
    .get(
      "/api/actors/:actorId/card",
      async (ctx: any,) => {
        const actor = await database
          .selectFrom("actors",)
          .selectAll()
          .where("id", "=", ctx.params.actorId,)
          .executeTakeFirst();
        if (!actor) {
          return jsonError({
            message: ctx.t?.("characters.actorNotFound",) ?? "Actor not found",
            status: HttpStatus.NotFound,
          },);
        }

        // Solo role is admin-equivalent for own actors
        const isAdminOrSolo = ctx.userRole === "admin" || ctx.userRole === "solo";
        if (actor.visibility !== "public" && actor.user_id !== ctx.userId && !isAdminOrSolo) {
          return jsonError({
            message: ctx.t?.("characters.actorNotFound",) ?? "Actor not found",
            status: HttpStatus.NotFound,
          },);
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
      },
      {
        params: ActorIdParams,
        response: {
          200: t.Any(),
          401: ErrorResponse,
          404: ErrorResponse,
        },
        detail: {
          summary: "Get character card",
          description: "Get actor as a Chara Card v2 specification. Used for import/export compatibility.",
          tags: ["Characters",],
        },
      },
    )
    .put(
      "/api/actors/:actorId",
      async (ctx: any,) => {
        const {
          displayName,
          description,
          systemPrompt,
          agentRole,
          avatarAssetId,
          personality,
          welcomeMessage,
          mesExample,
          scenario,
          postHistoryInstructions,
          creatorNotes,
          creator,
          characterVersion,
          settings,
          dataVersion,
        } = ctx.body;
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }

        const actor = await database
          .selectFrom("actors",)
          .selectAll()
          .where("id", "=", ctx.params.actorId,)
          .executeTakeFirst();
        if (!actor) {
          return jsonError({
            message: ctx.t?.("characters.actorNotFound",) ?? "Actor not found",
            status: HttpStatus.NotFound,
          },);
        }

        if (actor.owner_id !== userId && ctx.userRole !== "admin") {
          return jsonError({ message: ctx.t?.("errors.forbidden",) ?? "Forbidden", status: HttpStatus.Forbidden, },);
        }

        // Optimistic concurrency check
        if (dataVersion !== undefined && dataVersion !== actor.format_version) {
          return jsonError({
            message: "Version conflict: record was modified by another process",
            status: HttpStatus.Conflict,
          },);
        }

        const updates: Record<string, unknown> = {};
        if (displayName) { updates.display_name = displayName; }
        if (description) { updates.description = description; }
        if (systemPrompt) { updates.system_prompt = systemPrompt; }
        if (agentRole !== undefined) { updates.agent_role = agentRole; }
        if (avatarAssetId !== undefined) { updates.avatar_asset_id = avatarAssetId; }
        if (personality) { updates.personality = personality; }
        if (welcomeMessage) { updates.welcome_message = welcomeMessage; }
        if (mesExample) { updates.mes_example = mesExample; }
        if (scenario) { updates.scenario = scenario; }
        if (postHistoryInstructions) { updates.post_history_instructions = postHistoryInstructions; }
        if (creatorNotes) { updates.creator_notes = creatorNotes; }
        if (creator) { updates.creator = creator; }
        if (characterVersion) { updates.character_version = characterVersion; }
        if (settings) {
          const settingsResult = safeJsonStringify(settings,);
          if (!settingsResult.ok) {
            return jsonError({
              message: ctx.t?.("users.invalidSettingsData",) ?? "Invalid settings data",
              status: HttpStatus.BadRequest,
            },);
          }
          updates.settings = settingsResult.value;
        }

        // Use optimistic locking
        const result = await updateWithVersionCheck(
          database,
          "actors",
          ctx.params.actorId,
          actor.format_version,
          updates,
        );

        if (!result.ok) {
          return jsonError({ message: result.error ?? "Update failed", status: HttpStatus.Conflict, },);
        }

        return jsonResponse({ ok: true, dataVersion: actor.format_version + 1, },);
      },
      {
        params: ActorIdParams,
        body: ActorUpdateBody,
        response: {
          200: SuccessResponse,
          401: ErrorResponse,
          403: ErrorResponse,
          404: ErrorResponse,
          409: ErrorResponse,
        },
        detail: {
          summary: "Update actor",
          description: "Update a character or actor. Owner or admin only.",
          tags: ["Characters",],
        },
      },
    )
    .delete(
      "/api/actors/:actorId",
      async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }

        const actor = await database
          .selectFrom("actors",)
          .selectAll()
          .where("id", "=", ctx.params.actorId,)
          .executeTakeFirst();
        if (!actor) {
          return jsonError({
            message: ctx.t?.("characters.actorNotFound",) ?? "Actor not found",
            status: HttpStatus.NotFound,
          },);
        }

        if (actor.owner_id !== userId && ctx.userRole !== "admin") {
          return jsonError({ message: ctx.t?.("errors.forbidden",) ?? "Forbidden", status: HttpStatus.Forbidden, },);
        }

        await database.deleteFrom("actors",).where("id", "=", ctx.params.actorId,).execute();
        return jsonNoContent();
      },
      {
        params: ActorIdParams,
        response: {
          204: t.Void(),
          401: ErrorResponse,
          403: ErrorResponse,
          404: ErrorResponse,
        },
        detail: {
          summary: "Delete actor",
          description: "Delete a character or actor. Owner or admin only.",
          tags: ["Characters",],
        },
      },
    )
    .get("/api/actors/:actorId/export", async (ctx: any,) => {
      const format = ctx.query.format ?? "json";

      const actor = await database
        .selectFrom("actors",)
        .selectAll()
        .where("id", "=", ctx.params.actorId,)
        .executeTakeFirst();
      if (!actor) {
        return jsonError({
          message: ctx.t?.("characters.actorNotFound",) ?? "Actor not found",
          status: HttpStatus.NotFound,
        },);
      }

      // Solo role is admin-equivalent for own actors
      const isAdminOrSolo = ctx.userRole === "admin" || ctx.userRole === "solo";
      if (actor.visibility !== "public" && actor.user_id !== ctx.userId && !isAdminOrSolo) {
        return jsonError({
          message: ctx.t?.("characters.actorNotFound",) ?? "Actor not found",
          status: HttpStatus.NotFound,
        },);
      }

      // Convert to canonical format
      const canonical: CanonicalCharacter = {
        name: actor.display_name,
        description: actor.description ?? "",
        personality: actor.personality ?? "",
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

      // If stored as YAML/TOML with raw source, return the raw source for fidelity
      const sourceFormat = (actor as Record<string, unknown>).data_source_format as string | undefined;
      const rawSource = (actor as Record<string, unknown>).data_raw as string | undefined;

      if (
        (format === "yaml" || format === "toml") &&
        sourceFormat &&
        sourceFormat === format &&
        rawSource
      ) {
        const contentType = format === "yaml" ? "text/yaml" : "text/plain";
        return new Response(rawSource, {
          headers: {
            "Content-Type": `${contentType}; charset=utf-8`,
            "Content-Disposition": `attachment; filename="${safeName}.${format}"`,
          },
        },);
      }

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
        case "png": {
          const dataObj: Record<string, unknown> = {
            name: canonical.name,
            description: canonical.description,
            personality: canonical.personality,
            scenario: canonical.scenario,
            first_mes: canonical.welcome_message,
            mes_example: canonical.mes_example,
            system_prompt: canonical.system_prompt,
            post_history_instructions: canonical.post_history_instructions,
            creator_notes: canonical.creator_notes,
            creator: canonical.creator,
            character_version: canonical.character_version,
            alternate_greetings: canonical.alternate_greetings,
            tags: canonical.tags,
          };
          const pngBuf = insertCharacterDataIntoPng(getMinimalPng(), dataObj,);
          return new Response(new Uint8Array(pngBuf,), {
            headers: {
              "Content-Type": "image/png",
              "Content-Disposition": `attachment; filename="${safeName}.png"`,
            },
          },);
        }
        case "charx": {
          const v3Data: Record<string, unknown> = {
            spec: "chara_card_v3",
            data: {
              name: canonical.name,
              description: canonical.description,
              personality: canonical.personality,
              scenario: canonical.scenario,
              first_mes: canonical.welcome_message,
              mes_example: canonical.mes_example,
              system_prompt: canonical.system_prompt,
              post_history_instructions: canonical.post_history_instructions,
              creator_notes: canonical.creator_notes,
              creator: canonical.creator,
              character_version: canonical.character_version,
              alternate_greetings: canonical.alternate_greetings,
              tags: canonical.tags,
            },
          };
          // Fetch linked assets for the character
          const assetRows = await database
            .selectFrom("asset_links",)
            .innerJoin("assets", "assets.id", "asset_links.asset_id",)
            .select(["assets.storage_path", "assets.filename",],)
            .where("asset_links.entity_type", "=", "actor",)
            .where("asset_links.entity_id", "=", ctx.params.actorId,)
            .execute();
          const assets = assetRows.map((a,) => ({
            path: a.filename,
            data: readFileSync(a.storage_path,),
          })).filter((a,) => a.data.length > 0);
          const charxBuf = await createCharx(v3Data, assets,);
          return new Response(new Uint8Array(charxBuf,), {
            headers: {
              "Content-Type": "application/zip",
              "Content-Disposition": `attachment; filename="${safeName}.charx"`,
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
    }, {
      params: ActorIdParams,
      response: {
        200: t.Any(),
        404: ErrorResponse,
      },
    },);
}
