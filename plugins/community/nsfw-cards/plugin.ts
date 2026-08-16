// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * NSFW Cards Plugin — Community plugin for NSFW card games
 *
 * Registers POST /api/nsfw-cards/start and POST /api/nsfw-cards/play.
 * Integrates with reputation system via intimacy tracking.
 * Multi-round seduction encounters with escalating intimacy.
 */

import type { PluginManifest } from "../../../src/plugins/types";
import { handleStart, handlePlay } from "./routes";

export const plugin: PluginManifest = {
  name: "nsfw-cards",
  version: "1.0.0",
  description: "Card-based seduction mechanics for NSFW social encounters",
  author: "loop-lore team",
  license: "Apache-2.0 OR MIT",

  async onLoad(context) {
    // Register API routes
    context.registerApiRoute({
      method: "POST",
      path: "/api/nsfw-cards/start",
      handler: handleStart,
      description: "Start a seduction encounter",
    });

    context.registerApiRoute({
      method: "POST",
      path: "/api/nsfw-cards/play",
      handler: handlePlay,
      description: "Play a seduction card",
    });

    // Register AI tool for chat-based seduction
    context.registerTool({
      name: "play_seduction_card",
      description:
        "Play a card in a seduction encounter. Cards have different types: " +
        "flirt (light), charm (persuasive), tease (provocative), " +
        "compliment (affectionate), touch (physical), kiss (intimate).",
      parameters: {
        type: "object",
        properties: {
          cardType: {
            type: "string",
            enum: ["flirt", "charm", "tease", "compliment", "touch", "kiss"],
            description: "Type of seduction card to play",
          },
          cardPower: {
            type: "number",
            description: "Card power level (1-5). Higher power = stronger effect but more risk.",
          },
        },
        required: ["cardType", "cardPower"],
      },
      handler: async (params) => {
        const { initSeduction, playSeductionCard, cardToString } = await import("./engine");

        const cardType = params.cardType as string;
        const cardPower = params.cardPower as number;

        if (cardPower < 1 || cardPower > 5) {
          return { content: "Card power must be between 1 and 5.", isError: true };
        }

        // For AI tool, create a quick encounter if no state provided
        const state = initSeduction("medium", 5);

        // Find closest matching card in hand
        const cardIndex = state.hand.findIndex(
          (c) => c.type === cardType && Math.abs(c.power - cardPower) <= 1,
        );

        if (cardIndex === -1) {
          return {
            content: `No ${cardType} card with power ${cardPower} available. Your hand: ${state.hand.map(cardToString).join(", ")}`,
            isError: true,
          };
        }

        const round = playSeductionCard(state, cardIndex);
        const status = state.finished
          ? state.outcome === "succeed"
            ? " Target seduced! Intimacy threshold reached."
            : " Encounter ended without success."
          : ` Intimacy: ${state.intimacy}/${state.targetIntimacy}. ${state.maxRounds - state.currentRound} rounds remaining.`;

        return {
          content: `You played ${round.card.name} (${round.card.type}, power ${round.card.power}). ${round.narrative}${status}`,
          metadata: { round, state },
        };
      },
      timeoutMs: 5000,
    });

    // Register agent role
    context.registerAgentRole({
      id: "seduction-partner",
      name: "Seduction Partner",
      description: "NPC that engages in seduction card games",
      systemPrompt:
        "You are a charming character in intimate scenarios. Use the play_seduction_card tool to engage " +
        "in seduction encounters. React to the player's cards with appropriate responses — " +
        "flirt back, tease, or escalate based on the card type. Keep interactions respectful and consensual.",
      tools: ["play_seduction_card"],
    });

    context.logger.info("NSFW cards routes and tools registered");
  },
};
