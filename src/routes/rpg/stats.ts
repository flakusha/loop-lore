import { Elysia, } from "elysia";
import {
  type AbilityName,
  computeModifiers,
  defaultStatBlock,
  pointBuy,
  rollStats4d6,
  standardArray,
  type StatBlock,
  validateStatBlock,
} from "../../rpg/stats.js";
import { ErrorResponse, SuccessResponse, } from "../../validation/schemas";
import { jsonError, jsonResponse, requireUserId, } from "../http-utils";
import { log, } from "./log";
import { type HandlerOpts, StatsBody, StatsGenerateBody, } from "./types";

export function statsRoutes(_opts: HandlerOpts, prefix = "/api") {
  return (
    new Elysia({ name: "rpg-stats", },)
      // ── Stats: Calculate ──────────────────────────────────
      .post(
        prefix + "/rpg/stats/calculate",
        (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          try {
            const body = ctx.body as { stats: StatBlock };
            const result = computeModifiers(body.stats,);
            return jsonResponse(result,);
          } catch (error) {
            log().error("Failed to calculate modifiers", error instanceof Error ? error : undefined,);
            return jsonError("Internal server error", 500,);
          }
        },
        {
          body: StatsBody,
          response: {
            200: SuccessResponse,
            401: ErrorResponse,
          },
          detail: {
            summary: "Compute ability modifiers",
            description: "Calculate modifier for each ability score using floor((stat-10)/2).",
            tags: ["RPG", "Stats",],
          },
        },
      )
      .post(
        prefix + "/rpg/stats/validate",
        (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          try {
            const body = ctx.body as { stats: StatBlock };
            const valid = validateStatBlock(body.stats,);
            return jsonResponse({ valid, },);
          } catch (error) {
            log().error("Failed to validate stats", error instanceof Error ? error : undefined,);
            return jsonError("Internal server error", 500,);
          }
        },
        {
          body: StatsBody,
          response: {
            200: SuccessResponse,
            401: ErrorResponse,
          },
          detail: {
            summary: "Validate a stat block",
            description: "Check all six ability scores are within [1, 30].",
            tags: ["RPG", "Stats",],
          },
        },
      )
      .post(
        prefix + "/rpg/stats/generate",
        (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          try {
            const body = ctx.body as {
              method: "point_buy" | "4d6_drop_lowest" | "standard_array";
              allocation?: Record<AbilityName, number>;
            };

            switch (body.method) {
              case "point_buy": {
                if (!body.allocation) {
                  return jsonError("Point-buy requires allocation", 400,);
                }
                const stats = pointBuy(body.allocation,);
                if (!stats) {
                  return jsonError("Invalid point-buy allocation (must total 27 points)", 400,);
                }
                return jsonResponse({ method: "point_buy", stats, },);
              }
              case "4d6_drop_lowest": {
                const rolls = rollStats4d6();
                const stats = defaultStatBlock();
                const abilities = ["str", "dex", "con", "int", "wis", "cha",] as const;
                for (let i = 0; i < 6; i++) {
                  stats[abilities[i]!] = rolls[i]!;
                }
                return jsonResponse({ method: "4d6_drop_lowest", stats, rolls, },);
              }
              case "standard_array": {
                return jsonResponse({ method: "standard_array", array: standardArray(), },);
              }
              default: {
                return jsonError("Unknown generation method", 400,);
              }
            }
          } catch (error) {
            log().error("Failed to generate stats", error instanceof Error ? error : undefined,);
            return jsonError("Internal server error", 500,);
          }
        },
        {
          body: StatsGenerateBody,
          response: {
            200: SuccessResponse,
            401: ErrorResponse,
          },
          detail: {
            summary: "Generate stat block",
            description: "Generate stats using point-buy, 4d6-drop-lowest, or standard array.",
            tags: ["RPG", "Stats",],
          },
        },
      )
  );
}
