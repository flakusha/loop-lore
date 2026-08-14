import { Elysia, } from "elysia";
import {
  applyMoraleModifier,
  computeMoraleLevel,
  type MoraleState,
  processMoraleBreak,
} from "../../battle";
import { SuccessResponse, } from "../../validation/schemas";
import { jsonError, jsonResponse, } from "../http-utils";
import { log, } from "./log";
import type { HandlerOpts, } from "./types";

export function moraleRoutes(_opts: HandlerOpts, prefix = "/api") {
  return new Elysia({ name: "battle-morale", },)
    .post(
      prefix + "/battle/morale/compute",
      (ctx: any,) => {
        try {
          const body = ctx.body as { value: number };
          const level = computeMoraleLevel(body.value,);
          return jsonResponse({ level, value: body.value, },);
        } catch (error) {
          log().error("Failed to compute morale", error instanceof Error ? error : undefined,);
          return jsonError("Internal server error", 500,);
        }
      },
      {
        response: { 200: SuccessResponse, },
        detail: {
          summary: "Compute morale level",
          description: "Compute morale level from numeric value.",
          tags: ["Battle", "Morale",],
        },
      },
    )
    .post(
      prefix + "/battle/morale/apply",
      (ctx: any,) => {
        try {
          const body = ctx.body as {
            state: MoraleState;
            modifier: { reason: string; value: number; duration: number; appliedAt: string };
          };
          const updated = applyMoraleModifier(body.state, body.modifier,);
          return jsonResponse(updated,);
        } catch (error) {
          log().error("Failed to apply morale modifier", error instanceof Error ? error : undefined,);
          return jsonError("Internal server error", 500,);
        }
      },
      {
        response: { 200: SuccessResponse, },
        detail: {
          summary: "Apply morale modifier",
          description: "Apply a morale modifier to a combatant's morale state.",
          tags: ["Battle", "Morale",],
        },
      },
    )
    .post(
      prefix + "/battle/morale/break",
      (ctx: any,) => {
        try {
          const body = ctx.body as { state: MoraleState };
          const result = processMoraleBreak(body.state,);
          return jsonResponse(result,);
        } catch (error) {
          log().error("Failed to process morale break", error instanceof Error ? error : undefined,);
          return jsonError("Internal server error", 500,);
        }
      },
      {
        response: { 200: SuccessResponse, },
        detail: {
          summary: "Process morale break",
          description: "Check if morale has broken and apply effects.",
          tags: ["Battle", "Morale",],
        },
      },
    );
}
