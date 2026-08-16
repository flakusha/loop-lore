// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { t, } from "elysia";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";

export interface HandlerOpts {
  database: Kysely<DB>;
  config: Config;
}

// ── Body schemas (TypeBox) ─────────────────────────────────

export const DiceSidesSchema = t.Union([
  t.Literal(4,),
  t.Literal(6,),
  t.Literal(8,),
  t.Literal(10,),
  t.Literal(12,),
  t.Literal(20,),
  t.Literal(100,),
],);

export const AdvantageModeSchema = t.Union([
  t.Literal("normal",),
  t.Literal("advantage",),
  t.Literal("disadvantage",),
],);

export const StatBlockSchema = t.Object({
  str: t.Number(),
  dex: t.Number(),
  con: t.Number(),
  int: t.Number(),
  wis: t.Number(),
  cha: t.Number(),
},);

export const DiceRollBody = t.Object({
  sides: DiceSidesSchema,
  count: t.Optional(t.Number({ minimum: 1, },),),
  modifier: t.Optional(t.Number(),),
  exploding: t.Optional(t.Boolean(),),
},);

export const DiceNotationBody = t.Object({
  notation: t.String({ minLength: 1, },),
},);

export const DiceAdvantageBody = t.Object({
  modifier: t.Optional(t.Number(),),
  advantage: t.Optional(AdvantageModeSchema,),
},);

export const StatsBody = t.Object({
  stats: StatBlockSchema,
},);

export const AbilityNameSchema = t.Union([
  t.Literal("str",),
  t.Literal("dex",),
  t.Literal("con",),
  t.Literal("int",),
  t.Literal("wis",),
  t.Literal("cha",),
],);

export const StatsGenerateBody = t.Object({
  method: t.Union([
    t.Literal("point_buy",),
    t.Literal("4d6_drop_lowest",),
    t.Literal("standard_array",),
  ],),
  /* eslint-disable unicorn/max-nested-calls -- Elysia TypeBox schema nesting is inherent to framework */
  allocation: t.Optional(t.Record(AbilityNameSchema, t.Number(),),),
  /* eslint-enable unicorn/max-nested-calls */
},);
