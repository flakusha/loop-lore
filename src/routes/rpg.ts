/**
 * RPG Routes
 *
 * REST endpoints for RPG mechanics:
 *
 *   Dice:
 *     POST /api/rpg/dice/roll — roll dice with crypto entropy
 *     POST /api/rpg/dice/notation — roll from notation string (e.g. "2d6+3")
 *     POST /api/rpg/dice/advantage — roll d20 with advantage/disadvantage
 *
 *   Stats:
 *     POST /api/rpg/stats/calculate — compute modifiers from stat block
 *     POST /api/rpg/stats/validate — validate a stat block
 *     POST /api/rpg/stats/generate — generate stats (point-buy, 4d6-drop-lowest, standard)
 */

import { Elysia, t, } from "elysia";
import type { Kysely, } from "kysely";
import {
  type AdvantageMode,
  type DiceSides,
  rollDice,
  rollFromNotation,
} from "../rpg/dice.js";
import { logDiceRoll, } from "../rpg/service.js";
import type { Config, } from "../config/schema.js";
import type { DB, } from "../db/schema.js";
import { getLogger, type Logger, } from "../logger";
import {
  type AbilityName,
  computeModifiers,
  defaultStatBlock,
  pointBuy,
  rollStats4d6,
  standardArray,
  validateStatBlock,
  type StatBlock,
} from "../rpg/stats.js";
import { ErrorResponse, SuccessResponse, } from "../validation/schemas";
import { jsonError, jsonResponse, requireUserId, } from "./http-utils.js";

function log(): Logger {
  return getLogger().child({ module: "rpg-routes", },);
}

// ── Body schemas (TypeBox) ─────────────────────────────────

const DiceSidesSchema = t.Union([
  t.Literal(4,),
  t.Literal(6,),
  t.Literal(8,),
  t.Literal(10,),
  t.Literal(12,),
  t.Literal(20,),
  t.Literal(100,),
],);

const AdvantageModeSchema = t.Union([
  t.Literal("normal",),
  t.Literal("advantage",),
  t.Literal("disadvantage",),
],);

const StatBlockSchema = t.Object({
  str: t.Number(),
  dex: t.Number(),
  con: t.Number(),
  int: t.Number(),
  wis: t.Number(),
  cha: t.Number(),
},);

const DiceRollBody = t.Object({
  sides: DiceSidesSchema,
  count: t.Optional(t.Number({ minimum: 1, },),),
  modifier: t.Optional(t.Number(),),
  exploding: t.Optional(t.Boolean(),),
},);

const DiceNotationBody = t.Object({
  notation: t.String({ minLength: 1, },),
},);

const DiceAdvantageBody = t.Object({
  modifier: t.Optional(t.Number(),),
  advantage: t.Optional(AdvantageModeSchema,),
},);

const StatsBody = t.Object({
  stats: StatBlockSchema,
},);

const AbilityNameSchema = t.Union([
  t.Literal("str",),
  t.Literal("dex",),
  t.Literal("con",),
  t.Literal("int",),
  t.Literal("wis",),
  t.Literal("cha",),
],);

const StatsGenerateBody = t.Object({
  method: t.Union([
    t.Literal("point_buy",),
    t.Literal("4d6_drop_lowest",),
    t.Literal("standard_array",),
  ],),
  /* eslint-disable unicorn/max-nested-calls -- Elysia TypeBox schema nesting is inherent to framework */
  allocation: t.Optional(t.Record(AbilityNameSchema, t.Number(),),),
  /* eslint-enable unicorn/max-nested-calls */
},);

interface HandlerOpts {
  database: Kysely<DB>;
  config: Config;
}

export function rpgRoutes(opts: HandlerOpts,) {
  const { database, } = opts;

  return (
    new Elysia({ name: "rpg", },)
      // ── Dice: Roll ────────────────────────────────────────

      .post(
        "/api/rpg/dice/roll",
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          try {
            const body = ctx.body as {
              sides: DiceSides;
              count?: number;
              modifier?: number;
              exploding?: boolean;
            };
            const result = rollDice(
              body.sides,
              body.count ?? 1,
              body.modifier ?? 0,
              "normal",
              body.exploding ?? false,
            );

            // Log to database
            await logDiceRoll(
              { database, },
              {
                userId,
                sides: body.sides,
                count: body.count ?? 1,
                modifier: body.modifier ?? 0,
                advantageMode: "normal",
                exploding: body.exploding ?? false,
                rawRolls: result.dice.map((d,) => d.value),
                rawTotal: result.rawTotal,
                total: result.total,
                purpose: "dice_roll",
              },
            );

            return jsonResponse(result,);
          } catch (error) {
            log().error("Failed to roll dice", error instanceof Error ? error : undefined,);
            return jsonError("Internal server error", 500,);
          }
        },
        {
          body: DiceRollBody,
          response: {
            200: SuccessResponse,
            401: ErrorResponse,
          },
          detail: {
            summary: "Roll dice with crypto entropy",
            description: "Roll N dice of given type with optional modifier and exploding.",
            tags: ["RPG", "Dice",],
          },
        },
      )
      .post(
        "/api/rpg/dice/notation",
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          try {
            const body = ctx.body as { notation: string };
            const result = rollFromNotation(body.notation,);
            if (!result) {
              return jsonError("Invalid dice notation", 400,);
            }
            return jsonResponse(result,);
          } catch (error) {
            log().error("Failed to roll from notation", error instanceof Error ? error : undefined,);
            return jsonError("Internal server error", 500,);
          }
        },
        {
          body: DiceNotationBody,
          response: {
            200: SuccessResponse,
            401: ErrorResponse,
          },
          detail: {
            summary: "Roll from dice notation",
            description: "Roll dice using standard notation like '2d6+3' or 'd20 adv'.",
            tags: ["RPG", "Dice",],
          },
        },
      )
      .post(
        "/api/rpg/dice/advantage",
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          try {
            const body = ctx.body as {
              modifier?: number;
              advantage?: AdvantageMode;
            };
            const result = rollDice(
              20,
              1,
              body.modifier ?? 0,
              body.advantage ?? "normal",
            );
            return jsonResponse(result,);
          } catch (error) {
            log().error("Failed to roll with advantage", error instanceof Error ? error : undefined,);
            return jsonError("Internal server error", 500,);
          }
        },
        {
          body: DiceAdvantageBody,
          response: {
            200: SuccessResponse,
            401: ErrorResponse,
          },
          detail: {
            summary: "Roll d20 with advantage/disadvantage",
            description: "Roll 2d20 and take higher (advantage) or lower (disadvantage).",
            tags: ["RPG", "Dice",],
          },
        },
      )

      // ── Stats: Calculate ──────────────────────────────────

      .post(
        "/api/rpg/stats/calculate",
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
        "/api/rpg/stats/validate",
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
        "/api/rpg/stats/generate",
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
                const abilities = ["str", "dex", "con", "int", "wis", "cha"] as const;
                for (let i = 0; i < 6; i++) {
                  stats[abilities[i]!] = rolls[i]!;
                }
                return jsonResponse({ method: "4d6_drop_lowest", stats, rolls, },);
              }
              case "standard_array": {
                return jsonResponse({ method: "standard_array", array: standardArray(), },);
              }
              default:
                return jsonError("Unknown generation method", 400,);
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
