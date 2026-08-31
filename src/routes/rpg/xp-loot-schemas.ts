// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * XP & Loot request/response body schemas (Elysia `t`).
 *
 * Shared by `xp-loot.ts` (xp + loot generation) and `xp-loot-tables.ts`
 * (loot-table management).
 */
import { t, } from "elysia";

export const RaritySchema = t.Union([
  t.Literal("common",),
  t.Literal("uncommon",),
  t.Literal("rare",),
  t.Literal("epic",),
  t.Literal("legendary",),
  t.Literal("artifact",),
],);

export const LootEntrySchema = t.Object({
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

export const AwardBody = t.Object({
  actorId: t.String(),
  amount: t.Number(),
  source: t.String(),
  description: t.Optional(t.String(),),
  referenceId: t.Optional(t.String(),),
  chatId: t.Optional(t.String(),),
  currentLevel: t.Optional(t.Number(),),
  currentXp: t.Optional(t.Number(),),
},);

export const LevelBody = t.Object({
  xp: t.Number(),
},);

export const NextBody = t.Object({
  currentLevel: t.Number(),
  currentXp: t.Number(),
},);

export const GenerateBody = t.Object({
  entries: t.Array(LootEntrySchema,),
  level: t.Number(),
  dropCount: t.Optional(t.Number(),),
  luckModifier: t.Optional(t.Number(),),
},);

export const PersistBody = t.Object({
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

export const CreateTableBody = t.Object({
  name: t.String(),
  sourceType: t.String(),
  sourceId: t.Optional(t.String(),),
},);

export const AddEntryBody = t.Object({
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
