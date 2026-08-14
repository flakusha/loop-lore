import { Elysia, } from "elysia";
import {
  calculateDamage,
  type DifficultyClass,
  makeAttackRoll,
  makeSavingThrow,
  type RollModifier,
} from "../../battle";
import { SuccessResponse, } from "../../validation/schemas";
import { jsonError, jsonResponse, } from "../http-utils";
import { log, } from "./log";
import type { HandlerOpts, } from "./types";

export function resolutionRoutes(_opts: HandlerOpts, prefix = "/api",) {
  return new Elysia({ name: "battle-resolution", },)
    .post(
      prefix + "/battle/resolution/damage",
      (ctx: any,) => {
        try {
          const body = ctx.body as {
            baseDamage: string;
            modifiers: { source: string; value: number }[];
            isCritical?: boolean;
            damageType?: "physical" | "magical" | "fire" | "ice" | "lightning" | "poison" | "healing";
          };
          const result = calculateDamage(body.baseDamage, body.modifiers, body.isCritical, body.damageType,);
          return jsonResponse(result,);
        } catch (error) {
          log().error("Failed to calculate damage", error instanceof Error ? error : undefined,);
          return jsonError("Internal server error", 500,);
        }
      },
      {
        response: { 200: SuccessResponse, },
        detail: {
          summary: "Calculate damage",
          description: "Calculate final damage with modifiers.",
          tags: ["Battle", "Resolution",],
        },
      },
    )
    .post(
      prefix + "/battle/resolution/attack",
      (ctx: any,) => {
        try {
          const body = ctx.body as {
            attackBonus: number;
            targetAC: number;
            advantage?: boolean;
            disadvantage?: boolean;
          };
          const mods: RollModifier[] = [];
          if (body.advantage) { mods.push({ source: "advantage", value: 2, type: "bonus", },); }
          if (body.disadvantage) { mods.push({ source: "disadvantage", value: -2, type: "penalty", },); }
          const result = makeAttackRoll(body.attackBonus, body.targetAC, mods,);
          return jsonResponse(result,);
        } catch (error) {
          log().error("Failed to calculate attack roll", error instanceof Error ? error : undefined,);
          return jsonError("Internal server error", 500,);
        }
      },
      {
        response: { 200: SuccessResponse, },
        detail: {
          summary: "Attack roll",
          description: "Roll attack against target AC.",
          tags: ["Battle", "Resolution",],
        },
      },
    )
    .post(
      prefix + "/battle/resolution/defense",
      (ctx: any,) => {
        try {
          const body = ctx.body as {
            defenseBonus: number;
            incomingAttack: number;
            advantage?: boolean;
            disadvantage?: boolean;
          };
          const mods: RollModifier[] = [];
          if (body.advantage) { mods.push({ source: "advantage", value: 2, type: "bonus", },); }
          if (body.disadvantage) { mods.push({ source: "disadvantage", value: -2, type: "penalty", },); }
          const dc: DifficultyClass = { name: "defense", value: body.incomingAttack, description: "Defense DC", };
          const result = makeSavingThrow(body.defenseBonus, dc, mods,);
          return jsonResponse(result,);
        } catch (error) {
          log().error("Failed to calculate defense roll", error instanceof Error ? error : undefined,);
          return jsonError("Internal server error", 500,);
        }
      },
      {
        response: { 200: SuccessResponse, },
        detail: {
          summary: "Defense roll",
          description: "Roll defense against incoming attack.",
          tags: ["Battle", "Resolution",],
        },
      },
    )
    .post(
      prefix + "/battle/resolution/round",
      (ctx: any,) => {
        try {
          const body = ctx.body as {
            combatants: {
              id: string;
              attackBonus: number;
              defenseBonus: number;
              maxHP: number;
            }[];
            currentHP: Record<string, number>;
          };
          // Process combat round: each combatant makes an attack against the next
          const actions: { attacker: string; target: string; roll: number; hit: boolean; currentHP: number }[] = [];
          for (let i = 0; i < body.combatants.length; i++) {
            const c = body.combatants[i];
            const target = body.combatants[(i + 1) % body.combatants.length];
            if (!c || !target) { continue; }
            const roll = makeAttackRoll(c.attackBonus, 10 + target.defenseBonus, [],);
            const hp = body.currentHP[c.id] ?? 0;
            actions.push({
              attacker: c.id,
              target: target.id,
              roll: roll.roll.total,
              hit: roll.hit,
              currentHP: hp,
            },);
          }
          return jsonResponse({ round: 1, actions, summary: `Processed ${actions.length} actions`, },);
        } catch (error) {
          log().error("Failed to process combat round", error instanceof Error ? error : undefined,);
          return jsonError("Internal server error", 500,);
        }
      },
      {
        response: { 200: SuccessResponse, },
        detail: {
          summary: "Process combat round",
          description: "Process a full combat round with all combatants.",
          tags: ["Battle", "Resolution",],
        },
      },
    );
}
