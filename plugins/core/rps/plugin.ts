/**
 * Rock-Paper-Scissors Plugin — Core plugin shipped with loop-lore
 *
 * Registers POST /api/rps/play and GET /api/rps/rules.
 * Supports single-round and best-of-N modes.
 * Integrates with chat via /rps text command detection.
 */

import type { PluginManifest } from "../../../src/plugins/types";
import { handlePlay, handleRules } from "./routes";

export const plugin: PluginManifest = {
  name: "rps",
  version: "1.0.0",
  description: "Rock-Paper-Scissors mini-game with single-round and best-of-N modes",
  author: "loop-lore team",
  license: "Apache-2.0 OR MIT",

  async onLoad(context) {
    // Register API routes
    context.registerApiRoute({
      method: "POST",
      path: "/api/rps/play",
      handler: handlePlay,
      description: "Play a round of Rock-Paper-Scissors",
    });

    context.registerApiRoute({
      method: "GET",
      path: "/api/rps/rules",
      handler: handleRules,
      description: "RPS game rules and valid choices",
    });

    // Register AI tool for chat-based gameplay
    context.registerTool({
      name: "play_rps",
      description: "Play Rock-Paper-Scissors. Supports single round or best-of-N games.",
      parameters: {
        type: "object",
        properties: {
          choice: {
            type: "string",
            enum: ["rock", "paper", "scissors"],
            description: "Your choice",
          },
          bestOf: {
            type: "number",
            description: "Best-of-N (default 1 = single round). Use 3, 5, 7 for multi-round.",
          },
        },
        required: ["choice"],
      },
      handler: async (params) => {
        const choice = params.choice as "rock" | "paper" | "scissors";
        const bestOf = (params.bestOf as number) || 1;

        const { isValidChoice, playSingleRound, initGameState, playGameRound } = await import("./engine");

        if (!isValidChoice(choice)) {
          return { content: "Invalid choice. Pick rock, paper, or scissors.", isError: true };
        }

        if (bestOf <= 1) {
          const round = playSingleRound(choice);
          return {
            content: `You chose ${round.playerChoice}. Opponent chose ${round.opponentChoice}. ${round.narrative}`,
            metadata: { round },
          };
        }

        // Play a full best-of-N game
        const state = initGameState(bestOf);
        while (!state.finished) {
          playGameRound(state, choice);
        }

        const lastRound = state.history[state.history.length - 1];
        const result = state.winner === "player" ? "You win the match!"
          : state.winner === "opponent" ? "You lose the match!"
          : "The match is a draw!";

        return {
          content: `${lastRound.narrative} Score: ${state.playerWins}-${state.opponentWins}. ${result}`,
          metadata: { state, lastRound },
        };
      },
      timeoutMs: 5000,
    });

    // Register agent role
    context.registerAgentRole({
      id: "rps-player",
      name: "RPS Player",
      description: "Engages in Rock-Paper-Scissors games with users",
      systemPrompt:
        "You are a Rock-Paper-Scissors player. When challenged, use the play_rps tool. " +
        "You can play single rounds or best-of-N matches. Be playful and competitive.",
      tools: ["play_rps"],
    });

    context.logger.info("RPS game routes and tools registered");
  },
};