// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Progression routes (FEAT-progression-api) — the character XP/level/stat
 * surface in world context, reading real `character_stats` through the
 * LevelService pipeline.
 *
 *   GET  /api/rpg/progression/:actorId               — level/xp/xp_to_next + pending ASI + recent ledger
 *   POST /api/rpg/progression/:actorId/award         — award XP through the LevelService pipeline
 *   POST /api/rpg/progression/:actorId/asi           — allocate pending ASI points
 *   POST /api/rpg/progression/:actorId/level-up      — resolve a pending level-up decision
 */
import { Elysia, t, } from "elysia";
import {
  allocateAsi,
  awardXpToActor,
  type LevelUpChoice,
  resolveLevelUpDecision,
} from "../../rpg/level";
import { LevelServiceError, } from "../../rpg/level/types.js";
import { getCharacterStats, } from "../../rpg/service/character-stats.js";
import { getXpHistory, } from "../../rpg/service/xp.js";
import { ErrorResponse, SuccessResponse, } from "../../validation/schemas";
import { jsonError, jsonResponse, requireUserId, } from "../http-utils";
import { requireNsfwActorAccess, } from "../nsfw/shared";
import { log, } from "./log";
import type { HandlerOpts, } from "./types";

const ABILITY_VALUES = ["str", "dex", "con", "int", "wis", "cha",] as const;

/**
 * @param root0
 * @param root0.database
 * @param prefix
 */
export function progressionRoutes({ database, }: HandlerOpts, prefix = "/api",): Elysia {
  const deps = { database: database, };
  const R = `${prefix}/rpg/progression`;

  const toServiceError = (error: unknown,) => {
    if (error instanceof LevelServiceError) {
      return jsonError(error.message, 400,);
    }

    log().error("Progression request failed", error instanceof Error ? error : undefined,);
    return jsonError("Internal server error", 500,);
  };

  return (
    new Elysia({ name: "rpg-progression", },)
      // ── Read surface ──────────────────────────────────────
      .get(`${R}/:actorId`, async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const access = await requireNsfwActorAccess(database, ctx.params.actorId, ctx,);
        if (typeof access !== "string") { return access; }
        try {
          const actorId = ctx.params.actorId as string;
          const stats = await getCharacterStats(deps, actorId,);
          if (!stats) { return jsonError("No character stats for actor", 404,); }
          const ledger = await getXpHistory(deps, actorId, 10,);
          return jsonResponse({
            actorId,
            level: stats.level,
            xp: stats.xp,
            xpToNext: stats.xpToNext,
            hp: stats.hp,
            maxHp: stats.maxHp,
            abilities: {
              str: stats.str,
              dex: stats.dex,
              con: stats.con,
              int: stats.int,
              wis: stats.wis,
              cha: stats.cha,
            },
            pendingAsi: stats.pendingAsi,
            recentXp: ledger,
          },);
        } catch (error) {
          return toServiceError(error,);
        }
      }, {
        response: { 200: SuccessResponse, 401: ErrorResponse, 404: ErrorResponse, },
        detail: {
          summary: "Get progression state",
          description: "Level, XP, abilities and pending ASI for an actor.",
          tags: ["RPG", "XP",],
        },
      },)
      // ── Award XP through the pipeline ─────────────────────
      .post(`${R}/:actorId/award`, async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const access = await requireNsfwActorAccess(database, ctx.params.actorId, ctx,);
        if (typeof access !== "string") { return access; }
        try {
          const body = ctx.body as { amount: number; source: string; description?: string; chatId?: string };
          const result = await awardXpToActor(database, {
            actorId: ctx.params.actorId as string,
            amount: body.amount,
            source: body.source,
            description: body.description,
            chatId: body.chatId,
          },);

          return jsonResponse(result,);
        } catch (error) {
          return toServiceError(error,);
        }
      }, {
        body: t.Object({
          amount: t.Number(),
          source: t.String(),
          description: t.Optional(t.String(),),
          chatId: t.Optional(t.String(),),
        },),
        response: { 200: SuccessResponse, 400: ErrorResponse, 401: ErrorResponse, },
        detail: {
          summary: "Award XP",
          description: "Grant XP through the LevelService (level-up, HP, growth, ASI staging).",
          tags: ["RPG", "XP",],
        },
      },)
      // ── Allocate pending ASI ──────────────────────────────
      .post(`${R}/:actorId/asi`, async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const access = await requireNsfwActorAccess(database, ctx.params.actorId, ctx,);
        if (typeof access !== "string") { return access; }
        try {
          const body = ctx.body as { ability: string; points?: number };
          if (!ABILITY_VALUES.includes(body.ability as never,)) {
            return jsonError(`Unknown ability '${body.ability}'`, 400,);
          }

          const result = await allocateAsi(database, {
            actorId: ctx.params.actorId as string,
            ability: body.ability as (typeof ABILITY_VALUES)[number],
            points: body.points,
          },);

          return jsonResponse(result,);
        } catch (error) {
          return toServiceError(error,);
        }
      }, {
        body: t.Object({
          ability: t.String(),
          points: t.Optional(t.Number(),),
        },),
        response: { 200: SuccessResponse, 400: ErrorResponse, 401: ErrorResponse, },
        detail: {
          summary: "Allocate ASI points",
          description: "Spend pending ability points, clamped to budget and ASI_MAX.",
          tags: ["RPG", "XP",],
        },
      },)
      // ── Resolve pending level-up ──────────────────────────
      .post(`${R}/:actorId/level-up`, async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const access = await requireNsfwActorAccess(database, ctx.params.actorId, ctx,);
        if (typeof access !== "string") { return access; }
        try {
          const body = ctx.body as {
            kind?: "auto" | "asi";
            ability?: string;
            points?: number;
          };

          let choice: LevelUpChoice | undefined;
          if (body.kind === "asi") {
            if (!body.ability || !ABILITY_VALUES.includes(body.ability as never,)) {
              return jsonError(`Unknown ability '${body.ability}'`, 400,);
            }

            choice = { kind: "asi", ability: body.ability as (typeof ABILITY_VALUES)[number], points: body.points, };
          }

          const result = await resolveLevelUpDecision(database, ctx.params.actorId as string, choice,);
          return jsonResponse(result,);
        } catch (error) {
          return toServiceError(error,);
        }
      }, {
        body: t.Object({
          kind: t.Optional(t.Union([t.Literal("auto",), t.Literal("asi",),],),),
          ability: t.Optional(t.String(),),
          points: t.Optional(t.Number(),),
        },),
        response: { 200: SuccessResponse, 400: ErrorResponse, 401: ErrorResponse, },
        detail: {
          summary: "Resolve level-up decision",
          description: "Spend the pending ASI budget explicitly or via affinity auto-allocation.",
          tags: ["RPG", "XP",],
        },
      },)
  );
}
