/**
 * Combat Routes — stateless resolution endpoints backed by the pure combat
 * engine (src/rpg/combat). No DB persistence; every request resolves a
 * self-contained combat action.
 *
 *   POST /api/rpg/combat/initiative — roll + sort initiative for combatants
 *   POST /api/rpg/combat/attack     — resolve an attack roll + damage
 *   POST /api/rpg/combat/save       — make a saving throw
 *   POST /api/rpg/combat/damage     — apply damage to a combatant
 *   POST /api/rpg/combat/heal       — heal a combatant
 *   POST /api/rpg/combat/status     — evaluate combat/combatant status
 *   POST /api/rpg/combat/action     — check/consume an action from a combatant
 */
import { Elysia, t, } from "elysia";
import {
  type ActionType,
  applyDamage,
  canTakeAction,
  type Combatant,
  consumeAction,
  healCombatant,
  initCombatant,
  isCombatOver,
  isDead,
  isIncapacitated,
  makeAttackRoll,
  makeSavingThrow,
  resetRoundReactions,
  resetTurnActions,
  rollInitiative,
  sortByInitiative,
} from "../../rpg/combat";
import type { AdvantageMode, DiceSides, } from "../../rpg/dice";
import { ErrorResponse, SuccessResponse, } from "../../validation/schemas";
import { jsonError, jsonResponse, requireUserId, } from "../http-utils";
import { log, } from "./log";
import type { HandlerOpts, } from "./types";

const AbilitySchema = t.Union([
  t.Literal("str",),
  t.Literal("dex",),
  t.Literal("con",),
  t.Literal("int",),
  t.Literal("wis",),
  t.Literal("cha",),
],);

const DiceSidesSchema = t.Union([
  t.Literal(4,),
  t.Literal(6,),
  t.Literal(8,),
  t.Literal(10,),
  t.Literal(12,),
  t.Literal(20,),
  t.Literal(100,),
],);

const AdvantageSchema = t.Union([
  t.Literal("normal",),
  t.Literal("advantage",),
  t.Literal("disadvantage",),
],);

const DamageTypeSchema = t.Union([
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

const DamageModifierSchema = t.Union([
  t.Literal("resistant",),
  t.Literal("vulnerable",),
  t.Literal("immune",),
],);

const DamageResistanceSchema = t.Object({
  type: DamageTypeSchema,
  modifier: DamageModifierSchema,
},);

const CombatantSchema = t.Object({
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

const InitiativeBody = t.Object({
  combatants: t.Array(CombatantSchema,),
},);

const AttackBody = t.Object({
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

const SaveBody = t.Object({
  combatant: CombatantSchema,
  ability: AbilitySchema,
  dc: t.Number(),
  advantage: t.Optional(AdvantageSchema,),
},);

const DamageBody = t.Object({
  combatant: CombatantSchema,
  amount: t.Number({ minimum: 0, },),
},);

const HealBody = t.Object({
  combatant: CombatantSchema,
  amount: t.Number({ minimum: 0, },),
},);

const StatusBody = t.Object({
  combatants: t.Array(CombatantSchema,),
},);

const ActionBody = t.Object({
  combatant: CombatantSchema,
  type: t.String(),
  consume: t.Optional(t.Boolean(),),
},);

const InitCombatantBody = t.Object({
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

export function combatRoutes(_opts: HandlerOpts, prefix = "/api",): Elysia {
  const R = `${prefix}/rpg/combat`;

  return (
    new Elysia({ name: "rpg-combat", },)
      // ── Initiative ─────────────────────────────────────────
      .post(`${R}/initiative`, (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        try {
          const body = ctx.body as { combatants: Combatant[] };
          const withInitiative = Array.from(body.combatants, (c,) => ({
            ...c,
            initiative: rollInitiative(c,).total,
          }),);
          const sorted = sortByInitiative(withInitiative,);
          return jsonResponse({ combatants: sorted, },);
        } catch (error) {
          log().error("Failed to roll initiative", error instanceof Error ? error : undefined,);
          return jsonError("Internal server error", 500,);
        }
      }, {
        body: InitiativeBody,
        response: { 200: SuccessResponse, 401: ErrorResponse, },
        detail: {
          summary: "Roll initiative",
          description: "Roll d20+DEX initiative for each combatant and sort by result.",
          tags: ["RPG", "Combat",],
        },
      },)
      // ── Attack ─────────────────────────────────────────────
      .post(`${R}/attack`, (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        try {
          const body = ctx.body as {
            attacker: Combatant;
            target: Combatant;
            attackAbility: "str" | "dex";
            damageDice: number;
            damageSides: DiceSides;
            damageType?: Combatant["stats"] extends never ? never : string;
            extraDamage?: number;
            resistances?: { type: string; modifier: string }[];
            advantage?: AdvantageMode;
          };
          const result = makeAttackRoll(
            body.attacker,
            body.target,
            body.attackAbility,
            body.damageDice,
            body.damageSides,
            body.damageType as any,
            body.extraDamage ?? 0,
            (body.resistances ?? []) as any,
            body.advantage ?? "normal",
          );
          return jsonResponse(result,);
        } catch (error) {
          log().error("Failed to resolve attack", error instanceof Error ? error : undefined,);
          return jsonError("Internal server error", 500,);
        }
      }, {
        body: AttackBody,
        response: { 200: SuccessResponse, 401: ErrorResponse, },
        detail: {
          summary: "Resolve an attack roll",
          description: "Roll to-hit and damage for an attack against a target.",
          tags: ["RPG", "Combat",],
        },
      },)
      // ── Saving throw ───────────────────────────────────────
      .post(`${R}/save`, (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        try {
          const body = ctx.body as {
            combatant: Combatant;
            ability: "str" | "dex" | "con" | "int" | "wis" | "cha";
            dc: number;
            advantage?: AdvantageMode;
          };
          const result = makeSavingThrow(body.combatant, body.ability, body.dc, body.advantage ?? "normal",);
          return jsonResponse(result,);
        } catch (error) {
          log().error("Failed to resolve saving throw", error instanceof Error ? error : undefined,);
          return jsonError("Internal server error", 500,);
        }
      }, {
        body: SaveBody,
        response: { 200: SuccessResponse, 401: ErrorResponse, },
        detail: {
          summary: "Make a saving throw",
          description: "Roll d20 + ability mod + proficiency against a DC.",
          tags: ["RPG", "Combat",],
        },
      },)
      // ── Damage ─────────────────────────────────────────────
      .post(`${R}/damage`, (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        try {
          const body = ctx.body as { combatant: Combatant; amount: number };
          const result = applyDamage(body.combatant, body.amount,);
          return jsonResponse(result,);
        } catch (error) {
          log().error("Failed to apply damage", error instanceof Error ? error : undefined,);
          return jsonError("Internal server error", 500,);
        }
      }, {
        body: DamageBody,
        response: { 200: SuccessResponse, 401: ErrorResponse, },
        detail: {
          summary: "Apply damage",
          description: "Reduce a combatant's HP and report overkill/defeat.",
          tags: ["RPG", "Combat",],
        },
      },)
      // ── Heal ───────────────────────────────────────────────
      .post(`${R}/heal`, (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        try {
          const body = ctx.body as { combatant: Combatant; amount: number };
          const updated = healCombatant(body.combatant, body.amount,);
          return jsonResponse({ updated, },);
        } catch (error) {
          log().error("Failed to heal combatant", error instanceof Error ? error : undefined,);
          return jsonError("Internal server error", 500,);
        }
      }, {
        body: HealBody,
        response: { 200: SuccessResponse, 401: ErrorResponse, },
        detail: {
          summary: "Heal a combatant",
          description: "Restore HP up to the combatant's maximum.",
          tags: ["RPG", "Combat",],
        },
      },)
      // ── Status ─────────────────────────────────────────────
      .post(`${R}/status`, (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        try {
          const body = ctx.body as { combatants: Combatant[] };
          const combatants = body.combatants;
          return jsonResponse({
            combatOver: isCombatOver(combatants,),
            perCombatant: Array.from(combatants, (c,) => ({
              id: c.id,
              dead: isDead(c,),
              incapacitated: isIncapacitated(c,),
            }),),
          },);
        } catch (error) {
          log().error("Failed to evaluate combat status", error instanceof Error ? error : undefined,);
          return jsonError("Internal server error", 500,);
        }
      }, {
        body: StatusBody,
        response: { 200: SuccessResponse, 401: ErrorResponse, },
        detail: {
          summary: "Evaluate combat status",
          description: "Report whether combat is over and each combatant's dead/incapacitated state.",
          tags: ["RPG", "Combat",],
        },
      },)
      // ── Action economy ─────────────────────────────────────
      .post(`${R}/action`, (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        try {
          const body = ctx.body as {
            combatant: Combatant;
            type: ActionType;
            consume?: boolean;
          };
          const allowed = canTakeAction(body.combatant, body.type,);
          const updated = body.consume ? consumeAction(body.combatant, body.type,) : body.combatant;
          return jsonResponse({ allowed, updated, },);
        } catch (error) {
          log().error("Failed to resolve action", error instanceof Error ? error : undefined,);
          return jsonError("Internal server error", 500,);
        }
      }, {
        body: ActionBody,
        response: { 200: SuccessResponse, 401: ErrorResponse, },
        detail: {
          summary: "Check/consume an action",
          description: "Check whether a combatant can take an action type, optionally consuming it.",
          tags: ["RPG", "Combat",],
        },
      },)
      // ── Init combatant ─────────────────────────────────────
      .post(`${R}/init-combatant`, (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        try {
          const body = ctx.body as {
            id: string;
            name: string;
            stats: Combatant["stats"];
            level: number;
            hp: number;
            ac: number;
            isNpc: boolean;
          };
          const combatant = initCombatant(
            body.id,
            body.name,
            body.stats,
            body.level,
            body.hp,
            body.ac,
            body.isNpc,
          );
          return jsonResponse({ combatant, },);
        } catch (error) {
          log().error("Failed to init combatant", error instanceof Error ? error : undefined,);
          return jsonError("Internal server error", 500,);
        }
      }, {
        body: InitCombatantBody,
        response: { 200: SuccessResponse, 401: ErrorResponse, },
        detail: {
          summary: "Initialize a combatant",
          description: "Build a Combatant from base fields with default action economy.",
          tags: ["RPG", "Combat",],
        },
      },)
      // ── Turn/round reset ───────────────────────────────────
      .post(`${R}/reset-turn`, (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        try {
          const body = ctx.body as { combatant: Combatant };
          return jsonResponse({ updated: resetTurnActions(body.combatant,), },);
        } catch (error) {
          log().error("Failed to reset turn", error instanceof Error ? error : undefined,);
          return jsonError("Internal server error", 500,);
        }
      }, {
        body: t.Object({ combatant: CombatantSchema, },),
        response: { 200: SuccessResponse, 401: ErrorResponse, },
        detail: {
          summary: "Reset turn actions",
          description: "Restore a combatant's actions for a new turn.",
          tags: ["RPG", "Combat",],
        },
      },)
      .post(`${R}/reset-round`, (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        try {
          const body = ctx.body as { combatants: Combatant[] };
          return jsonResponse({ updated: resetRoundReactions(body.combatants,), },);
        } catch (error) {
          log().error("Failed to reset round", error instanceof Error ? error : undefined,);
          return jsonError("Internal server error", 500,);
        }
      }, {
        body: InitiativeBody,
        response: { 200: SuccessResponse, 401: ErrorResponse, },
        detail: {
          summary: "Reset round reactions",
          description: "Restore reactions for all combatants at the start of a round.",
          tags: ["RPG", "Combat",],
        },
      },)
  );
}
