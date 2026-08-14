import { Elysia, } from "elysia";
import {
  calculateDemoralizeEffect,
  calculateInspireEffect,
  calculateIntimidationEffect,
  calculateRallyEffect,
  calculateSurrenderChance,
  calculateTauntEffect,
  type MoraleState,
} from "../../battle";
import { SuccessResponse, } from "../../validation/schemas";
import { jsonError, jsonResponse, } from "../http-utils";
import { log, } from "./log";
import type { HandlerOpts, } from "./types";

export function socialRoutes(_opts: HandlerOpts, prefix = "/api") {
  return new Elysia({ name: "battle-social", },)
    .post(
      prefix + "/battle/social/intimidate",
      (ctx: any,) => {
        try {
          const body = ctx.body as {
            attackerLevel: number;
            attackerIntimidation: number;
            targetLevel: number;
            targetMorale: MoraleState;
          };
          const result = calculateIntimidationEffect(
            body.attackerLevel,
            body.attackerIntimidation,
            body.targetLevel,
            body.targetMorale,
          );
          return jsonResponse(result,);
        } catch (error) {
          log().error("Failed to calculate intimidation", error instanceof Error ? error : undefined,);
          return jsonError("Internal server error", 500,);
        }
      },
      {
        response: { 200: SuccessResponse, },
        detail: {
          summary: "Intimidation check",
          description: "Calculate intimidation effect on target morale.",
          tags: ["Battle", "Social",],
        },
      },
    )
    .post(
      prefix + "/battle/social/taunt",
      (ctx: any,) => {
        try {
          const body = ctx.body as {
            attackerCharisma: number;
            targetMorale: MoraleState;
            targetPersonality: "aggressive" | "cautious" | "neutral";
          };
          const result = calculateTauntEffect(
            body.attackerCharisma,
            body.targetMorale,
            body.targetPersonality,
          );
          return jsonResponse(result,);
        } catch (error) {
          log().error("Failed to calculate taunt", error instanceof Error ? error : undefined,);
          return jsonError("Internal server error", 500,);
        }
      },
      {
        response: { 200: SuccessResponse, },
        detail: {
          summary: "Taunt check",
          description: "Calculate taunt effect based on charisma and target personality.",
          tags: ["Battle", "Social",],
        },
      },
    )
    .post(
      prefix + "/battle/social/surrender",
      (ctx: any,) => {
        try {
          const body = ctx.body as {
            targetMorale: MoraleState;
            attackerReputation: number;
            targetHealthPercent: number;
          };
          const result = calculateSurrenderChance(
            body.targetMorale,
            body.attackerReputation,
            body.targetHealthPercent,
          );
          return jsonResponse(result,);
        } catch (error) {
          log().error("Failed to calculate surrender", error instanceof Error ? error : undefined,);
          return jsonError("Internal server error", 500,);
        }
      },
      {
        response: { 200: SuccessResponse, },
        detail: {
          summary: "Surrender check",
          description: "Calculate chance of target surrendering.",
          tags: ["Battle", "Social",],
        },
      },
    )
    .post(
      prefix + "/battle/social/rally",
      (ctx: any,) => {
        try {
          const body = ctx.body as {
            leaderCharisma: number;
            leaderLevel: number;
            allyMorale: MoraleState;
          };
          const result = calculateRallyEffect(
            body.leaderCharisma,
            body.leaderLevel,
            body.allyMorale,
          );
          return jsonResponse(result,);
        } catch (error) {
          log().error("Failed to calculate rally", error instanceof Error ? error : undefined,);
          return jsonError("Internal server error", 500,);
        }
      },
      {
        response: { 200: SuccessResponse, },
        detail: {
          summary: "Rally allies",
          description: "Calculate morale boost from rallying allies.",
          tags: ["Battle", "Social",],
        },
      },
    )
    .post(
      prefix + "/battle/social/inspire",
      (ctx: any,) => {
        try {
          const body = ctx.body as {
            leaderCharisma: number;
            leaderInspiration: number;
            allyMorale: MoraleState;
          };
          const result = calculateInspireEffect(
            body.leaderCharisma,
            body.leaderInspiration,
            body.allyMorale,
          );
          return jsonResponse(result,);
        } catch (error) {
          log().error("Failed to calculate inspire", error instanceof Error ? error : undefined,);
          return jsonError("Internal server error", 500,);
        }
      },
      {
        response: { 200: SuccessResponse, },
        detail: {
          summary: "Inspire allies",
          description: "Calculate morale boost from inspiring allies.",
          tags: ["Battle", "Social",],
        },
      },
    )
    .post(
      prefix + "/battle/social/demoralize",
      (ctx: any,) => {
        try {
          const body = ctx.body as {
            attackerIntimidation: number;
            attackerLevel: number;
            targetMorale: MoraleState;
          };
          const result = calculateDemoralizeEffect(
            body.attackerIntimidation,
            body.attackerLevel,
            body.targetMorale,
          );
          return jsonResponse(result,);
        } catch (error) {
          log().error("Failed to calculate demoralize", error instanceof Error ? error : undefined,);
          return jsonError("Internal server error", 500,);
        }
      },
      {
        response: { 200: SuccessResponse, },
        detail: {
          summary: "Demoralize enemies",
          description: "Calculate morale reduction from demoralizing enemies.",
          tags: ["Battle", "Social",],
        },
      },
    );
}
