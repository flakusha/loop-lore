// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Combat request/response body schemas (Elysia `t`).
 *
 * Shared by `combat.ts` (resolution endpoints) and `combat-status.ts`
 * (status/action-economy endpoints).
 */
import { t, } from "elysia";

export const AbilitySchema = t.Union([
  t.Literal("str",),
  t.Literal("dex",),
  t.Literal("con",),
  t.Literal("int",),
  t.Literal("wis",),
  t.Literal("cha",),
],);

export const DiceSidesSchema = t.Union([
  t.Literal(4,),
  t.Literal(6,),
  t.Literal(8,),
  t.Literal(10,),
  t.Literal(12,),
  t.Literal(20,),
  t.Literal(100,),
],);

export const AdvantageSchema = t.Union([
  t.Literal("normal",),
  t.Literal("advantage",),
  t.Literal("disadvantage",),
],);

export const DamageTypeSchema = t.Union([
  t.Literal("physical",),
  t.Literal("fire",),
  t.Literal("ice",),
  t.Literal("lightning",),
  t.Literal("thunder",),
  t.Literal("poison",),
  t.Literal("acid",),
  t.Literal("psychic",),
  t.Literal("necrotic",),
  t.Literal("radiant",),
  t.Literal("force",),
  t.Literal("healing",),
],);

export const DamageModifierSchema = t.Union([
  t.Literal("resistant",),
  t.Literal("vulnerable",),
  t.Literal("immune",),
],);

export const DamageResistanceSchema = t.Object({
  type: DamageTypeSchema,
  modifier: DamageModifierSchema,
},);

export const CombatantSchema = t.Object({
  id: t.String(),
  name: t.String(),
  hp: t.Number(),
  maxHp: t.Number(),
  ac: t.Number(),
  stats: t.Object({
    str: t.Number(),
    dex: t.Number(),
    con: t.Number(),
    int: t.Number(),
    wis: t.Number(),
    cha: t.Number(),
  },),
  level: t.Number(),
  isNpc: t.Boolean(),
  initiative: t.Number(),
  initiativeMod: t.Number(),
  hasActed: t.Boolean(),
  actions: t.Number(),
  bonusActions: t.Number(),
  reactions: t.Number(),
  conditions: t.Array(t.String(),),
},);

export const InitiativeBody = t.Object({
  combatants: t.Array(CombatantSchema,),
},);

export const AttackBody = t.Object({
  attacker: CombatantSchema,
  target: CombatantSchema,
  attackAbility: t.Union([t.Literal("str",), t.Literal("dex",),],),
  damageDice: t.Number({ minimum: 1, },),
  damageSides: DiceSidesSchema,
  damageType: t.Optional(DamageTypeSchema,),
  extraDamage: t.Optional(t.Number(),),
  resistances: t.Optional(t.Array(DamageResistanceSchema,),),
  advantage: t.Optional(AdvantageSchema,),
},);

export const SaveBody = t.Object({
  combatant: CombatantSchema,
  ability: AbilitySchema,
  dc: t.Number(),
  advantage: t.Optional(AdvantageSchema,),
},);

export const DamageBody = t.Object({
  combatant: CombatantSchema,
  amount: t.Number({ minimum: 0, },),
},);

export const HealBody = t.Object({
  combatant: CombatantSchema,
  amount: t.Number({ minimum: 0, },),
},);

export const StatusBody = t.Object({
  combatants: t.Array(CombatantSchema,),
},);

export const ActionBody = t.Object({
  combatant: CombatantSchema,
  type: t.String(),
  consume: t.Optional(t.Boolean(),),
},);

export const InitCombatantBody = t.Object({
  id: t.String(),
  name: t.String(),
  stats: t.Object({
    str: t.Number(),
    dex: t.Number(),
    con: t.Number(),
    int: t.Number(),
    wis: t.Number(),
    cha: t.Number(),
  },),
  level: t.Number(),
  hp: t.Number(),
  ac: t.Number(),
  isNpc: t.Boolean(),
},);
