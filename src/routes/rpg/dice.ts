import { Elysia, } from "elysia";
import { type AdvantageMode, type DiceSides, rollDice, rollFromNotation, } from "../../rpg/dice.js";
import { logDiceRoll, } from "../../rpg/service";
import { ErrorResponse, SuccessResponse, } from "../../validation/schemas";
import { jsonError, jsonResponse, requireUserId, } from "../http-utils";
import { log, } from "./log";
import { DiceAdvantageBody, DiceNotationBody, DiceRollBody, type HandlerOpts, } from "./types";

export function diceRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, } = opts;

  return (
    new Elysia({ name: "rpg-dice", },)
      // ── Dice: Roll ────────────────────────────────────────
      .post(
        prefix + "/rpg/dice/roll",
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
                rawRolls: Array.from(result.dice, (d,) => d.value,),
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
        prefix + "/rpg/dice/notation",
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
        prefix + "/rpg/dice/advantage",
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
  );
}
