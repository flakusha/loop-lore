// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * XP & Loot Routes.
 *
 * XP: pure level/calculation endpoints plus XP ledger persistence.
 * Loot: generation, persistence, and loot-table management.
 *
 *   XP:
 *     POST /api/rpg/xp/award   — log XP + report level-up
 *     GET  /api/rpg/xp/history — XP ledger history for an actor
 *     POST /api/rpg/xp/level   — compute level from XP
 *     POST /api/rpg/xp/next    — XP needed to reach next level
 *
 *   Loot:
 *     POST /api/rpg/loot/generate — generate loot from entries
 *     POST /api/rpg/loot/persist  — persist generated loot to world_items
 *     POST /api/rpg/loot/tables   — create a loot table
 *     POST /api/rpg/loot/tables/:id/entries — add an entry
 *     POST /api/rpg/loot/tables/:id/roll   — roll a loot table
 */
import { Elysia, t, } from "elysia";
import { generateLoot, type LootEntry, type LootResult, persistLoot, } from "../../rpg/loot";
import { getXpHistory, logXp, } from "../../rpg/service/xp";
import { awardXp, levelFromXp, xpToNextLevel, } from "../../rpg/xp";
import { ErrorResponse, SuccessResponse, } from "../../validation/schemas";
import { jsonError, jsonResponse, requireUserId, } from "../http-utils";
import { log, } from "./log";
import type { HandlerOpts, } from "./types";
import { AwardBody, GenerateBody, LevelBody, NextBody, PersistBody, } from "./xp-loot-schemas";

/* eslint-disable unicorn/max-nested-calls -- Elysia TypeBox schema nesting is inherent to framework */
export function xpLootRoutes({ database, }: HandlerOpts, prefix = "/api",): Elysia {
  const deps = { database: database, };
  const R = `${prefix}/rpg`;

  return (
    new Elysia({ name: "rpg-xp-loot", },)
      // ── XP: award ──────────────────────────────────────────
      .post(`${R}/xp/award`, async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        try {
          const body = ctx.body as {
            actorId: string;
            amount: number;
            source: string;
            description?: string;
            referenceId?: string;
            chatId?: string;
            currentLevel?: number;
            currentXp?: number;
          };
          const ledgerId = await logXp(deps, {
            actorId: body.actorId,
            amount: body.amount,
            source: body.source,
            description: body.description,
            referenceId: body.referenceId,
            chatId: body.chatId,
          },);
          const level = body.currentLevel ?? 1;
          const xp = body.currentXp ?? 0;
          const result = awardXp(level, xp, body.amount,);
          return jsonResponse({ ledgerId, ...result, },);
        } catch (error) {
          log().error("Failed to award XP", error instanceof Error ? error : undefined,);
          return jsonError("Internal server error", 500,);
        }
      }, {
        body: AwardBody,
        response: { 200: SuccessResponse, 401: ErrorResponse, },
        detail: {
          summary: "Award XP",
          description: "Log XP to the ledger and report level-up calculation.",
          tags: ["RPG", "XP",],
        },
      },)
      // ── XP: history ────────────────────────────────────────
      .get(`${R}/xp/history`, async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        try {
          const { actorId, limit, } = ctx.query as { actorId?: string; limit?: string };
          if (!actorId) { return jsonError("actorId query param required", 400,); }
          const rows = await getXpHistory(deps, actorId, limit ? Number(limit,) : 50,);
          return jsonResponse({ entries: rows, },);
        } catch (error) {
          log().error("Failed to fetch XP history", error instanceof Error ? error : undefined,);
          return jsonError("Internal server error", 500,);
        }
      }, {
        query: t.Object({
          actorId: t.String(),
          limit: t.Optional(t.String(),),
        },),
        response: { 200: SuccessResponse, 401: ErrorResponse, },
        detail: {
          summary: "Get XP history",
          description: "Fetch XP ledger entries for an actor.",
          tags: ["RPG", "XP",],
        },
      },)
      // ── XP: level ──────────────────────────────────────────
      .post(`${R}/xp/level`, (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        try {
          const body = ctx.body as { xp: number };
          return jsonResponse({ level: levelFromXp(body.xp,), },);
        } catch (error) {
          log().error("Failed to compute level", error instanceof Error ? error : undefined,);
          return jsonError("Internal server error", 500,);
        }
      }, {
        body: LevelBody,
        response: { 200: SuccessResponse, 401: ErrorResponse, },
        detail: {
          summary: "Compute level from XP",
          description: "Return the highest level achievable with the given total XP.",
          tags: ["RPG", "XP",],
        },
      },)
      // ── XP: next level ─────────────────────────────────────
      .post(`${R}/xp/next`, (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        try {
          const body = ctx.body as { currentLevel: number; currentXp: number };
          const needed = xpToNextLevel(body.currentLevel, body.currentXp,);
          return jsonResponse({ xpToNextLevel: needed, },);
        } catch (error) {
          log().error("Failed to compute next level", error instanceof Error ? error : undefined,);
          return jsonError("Internal server error", 500,);
        }
      }, {
        body: NextBody,
        response: { 200: SuccessResponse, 401: ErrorResponse, },
        detail: {
          summary: "XP to next level",
          description: "Return XP needed to advance from the current level.",
          tags: ["RPG", "XP",],
        },
      },)
      // ── Loot: generate ─────────────────────────────────────
      .post(`${R}/loot/generate`, (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        try {
          const body = ctx.body as {
            entries: LootEntry[];
            level: number;
            dropCount?: number;
            luckModifier?: number;
          };
          const result = generateLoot(body.entries, body.level, body.dropCount ?? 1, body.luckModifier ?? 0,);
          return jsonResponse(result,);
        } catch (error) {
          log().error("Failed to generate loot", error instanceof Error ? error : undefined,);
          return jsonError("Internal server error", 500,);
        }
      }, {
        body: GenerateBody,
        response: { 200: SuccessResponse, 401: ErrorResponse, },
        detail: {
          summary: "Generate loot",
          description: "Generate loot from a set of loot-table entries.",
          tags: ["RPG", "Loot",],
        },
      },)
      // ── Loot: persist ──────────────────────────────────────
      .post(`${R}/loot/persist`, async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        try {
          const body = ctx.body as {
            result: LootResult;
            worldId: string;
            actorId?: string;
            locationId?: string;
            defaultCategory?: string;
          };
          const persisted = await persistLoot(database, body.result, {
            worldId: body.worldId,
            actorId: body.actorId,
            locationId: body.locationId,
            defaultCategory: body.defaultCategory as any,
          },);
          return jsonResponse(persisted,);
        } catch (error) {
          log().error("Failed to persist loot", error instanceof Error ? error : undefined,);
          return jsonError("Internal server error", 500,);
        }
      }, {
        body: PersistBody,
        response: { 200: SuccessResponse, 401: ErrorResponse, },
        detail: {
          summary: "Persist loot",
          description: "Turn generated loot into world_items instances.",
          tags: ["RPG", "Loot",],
        },
      },)
  );
}
