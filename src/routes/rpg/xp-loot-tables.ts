// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Loot-table management routes (create/add-entry/roll).
 *
 * Split from `xp-loot.ts` to keep both files under the 250-line ceiling.
 */
import { Elysia, t, } from "elysia";
import { addLootEntry, createLootTable, rollLootTable, } from "../../rpg/service/loot-tables";
import { ErrorResponse, SuccessResponse, } from "../../validation/schemas";
import { jsonError, jsonResponse, notFoundResponse, requireUserId, } from "../http-utils";
import { log, } from "./log";
import type { HandlerOpts, } from "./types";
import { AddEntryBody, CreateTableBody, } from "./xp-loot-schemas";

export function xpLootTablesRoutes({ database, }: HandlerOpts, prefix = "/api",): Elysia {
  const deps = { database, };
  const R = `${prefix}/rpg`;

  return (
    new Elysia({ name: "rpg-xp-loot-tables", },)
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
