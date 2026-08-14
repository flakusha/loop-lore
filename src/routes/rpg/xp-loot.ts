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
import { addLootEntry, createLootTable, rollLootTable, } from "../../rpg/service/loot-tables";
import { getXpHistory, logXp, } from "../../rpg/service/xp";
import { awardXp, levelFromXp, xpToNextLevel, } from "../../rpg/xp";
import { ErrorResponse, SuccessResponse, } from "../../validation/schemas";
import { jsonError, jsonResponse, notFoundResponse, requireUserId, } from "../http-utils";
import { log, } from "./log";
import type { HandlerOpts, } from "./types";

/* eslint-disable unicorn/max-nested-calls -- Elysia TypeBox schema nesting is inherent to framework */
const RaritySchema = t.Union([
  t.Literal("common",),
  t.Literal("uncommon",),
  t.Literal("rare",),
  t.Literal("epic",),
  t.Literal("legendary",),
  t.Literal("artifact",),
],);

const LootEntrySchema = t.Object({
  name: t.String(),
  description: t.String(),
  type: t.String(),
  rarity: RaritySchema,
  itemId: t.Optional(t.String(),),
  weight: t.Number(),
  minQuantity: t.Number(),
  maxQuantity: t.Number(),
  minLevel: t.Number(),
  goldValue: t.Number(),
  metadata: t.Optional(t.Record(t.String(), t.Unknown(),),),
},);

const AwardBody = t.Object({
  actorId: t.String(),
  amount: t.Number(),
  source: t.String(),
  description: t.Optional(t.String(),),
  referenceId: t.Optional(t.String(),),
  chatId: t.Optional(t.String(),),
  currentLevel: t.Optional(t.Number(),),
  currentXp: t.Optional(t.Number(),),
},);

const LevelBody = t.Object({
  xp: t.Number(),
},);

const NextBody = t.Object({
  currentLevel: t.Number(),
  currentXp: t.Number(),
},);

const GenerateBody = t.Object({
  entries: t.Array(LootEntrySchema,),
  level: t.Number(),
  dropCount: t.Optional(t.Number(),),
  luckModifier: t.Optional(t.Number(),),
},);

const PersistBody = t.Object({
  result: t.Object({
    drops: t.Array(t.Object({
      name: t.String(),
      description: t.String(),
      type: t.String(),
      rarity: RaritySchema,
      itemId: t.Optional(t.String(),),
      quantity: t.Number(),
      goldValue: t.Number(),
      totalGoldValue: t.Number(),
      metadata: t.Optional(t.Record(t.String(), t.Unknown(),),),
    },),),
    totalGoldValue: t.Number(),
    hasRareDrop: t.Boolean(),
    worldItemIds: t.Array(t.String(),),
  },),
  worldId: t.String(),
  actorId: t.Optional(t.String(),),
  locationId: t.Optional(t.String(),),
  defaultCategory: t.Optional(t.String(),),
},);

const CreateTableBody = t.Object({
  name: t.String(),
  sourceType: t.String(),
  sourceId: t.Optional(t.String(),),
},);

const AddEntryBody = t.Object({
  itemName: t.String(),
  description: t.Optional(t.String(),),
  itemType: t.String(),
  rarity: t.String(),
  weight: t.Number(),
  minQuantity: t.Optional(t.Number(),),
  maxQuantity: t.Optional(t.Number(),),
  minLevel: t.Optional(t.Number(),),
  metadata: t.Optional(t.Record(t.String(), t.Unknown(),),),
},);

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
      // ── Loot: create table ─────────────────────────────────
      .post(`${R}/loot/tables`, async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        try {
          const body = ctx.body as { name: string; sourceType: string; sourceId?: string };
          const id = await createLootTable(deps, {
            name: body.name,
            sourceType: body.sourceType,
            sourceId: body.sourceId,
          },);
          return jsonResponse({ id, },);
        } catch (error) {
          log().error("Failed to create loot table", error instanceof Error ? error : undefined,);
          return jsonError("Internal server error", 500,);
        }
      }, {
        body: CreateTableBody,
        response: { 200: SuccessResponse, 401: ErrorResponse, },
        detail: {
          summary: "Create loot table",
          description: "Create a loot table definition.",
          tags: ["RPG", "Loot",],
        },
      },)
      // ── Loot: add entry ────────────────────────────────────
      .post(`${R}/loot/tables/:id/entries`, async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        try {
          const body = ctx.body as {
            itemName: string;
            description?: string;
            itemType: string;
            rarity: string;
            weight: number;
            minQuantity?: number;
            maxQuantity?: number;
            minLevel?: number;
            metadata?: Record<string, unknown>;
          };
          const id = await addLootEntry(deps, {
            lootTableId: ctx.params.id,
            itemName: body.itemName,
            description: body.description,
            itemType: body.itemType,
            rarity: body.rarity,
            weight: body.weight,
            minQuantity: body.minQuantity,
            maxQuantity: body.maxQuantity,
            minLevel: body.minLevel,
            metadata: body.metadata,
          },);
          return jsonResponse({ id, },);
        } catch (error) {
          log().error("Failed to add loot entry", error instanceof Error ? error : undefined,);
          return jsonError("Internal server error", 500,);
        }
      }, {
        params: t.Object({ id: t.String(), },),
        body: AddEntryBody,
        response: { 200: SuccessResponse, 401: ErrorResponse, },
        detail: {
          summary: "Add loot entry",
          description: "Add a weighted entry to a loot table.",
          tags: ["RPG", "Loot",],
        },
      },)
      // ── Loot: roll table ───────────────────────────────────
      .post(`${R}/loot/tables/:id/roll`, async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        try {
          const result = await rollLootTable(deps, ctx.params.id,);
          if (!result) { return notFoundResponse("Loot table",); }
          return jsonResponse(result,);
        } catch (error) {
          log().error("Failed to roll loot table", error instanceof Error ? error : undefined,);
          return jsonError("Internal server error", 500,);
        }
      }, {
        params: t.Object({ id: t.String(), },),
        response: { 200: SuccessResponse, 401: ErrorResponse, 404: ErrorResponse, },
        detail: {
          summary: "Roll loot table",
          description: "Weighted-randomly select an entry from a loot table.",
          tags: ["RPG", "Loot",],
        },
      },)
  );
}
