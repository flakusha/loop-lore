import { Elysia, } from "elysia";
import {
  createBattleMemory,
  makeNPCDecision,
  type NPCBattleMemory,
  type NPCPersonality,
  wouldNPCSurrender,
} from "../../battle";
import { SuccessResponse, } from "../../validation/schemas";
import { jsonError, jsonResponse, } from "../http-utils";
import { log, } from "./log";
import type { HandlerOpts, } from "./types";

export function npcRoutes(_opts: HandlerOpts, prefix = "/api",) {
  return new Elysia({ name: "battle-npc", },)
    .post(
      `${prefix}/battle/npc/decision`,
      (ctx: any,) => {
        try {
          const body = ctx.body as {
            personality: NPCPersonality;
            currentHealth: number;
            maxHealth: number;
            enemyCount: number;
            allyCount: number;
            battleMemories: NPCBattleMemory[];
          };
          const decision = makeNPCDecision(
            body.personality,
            body.currentHealth,
            body.maxHealth,
            body.enemyCount,
            body.allyCount,
            body.battleMemories,
          );
          return jsonResponse(decision,);
        } catch (error) {
          log().error("Failed to make NPC decision", error instanceof Error ? error : undefined,);
          return jsonError("Internal server error", 500,);
        }
      },
      {
        response: { 200: SuccessResponse, },
        detail: {
          summary: "NPC combat decision",
          description: "Make NPC combat decision based on personality and situation.",
          tags: ["Battle", "NPC",],
        },
      },
    )
    .post(
      `${prefix}/battle/npc/memory`,
      (ctx: any,) => {
        try {
          const body = ctx.body as {
            battleId: string;
            outcome: "victory" | "defeat" | "draw";
            opponents: string[];
            opponentLevel: number;
            npcLevel: number;
          };
          const memory = createBattleMemory(
            body.battleId,
            body.outcome,
            body.opponents,
            body.opponentLevel,
            body.npcLevel,
          );
          return jsonResponse(memory,);
        } catch (error) {
          log().error("Failed to create battle memory", error instanceof Error ? error : undefined,);
          return jsonError("Internal server error", 500,);
        }
      },
      {
        response: { 200: SuccessResponse, },
        detail: {
          summary: "Create battle memory",
          description: "Record a battle outcome in NPC memory.",
          tags: ["Battle", "NPC",],
        },
      },
    )
    .post(
      `${prefix}/battle/npc/surrender`,
      (ctx: any,) => {
        try {
          const body = ctx.body as {
            personality: NPCPersonality;
            currentHealth: number;
            maxHealth: number;
            battleMemories: NPCBattleMemory[];
          };
          const result = wouldNPCSurrender(
            body.personality,
            body.currentHealth,
            body.maxHealth,
            body.battleMemories,
          );
          return jsonResponse(result,);
        } catch (error) {
          log().error("Failed to check NPC surrender", error instanceof Error ? error : undefined,);
          return jsonError("Internal server error", 500,);
        }
      },
      {
        response: { 200: SuccessResponse, },
        detail: {
          summary: "NPC surrender check",
          description: "Check if NPC would surrender based on personality and situation.",
          tags: ["Battle", "NPC",],
        },
      },
    );
}
