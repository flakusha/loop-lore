/**
 * Combat status + action-economy routes — stateless resolution endpoints
 * backed by the pure combat engine (src/rpg/combat). Split from `combat.ts`
 * to keep both files under the 250-line size ceiling.
 *
 *   POST /api/rpg/combat/status         — evaluate combat/combatant status
 *   POST /api/rpg/combat/action         — check/consume an action
 *   POST /api/rpg/combat/init-combatant — build a combatant with defaults
 *   POST /api/rpg/combat/reset-turn     — restore turn actions
 *   POST /api/rpg/combat/reset-round    — restore round reactions
 */
import { Elysia, t, } from "elysia";
import {
  type ActionType,
  canTakeAction,
  type Combatant,
  consumeAction,
  initCombatant,
  isCombatOver,
  isDead,
  isIncapacitated,
  resetRoundReactions,
  resetTurnActions,
} from "../../rpg/combat";
import { ErrorResponse, SuccessResponse, } from "../../validation/schemas";
import { jsonError, jsonResponse, requireUserId, } from "../http-utils";
import { ActionBody, CombatantSchema, InitCombatantBody, InitiativeBody, StatusBody, } from "./combat-schemas";
import { log, } from "./log";
import type { HandlerOpts, } from "./types";

export function combatStatusRoutes(_opts: HandlerOpts, prefix = "/api",): Elysia {
  const R = `${prefix}/rpg/combat`;

  return (
    new Elysia({ name: "rpg-combat-status", },)
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
