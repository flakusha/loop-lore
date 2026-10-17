// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Bestiary Routes.
 *
 * Monster templates and placed spawns backed by `src/rpg/bestiary`:
 *   GET  /api/rpg/bestiary/worlds/:worldId/monsters
 *   POST /api/rpg/bestiary/worlds/:worldId/monsters
 *   GET  /api/rpg/bestiary/worlds/:worldId/locations/:locationId/monsters
 *   POST /api/rpg/bestiary/worlds/:worldId/spawns
 *   POST /api/rpg/bestiary/worlds/:worldId/despawn-expired
 *
 * All routes are world-scoped and gated via `requireWorldOwner`.
 */
import { Elysia, t, } from "elysia";
import { MonsterAlignment, MonsterCategory, MonsterDifficulty, MonsterSize, } from "../../db/enums-story";
import {
  despawnExpired,
  listMonstersAtLocation,
  listMonsterTemplates,
  registerMonsterTemplate,
  rollMonsterLoot,
  spawnMonster,
} from "../../rpg/bestiary";
import { ErrorResponse, SuccessResponse, } from "../../validation/schemas";
import { jsonError, jsonResponse, notFoundResponse, requireUserId, } from "../http-utils";
import { requireWorldOwner, } from "../worlds/access";
import { log, } from "./log";
import type { HandlerOpts, } from "./types";

const lootEntrySchema = t.Object({
  itemId: t.String(),
  chance: t.Number({ minimum: 0, maximum: 1, },),
  quantity: t.Optional(t.Integer({ minimum: 1, },),),
},);

const templateBody = t.Object({
  name: t.String({ minLength: 1, },),
  category: t.Enum(MonsterCategory,),
  subcategory: t.Optional(t.Union([t.String(), t.Null(),],),),
  size: t.Optional(t.Enum(MonsterSize,),),
  alignment: t.Optional(t.Enum(MonsterAlignment,),),
  difficulty: t.Optional(t.Enum(MonsterDifficulty,),),
  stats: t.Optional(t.Record(t.String(), t.Number(),),),
  lootTable: t.Optional(t.Array(lootEntrySchema,),),
  territorial: t.Optional(t.Boolean(),),
  nocturnal: t.Optional(t.Boolean(),),
  packSize: t.Optional(t.Integer({ minimum: 1, },),),
  behavior: t.Optional(t.Record(t.String(), t.Number(),),),
},);

const spawnBody = t.Object({
  locationId: t.String(),
  templateId: t.String(),
  territory: t.Object({ centerX: t.Number(), centerY: t.Number(), radius: t.Number({ minimum: 0, },), },),
  despawnAt: t.Optional(t.Union([t.String(), t.Null(),],),),
  rngSeed: t.Optional(t.Integer(),),
},);

const worldParams = t.Object({ worldId: t.String(), },);

/**
 * @param root0
 * @param root0.database
 * @param prefix
 * @returns {Elysia<"", { decorator: {}; store: {}; derive: {}; resolve: {}; }, { typebox: {}; error: {}; }, { schema: {}; standaloneSchema: {}; macro: {}; macroFn: {}; parser: {}; response: {}; }, {}, { derive: {}; resolve: {}; schema: {}; standaloneSchema: {}; response: {}; }, { ...; }>}
 */
export function bestiaryRoutes({ database, }: HandlerOpts, prefix = "/api",): Elysia {
  const R = `${prefix}/rpg/bestiary`;

  return new Elysia({ name: "rpg-bestiary", },)
    // ── List the bestiary ──────────────────────────────────
    .get(`${R}/worlds/:worldId/monsters`, async (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      const denied = await requireWorldOwner(database, ctx.params.worldId, userId, ctx.userRole,);
      if (denied) { return denied; }
      try {
        return jsonResponse(await listMonsterTemplates({ db: database, worldId: ctx.params.worldId, },),);
      } catch (error) {
        log().error("Failed to list monster templates", error instanceof Error ? error : undefined,);
        return jsonError("Internal server error", 500,);
      }
    }, {
      params: worldParams,
      response: { 200: SuccessResponse, 401: ErrorResponse, 403: ErrorResponse, 404: ErrorResponse, },
      detail: {
        summary: "List monster templates",
        description: "List a world's bestiary entries plus the global ones.",
        tags: ["RPG", "Bestiary",],
      },
    },)
    // ── Register a template ────────────────────────────────
    .post(`${R}/worlds/:worldId/monsters`, async (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      const denied = await requireWorldOwner(database, ctx.params.worldId, userId, ctx.userRole,);
      if (denied) { return denied; }
      try {
        const template = await registerMonsterTemplate({
          db: database,
          now: new Date(),
          template: {
            ...(ctx.body as Record<string, unknown>),
            worldId: ctx.params.worldId,
          } as Parameters<typeof registerMonsterTemplate>[0]["template"],
        },);

        return jsonResponse(template,);
      } catch (error) {
        log().error("Failed to register monster template", error instanceof Error ? error : undefined,);
        return jsonError("Internal server error", 500,);
      }
    }, {
      params: worldParams,
      body: templateBody,
      response: { 200: SuccessResponse, 400: ErrorResponse, 401: ErrorResponse, 403: ErrorResponse, },
      detail: {
        summary: "Register a monster template",
        description: "Add a bestiary entry scoped to a world.",
        tags: ["RPG", "Bestiary",],
      },
    },)
    // ── Monsters at a location ────────────────────────────
    .get(`${R}/worlds/:worldId/locations/:locationId/monsters`, async (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      const denied = await requireWorldOwner(database, ctx.params.worldId, userId, ctx.userRole,);
      if (denied) { return denied; }
      try {
        return jsonResponse(
          await listMonstersAtLocation({
            db: database,
            worldId: ctx.params.worldId,
            locationId: ctx.params.locationId,
          },),
        );
      } catch (error) {
        log().error("Failed to list monsters at location", error instanceof Error ? error : undefined,);
        return jsonError("Internal server error", 500,);
      }
    }, {
      params: t.Object({ worldId: t.String(), locationId: t.String(), },),
      response: { 200: SuccessResponse, 401: ErrorResponse, 403: ErrorResponse, 404: ErrorResponse, },
      detail: {
        summary: "List monsters at a location",
        description: "List the spawns standing at a location with their templates resolved.",
        tags: ["RPG", "Bestiary",],
      },
    },)
    // ── Spawn a monster ───────────────────────────────────
    .post(`${R}/worlds/:worldId/spawns`, async (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      const denied = await requireWorldOwner(database, ctx.params.worldId, userId, ctx.userRole,);
      if (denied) { return denied; }
      try {
        const body = ctx.body as {
          locationId: string;
          templateId: string;
          territory: { centerX: number; centerY: number; radius: number };
          despawnAt?: string | null;
          rngSeed?: number;
        };

        const template = await database
          .selectFrom("monster_templates",)
          .select(["id", "loot_table",],)
          .where("id", "=", body.templateId,)
          .executeTakeFirst();

        if (!template) { return notFoundResponse("Monster template",); }

        const spawn = await spawnMonster({
          db: database,
          worldId: ctx.params.worldId,
          locationId: body.locationId,
          templateId: body.templateId,
          territory: body.territory,
          now: new Date(),
          despawnAt: body.despawnAt ?? null,
        },);

        const loot = body.rngSeed === undefined
          ? []
          : rollMonsterLoot({ template, rngSeed: body.rngSeed, },);

        return jsonResponse({ spawn, loot, },);
      } catch (error) {
        log().error("Failed to spawn monster", error instanceof Error ? error : undefined,);
        return jsonError("Internal server error", 500,);
      }
    }, {
      params: worldParams,
      body: spawnBody,
      response: { 200: SuccessResponse, 400: ErrorResponse, 401: ErrorResponse, 403: ErrorResponse, },
      detail: {
        summary: "Spawn a monster",
        description: "Place a template at a location with a territorial radius; optionally roll its loot from a seed.",
        tags: ["RPG", "Bestiary",],
      },
    },)
    // ── Sweep expired spawns ──────────────────────────────
    .post(`${R}/worlds/:worldId/despawn-expired`, async (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      const denied = await requireWorldOwner(database, ctx.params.worldId, userId, ctx.userRole,);
      if (denied) { return denied; }
      try {
        return jsonResponse({ despawned: await despawnExpired({ db: database, now: new Date(), },), },);
      } catch (error) {
        log().error("Failed to despawn expired monsters", error instanceof Error ? error : undefined,);
        return jsonError("Internal server error", 500,);
      }
    }, {
      params: worldParams,
      response: { 200: SuccessResponse, 401: ErrorResponse, 403: ErrorResponse, },
      detail: {
        summary: "Despawn expired monsters",
        description: "Remove every spawn whose despawn time has passed.",
        tags: ["RPG", "Bestiary",],
      },
    },);
}
