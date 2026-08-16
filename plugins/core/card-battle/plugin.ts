// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Card Battle Plugin — Core plugin shipped with loop-lore
 *
 * Registers card-based combat system with action modifiers.
 * Integrates with battle system via damage calculation.
 * Supports both card-combat and NSFW event mechanics.
 *
 * License: Apache-2.0 OR MIT
 */

import type { PluginManifest } from "../../../src/plugins/types";
import { handleStart, handlePlay, handleActions } from "./routes";
import { initBattle, playBattleCard, cardToString } from "./engine";

export const plugin: PluginManifest = {
  name: "card-battle",
  version: "1.0.0",
  description:
    "Card-based combat — play cards with combat actions to deal damage. Integrates with battle and NSFW systems.",
  author: "loop-lore team",
  license: "Apache-2.0 OR MIT",

  async onLoad(context) {
    // Register API routes
    context.registerApiRoute({
      method: "POST",
      path: "/api/card-battle/start",
      handler: handleStart,
      description: "Start a new card battle",
    });

    context.registerApiRoute({
      method: "POST",
      path: "/api/card-battle/play",
      handler: handlePlay,
      description: "Play a card in an ongoing battle",
    });

    context.registerApiRoute({
      method: "GET",
      path: "/api/card-battle/actions",
      handler: handleActions,
      description: "List available combat actions",
    });

    // Register AI tool for chat-based card combat
    context.registerTool({
      name: "play_card_battle",
      description: "Play a card-battle round. Start a battle, then play cards with combat actions to defeat the opponent.",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["start", "play"],
            description: '"start" to begin a new battle, "play" to play a card',
          },
          difficulty: {
            type: "string",
            enum: ["easy", "medium", "hard"],
            description: "Opponent difficulty (for start)",
          },
          cardIndex: {
            type: "number",
            description: "Index of card in hand to play (0-based, for play)",
          },
          combatAction: {
            type: "string",
            enum: ["attack", "defend", "feint", "bluff", "charm"],
            description: "Combat action to use (for play)",
          },
        },
        required: ["action"],
      },
      handler: async (params) => {
        const action = params.action as string;

        if (action === "start") {
          const difficulty = (params.difficulty as string) || "medium";
          if (!["easy", "medium", "hard"].includes(difficulty)) {
            return { content: "Invalid difficulty. Choose easy, medium, or hard.", isError: true };
          }
          const state = initBattle(100, difficulty as "easy" | "medium" | "hard", 5);
          const handStr = state.playerHand
            .map((c, i) => `[${i}] ${cardToString(c)}`)
            .join(", ");
          return {
            content: `Battle started! HP: ${state.playerHp}/${state.playerMaxHp} vs ${state.opponentHp}/${state.opponentMaxHp}. Your hand: ${handStr}. Actions: attack, defend, feint, bluff, charm.`,
            metadata: { state },
          };
        }

        if (action === "play") {
          // For chat play, the AI manages state internally
          return {
            content: "To play cards, use the /api/card-battle/start and /api/card-battle/play endpoints. Chat-based card battles require stateful session — coming soon.",
          };
        }

        return { content: 'Unknown action. Use "start" or "play".', isError: true };
      },
    });

    // Register agent role for card combat NPCs
    context.registerAgentRole({
      id: "card-battler",
      name: "Card Battler",
      description: "An NPC that engages in card-based combat encounters",
      systemPrompt:
        "You are a card battler in this world. When players challenge you, use the card-battle system. " +
        "Describe your actions dramatically — attacks are fierce, feints are cunning, blocks are heroic. " +
        "Show your cards with flair and react to the player's choices.",
      tools: ["play_card_battle"],
    });

    context.logger.info("Card battle routes, tools, and agent role registered");
  },
};