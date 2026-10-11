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
 *
 * Every handler runs behind one shared guard (`withActor`): session auth,
 * actor-ownership access, and LevelServiceError → 400 / anything else → 500.
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

/** Shared response envelope for the mutating progression endpoints. */
const WRITE_RESPONSE = { 200: SuccessResponse, 400: ErrorResponse, 401: ErrorResponse, };

/**
 * Shared Elysia schema for the mutating progression endpoints.
 * @param summary
 * @param description
 * @param body
 */
const writeRoute = (
  summary: string,
  description: string,
  body: Parameters<typeof t.Object>[0],
) => ({
  body: t.Object(body,),
  response: WRITE_RESPONSE,
  detail: { summary, description, tags: ["RPG", "XP",], },
});

/** The six ability scores projected off a character_stats read. */
function abilityScores(stats: {
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
},) {
  return { str: stats.str, dex: stats.dex, con: stats.con, int: stats.int, wis: stats.wis, cha: stats.cha, };
}

// Elysia's typed handler inference fights the shared-guard shape here; the
// file-wide `any` ctx matches the xp-loot routes pattern.
type RouteCtx = any;

/**
 * @param root0
 * @param root0.database
 * @param prefix
 */
export function progressionRoutes({ database, }: HandlerOpts, prefix = "/api",): Elysia {
  const deps = { database: database, };
  const R = `${prefix}/rpg/progression`;

  /**
   * Shared auth + error envelope for all progression handlers: session
   * auth, actor-ownership access, then LevelServiceError → 400 and any
   * other failure → 500. Keeping this in one place is what keeps the four
   * handlers down to their actual request/response bodies.
   * @param ctx
   * @param handler
   */
  const withActor = async (
    ctx: RouteCtx,
    handler: (actorId: string,) => Promise<unknown>,
  ): Promise<any> => {
    const userId = requireUserId(ctx,);
    if (typeof userId !== "string") { return userId; }
    const access = await requireNsfwActorAccess(database, ctx.params.actorId, ctx,);
    if (typeof access !== "string") { return access; }
    try {
      return await handler(ctx.params.actorId,);
    } catch (error) {
      if (error instanceof LevelServiceError) {
        return jsonError(error.message, 400,);
      }

      log().error("Progression request failed", error instanceof Error ? error : undefined,);
      return jsonError("Internal server error", 500,);
    }
  };

  return (
    new Elysia({ name: "rpg-progression", },)
      // ── Read surface ──────────────────────────────────────
      .get(`${R}/:actorId`, (ctx: RouteCtx,) =>
        withActor(ctx, async (actorId,) => {
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
            abilities: abilityScores(stats,),
            pendingAsi: stats.pendingAsi,
            recentXp: ledger,
          },);
        },), {
        response: { 200: SuccessResponse, 401: ErrorResponse, 404: ErrorResponse, },
        detail: {
          summary: "Get progression state",
          description: "Level, XP, abilities and pending ASI for an actor.",
          tags: ["RPG", "XP",],
        },
      },)
      // ── Award XP through the pipeline ─────────────────────
      .post(
        `${R}/:actorId/award`,
        (ctx: RouteCtx & { body: { amount: number; source: string; description?: string; chatId?: string } },) =>
          withActor(ctx, async (actorId,) => {
            const body = ctx.body;
            return jsonResponse(
              await awardXpToActor(database, {
                actorId,
                amount: body.amount,
                source: body.source,
                description: body.description,
                chatId: body.chatId,
              },),
            );
          },),
        {
          ...writeRoute(
            "Award XP",
            "Grant XP through the LevelService (level-up, HP, growth, ASI staging).",
            {
              amount: t.Number(),
              source: t.String(),
              description: t.Optional(t.String(),),
              chatId: t.Optional(t.String(),),
            },
          ),
        },
      )
      // ── Allocate pending ASI ──────────────────────────────
      .post(
        `${R}/:actorId/asi`,
        (ctx: RouteCtx & { body: { ability: string; points?: number } },) =>
          withActor(ctx, async (actorId,) => {
            const { ability, points, } = ctx.body;
            if (!ABILITY_VALUES.includes(ability as never,)) {
              return jsonError(`Unknown ability '${ability}'`, 400,);
            }

            return jsonResponse(
              await allocateAsi(database, {
                actorId,
                ability: ability as (typeof ABILITY_VALUES)[number],
                points,
              },),
            );
          },),
        {
          ...writeRoute(
            "Allocate ASI points",
            "Spend pending ability points, clamped to budget and ASI_MAX.",
            {
              ability: t.String(),
              points: t.Optional(t.Number(),),
            },
          ),
        },
      )
      // ── Resolve pending level-up ──────────────────────────
      .post(
        `${R}/:actorId/level-up`,
        (ctx: RouteCtx & { body: { kind?: "auto" | "asi"; ability?: string; points?: number } },) =>
          withActor(ctx, async (actorId,) => {
            const body = ctx.body;
            let choice: LevelUpChoice | undefined;
            if (body.kind === "asi") {
              if (!body.ability || !ABILITY_VALUES.includes(body.ability as never,)) {
                return jsonError(`Unknown ability '${body.ability}'`, 400,);
              }

              choice = { kind: "asi", ability: body.ability as (typeof ABILITY_VALUES)[number], points: body.points, };
            }

            return jsonResponse(await resolveLevelUpDecision(database, actorId, choice,),);
          },),
        {
          ...writeRoute(
            "Resolve level-up decision",
            "Spend the pending ASI budget explicitly or via affinity auto-allocation.",
            {
              kind: t.Optional(t.Union([t.Literal("auto",), t.Literal("asi",),],),),
              ability: t.Optional(t.String(),),
              points: t.Optional(t.Number(),),
            },
          ),
        },
      )
  );
}
