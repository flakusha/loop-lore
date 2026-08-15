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
import { Elysia, } from "elysia";
import {
  applyDamage,
  type Combatant,
  healCombatant,
  makeAttackRoll,
  makeSavingThrow,
  rollInitiative,
  sortByInitiative,
} from "../../rpg/combat";
import type { AdvantageMode, DiceSides, } from "../../rpg/dice";
import { ErrorResponse, SuccessResponse, } from "../../validation/schemas";
import { jsonError, jsonResponse, requireUserId, } from "../http-utils";
import { AttackBody, DamageBody, HealBody, InitiativeBody, SaveBody, } from "./combat-schemas";
import { log, } from "./log";
import type { HandlerOpts, } from "./types";

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
  );
}
