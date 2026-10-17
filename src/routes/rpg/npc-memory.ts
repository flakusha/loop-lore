// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * NPC Memory Routes.
 *
 * The NPC memory lifecycle and relationship model backed by
 * `src/rpg/npc-memory`:
 *   GET  /api/rpg/npc-memory/worlds/:worldId/npcs/:npcId/memories?limit=
 *   POST /api/rpg/npc-memory/worlds/:worldId/npcs/:npcId/memories
 *   POST /api/rpg/npc-memory/memories/:memoryId/reinforce
 *   POST /api/rpg/npc-memory/worlds/:worldId/relationships
 *   POST /api/rpg/npc-memory/worlds/:worldId/decay
 *
 * All routes are world-scoped and gated via `requireWorldOwner`.
 */
import { Elysia, t, } from "elysia";
import { MemoryType, } from "../../db/enums-story";
import {
  computeRelationshipType,
  decayMemories,
  recallMemories,
  recordMemory,
  reinforceMemory,
  updateRelationship,
} from "../../rpg/npc-memory";
import { ErrorResponse, SuccessResponse, } from "../../validation/schemas";
import { jsonError, jsonResponse, requireUserId, } from "../http-utils";
import { requireWorldOwner, } from "../worlds/access";
import { log, } from "./log";
import type { HandlerOpts, } from "./types";

const DEFAULT_LIMIT = 20;

const memoryBody = t.Object({
  worldId: t.String(),
  content: t.String({ minLength: 1, },),
  memoryType: t.Optional(t.Enum(MemoryType,),),
  importance: t.Optional(t.Integer({ minimum: 0, maximum: 100, },),),
  emotionalImpact: t.Optional(t.Integer({ minimum: -100, maximum: 100, },),),
  participants: t.Optional(t.Array(t.String(),),),
  locationId: t.Optional(t.Union([t.String(), t.Null(),],),),
  decayRate: t.Optional(t.Number({ minimum: 0, },),),
  shared: t.Optional(t.Boolean(),),
  expiresAt: t.Optional(t.Union([t.String(), t.Null(),],),),
},);

const relationshipBody = t.Object({
  worldId: t.String(),
  npcId: t.String(),
  targetId: t.String(),
  delta: t.Integer({ minimum: -100, maximum: 100, },),
},);

const worldParams = t.Object({ worldId: t.String(), },);

/**
 * @param root0
 * @param root0.database
 * @param prefix
 * @returns {Elysia<"", { decorator: {}; store: {}; derive: {}; resolve: {}; }, { typebox: {}; error: {}; }, { schema: {}; standaloneSchema: {}; macro: {}; macroFn: {}; parser: {}; response: {}; }, {}, { derive: {}; resolve: {}; schema: {}; standaloneSchema: {}; response: {}; }, { ...; }>}
 */
export function npcMemoryRoutes({ database, }: HandlerOpts, prefix = "/api",): Elysia {
  const R = `${prefix}/rpg/npc-memory`;

  return new Elysia({ name: "rpg-npc-memory", },)
    // ── Recall memories ────────────────────────────────────
    .get(`${R}/worlds/:worldId/npcs/:npcId/memories`, async (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      const denied = await requireWorldOwner(database, ctx.params.worldId, userId, ctx.userRole,);
      if (denied) { return denied; }
      try {
        const { limit, } = ctx.query as { limit?: number };
        const memories = await recallMemories({
          db: database,
          worldId: ctx.params.worldId,
          npcId: ctx.params.npcId,
          limit: limit ?? DEFAULT_LIMIT,
        },);

        return jsonResponse(memories,);
      } catch (error) {
        log().error("Failed to recall NPC memories", error instanceof Error ? error : undefined,);
        return jsonError("Internal server error", 500,);
      }
    }, {
      params: t.Object({ worldId: t.String(), npcId: t.String(), },),
      query: t.Object({ limit: t.Optional(t.Integer({ minimum: 1, maximum: 200, },),), },),
      response: { 200: SuccessResponse, 401: ErrorResponse, 403: ErrorResponse, 404: ErrorResponse, },
      detail: {
        summary: "Recall NPC memories",
        description: "List an NPC's still-fresh memories, most important first.",
        tags: ["RPG", "NPC Memory",],
      },
    },)
    // ── Record a memory ────────────────────────────────────
    .post(`${R}/worlds/:worldId/npcs/:npcId/memories`, async (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      const denied = await requireWorldOwner(database, ctx.params.worldId, userId, ctx.userRole,);
      if (denied) { return denied; }
      try {
        const body = ctx.body as Record<string, unknown>;
        const memory = await recordMemory({
          db: database,
          worldId: ctx.params.worldId,
          npcId: ctx.params.npcId,
          now: new Date(),
          memory: {
            content: body.content as string,
            memoryType: body.memoryType as typeof MemoryType[keyof typeof MemoryType] | undefined,
            importance: body.importance as number | undefined,
            emotionalImpact: body.emotionalImpact as number | undefined,
            participants: body.participants as string[] | undefined,
            locationId: (body.locationId ?? null) as string | null,
            decayRate: body.decayRate as number | undefined,
            shared: body.shared as boolean | undefined,
            expiresAt: (body.expiresAt ?? null) as string | null,
          },
        },);

        return jsonResponse(memory,);
      } catch (error) {
        log().error("Failed to record NPC memory", error instanceof Error ? error : undefined,);
        return jsonError("Internal server error", 500,);
      }
    }, {
      params: t.Object({ worldId: t.String(), npcId: t.String(), },),
      body: memoryBody,
      response: { 200: SuccessResponse, 400: ErrorResponse, 401: ErrorResponse, 403: ErrorResponse, },
      detail: {
        summary: "Record an NPC memory",
        description: "Store a memory for an NPC and stamp its decay clock.",
        tags: ["RPG", "NPC Memory",],
      },
    },)
    // ── Reinforce a memory ─────────────────────────────────
    .post(`${R}/worlds/:worldId/memories/:memoryId/reinforce`, async (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      const denied = await requireWorldOwner(database, ctx.params.worldId, userId, ctx.userRole,);
      if (denied) { return denied; }
      try {
        const memory = await reinforceMemory(database, ctx.params.memoryId, new Date(),);
        return jsonResponse(memory,);
      } catch (error) {
        log().error("Failed to reinforce NPC memory", error instanceof Error ? error : undefined,);
        return jsonError("Memory not found", 404,);
      }
    }, {
      params: t.Object({ worldId: t.String(), memoryId: t.String(), },),
      response: { 200: SuccessResponse, 401: ErrorResponse, 403: ErrorResponse, 404: ErrorResponse, },
      detail: {
        summary: "Reinforce an NPC memory",
        description: "Reset a memory's decay clock and bump its importance by one.",
        tags: ["RPG", "NPC Memory",],
      },
    },)
    // ── Shift a relationship ───────────────────────────────
    .post(`${R}/worlds/:worldId/relationships`, async (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      const denied = await requireWorldOwner(database, ctx.params.worldId, userId, ctx.userRole,);
      if (denied) { return denied; }
      try {
        const body = ctx.body as { npcId: string; targetId: string; delta: number };
        const relationship = await updateRelationship({
          db: database,
          worldId: ctx.params.worldId,
          npcId: body.npcId,
          targetId: body.targetId,
          delta: body.delta,
          now: new Date(),
        },);

        return jsonResponse({
          relationship,
          computedType: computeRelationshipType({
            standing: relationship.standing,
            bond: relationship.emotional_bond,
          },),
        },);
      } catch (error) {
        log().error("Failed to update NPC relationship", error instanceof Error ? error : undefined,);
        return jsonError("Internal server error", 500,);
      }
    }, {
      params: worldParams,
      body: relationshipBody,
      response: { 200: SuccessResponse, 400: ErrorResponse, 401: ErrorResponse, 403: ErrorResponse, },
      detail: {
        summary: "Update an NPC relationship",
        description: "Shift an NPC's standing and bond toward a target, re-deriving the relationship band.",
        tags: ["RPG", "NPC Memory",],
      },
    },)
    // ── Run a decay sweep ──────────────────────────────────
    .post(`${R}/worlds/:worldId/decay`, async (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      const denied = await requireWorldOwner(database, ctx.params.worldId, userId, ctx.userRole,);
      if (denied) { return denied; }
      try {
        return jsonResponse(await decayMemories(database, new Date(),),);
      } catch (error) {
        log().error("Failed to decay NPC memories", error instanceof Error ? error : undefined,);
        return jsonError("Internal server error", 500,);
      }
    }, {
      params: worldParams,
      response: { 200: SuccessResponse, 401: ErrorResponse, 403: ErrorResponse, },
      detail: {
        summary: "Run the NPC memory decay sweep",
        description: "Decay every NPC memory once and forget what has expired or faded to zero.",
        tags: ["RPG", "NPC Memory",],
      },
    },);
}
