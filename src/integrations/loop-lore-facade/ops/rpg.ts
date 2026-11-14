// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/integrations/loop-lore-facade/ops/rpg.ts — facade ops over a
// character's RPG state (harness parity gap #6: rpg had no facade op).
//
// SECURITY: READ-ONLY by construction — the ops never roll, spend, award or
// advance anything, they only report the state the repo already stores
// (character_stats / actor_items / actor_locations). The character must
// belong to the CALLING user (the repo's owner_id / user_id links), so
// another user's character is a 404, never its state.

import { type Static, } from "@sinclair/typebox";
import { Value, } from "@sinclair/typebox/value";
import { t, } from "elysia";
import type { Kysely, } from "kysely";
import { chatPolicy, } from "../../../api-governance/rate-limiting/policies";
import type { Config, } from "../../../config/schema";
import type { DB, } from "../../../db/schema";
import { getCharacterStats, } from "../../../rpg/service/character-stats";
import { type FacadeRegistry, } from "../registry";
import type { FacadeContext, FacadeOp, FacadeOutputSchema, FacadeResult, } from "../types";
import { badBodyResult, callerIdentity, callerOwnsActor, notFoundResult, READ_ONLY_ANNOTATIONS, } from "./shared";

/** Shared registration deps — the same shape the other op modules carry. */
export interface RpgFacadeDeps {
  database: Kysely<DB>;
  config: Config;
}

/** The actor id every rpg op addresses. */
export const RpgActorBody = t.Object({ actorId: t.String({ minLength: 1, },), },);

/** The ability scores rpg.stats reports. */
const ABILITY_PROPERTIES = {
  str: { type: "number", },
  dex: { type: "number", },
  con: { type: "number", },
  int: { type: "number", },
  wis: { type: "number", },
  cha: { type: "number", },
};

/** The place rpg.location reports (an id and its name). */
const PLACE_PROPERTIES = { id: { type: "string", }, name: { type: "string", }, };

/** The inventory rows rpg.inventory reports. */
const INVENTORY_ITEM_PROPERTIES = {
  id: { type: "string", },
  name: { type: "string", },
  itemType: { type: "string", },
  quantity: { type: "number", },
  equipped: { type: "string", },
};

/** rpg.stats' structured result: the character's combat/progression state. */
export const RpgStatsOutputSchema: FacadeOutputSchema = {
  type: "object",
  properties: {
    level: { type: "number", },
    hp: { type: "number", },
    maxHp: { type: "number", },
    tempHp: { type: "number", },
    mp: { type: "number", },
    maxMp: { type: "number", },
    ac: { type: "number", },
    speed: { type: "number", },
    abilities: { type: "object", properties: ABILITY_PROPERTIES, },
    xp: { type: "number", },
    xpToNext: { type: "number", },
    characterState: { type: "string", },
  },
  required: ["level", "hp", "maxHp", "abilities", "characterState",],
};

/** rpg.inventory's structured result: the items + the total count. */
export const RpgInventoryOutputSchema: FacadeOutputSchema = {
  type: "object",
  properties: {
    data: { type: "array", items: { type: "object", properties: INVENTORY_ITEM_PROPERTIES, }, },
    total: { type: "number", },
  },
  required: ["data", "total",],
};

/** rpg.location's structured result: the character's two locations. */
export const RpgLocationOutputSchema: FacadeOutputSchema = {
  type: "object",
  properties: {
    physical: { type: "object", properties: PLACE_PROPERTIES, },
    spatial: { type: "object", properties: PLACE_PROPERTIES, },
    enteredAt: { type: "string", },
  },
  required: ["physical", "spatial", "enteredAt",],
};

/**
 * Register the rpg ops on a registry.
 * @param registry - the facade registry
 * @param deps - database/config the ops read through
 * @throws {Error} when an op name collides on registration
 */
export function registerRpgOps(registry: FacadeRegistry, deps: RpgFacadeDeps,): void {
  const { database, } = deps;

  const ops: FacadeOp[] = [
    {
      name: "rpg.stats",
      domain: "rpg",
      summary: "Read a character's RPG stats",
      description: "Level, hp/mp, armour class, speed, the ability scores and the character's " +
        "state — read from the repo's own character_stats row. Read-only: nothing is rolled, " +
        "spent or advanced.",
      scope: "read",
      ratePolicy: chatPolicy,
      bodySchema: RpgActorBody,
      annotations: READ_ONLY_ANNOTATIONS,
      outputSchema: RpgStatsOutputSchema,
      handler: async (ctx: FacadeContext, body: unknown,): Promise<FacadeResult> => {
        if (!Value.Check(RpgActorBody, body,)) { return badBodyResult("rpg.stats",); }
        const parsed = body as Static<typeof RpgActorBody>;
        const { userId, } = callerIdentity(ctx,);

        const owned = await callerOwnsActor({ database, actorId: parsed.actorId, userId, },);
        if (!owned) { return notFoundResult("character not found",); }

        const stats = await getCharacterStats({ database, }, parsed.actorId,);
        if (!stats) { return notFoundResult("character stats not found",); }

        return {
          ok: true,
          status: 200,
          json: {
            level: stats.level,
            hp: stats.hp,
            maxHp: stats.maxHp,
            tempHp: stats.tempHp,
            mp: stats.mp,
            maxMp: stats.maxMp,
            ac: stats.ac,
            speed: stats.speed,
            abilities: {
              str: stats.str,
              dex: stats.dex,
              con: stats.con,
              int: stats.int,
              wis: stats.wis,
              cha: stats.cha,
            },
            xp: stats.xp,
            xpToNext: stats.xpToNext,
            characterState: stats.characterState,
          },
        };
      },
    },
    {
      name: "rpg.inventory",
      domain: "rpg",
      summary: "Read a character's inventory",
      description: "The items the character carries (name, type, quantity, equipped state) — " +
        "read from the repo's own actor_items rows. Read-only: nothing is added, removed or " +
        "equipped.",
      scope: "read",
      ratePolicy: chatPolicy,
      bodySchema: RpgActorBody,
      annotations: READ_ONLY_ANNOTATIONS,
      outputSchema: RpgInventoryOutputSchema,
      handler: async (ctx: FacadeContext, body: unknown,): Promise<FacadeResult> => {
        if (!Value.Check(RpgActorBody, body,)) { return badBodyResult("rpg.inventory",); }
        const parsed = body as Static<typeof RpgActorBody>;
        const { userId, } = callerIdentity(ctx,);

        const owned = await callerOwnsActor({ database, actorId: parsed.actorId, userId, },);
        if (!owned) { return notFoundResult("character not found",); }

        const rows = await database
          .selectFrom("actor_items",)
          .select(["id", "name", "item_type", "quantity", "equipped",],)
          .where("actor_id", "=", parsed.actorId,)
          .orderBy("sort_order", "asc",)
          .orderBy("id", "asc",)
          .limit(200,)
          .execute();

        const data = rows.map((row,) => ({
          id: row.id,
          name: row.name,
          itemType: row.item_type,
          quantity: row.quantity,
          equipped: row.equipped,
        }));

        return { ok: true, status: 200, json: { data, total: data.length, }, };
      },
    },
    {
      name: "rpg.location",
      domain: "rpg",
      summary: "Read a character's current location",
      description: "The character's physical and spatial location (ids + names) — read from the " +
        "repo's own actor_locations row. Read-only: the character never moves.",
      scope: "read",
      ratePolicy: chatPolicy,
      bodySchema: RpgActorBody,
      annotations: READ_ONLY_ANNOTATIONS,
      outputSchema: RpgLocationOutputSchema,
      handler: async (ctx: FacadeContext, body: unknown,): Promise<FacadeResult> => {
        if (!Value.Check(RpgActorBody, body,)) { return badBodyResult("rpg.location",); }
        const parsed = body as Static<typeof RpgActorBody>;
        const { userId, } = callerIdentity(ctx,);

        const owned = await callerOwnsActor({ database, actorId: parsed.actorId, userId, },);
        if (!owned) { return notFoundResult("character not found",); }

        const row = await database
          .selectFrom("actor_locations",)
          .select(["physical_location_id", "spatial_location_id", "entered_at",],)
          .where("actor_id", "=", parsed.actorId,)
          .executeTakeFirst();

        if (!row) { return notFoundResult("actor location not found",); }

        const places = await database
          .selectFrom("locations",)
          .select(["id", "name",],)
          .where("id", "in", [row.physical_location_id, row.spatial_location_id,],)
          .execute();

        const nameOf = (id: string,): string | null => places.find((place,) => place.id === id)?.name ?? null;

        return {
          ok: true,
          status: 200,
          json: {
            physical: { id: row.physical_location_id, name: nameOf(row.physical_location_id,), },
            spatial: { id: row.spatial_location_id, name: nameOf(row.spatial_location_id,), },
            enteredAt: row.entered_at,
          },
        };
      },
    },
  ];

  for (const op of ops) {
    const registered = registry.register(op,);
    if (!registered.ok) {
      throw new Error(registered.message,);
    }
  }
}
