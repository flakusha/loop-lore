// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Trivia Plugin — Community plugin for trivia mini-games
 *
 * Registers quiz gameplay with categories, difficulty levels, streak bonuses.
 * Stateful sessions via in-memory store (ephemeral, no DB).
 *
 * License: Apache-2.0 OR MIT
 */

import type { PluginManifest } from "../../../src/plugins/types";
import { handleStart, handleAnswer, handleCategories, isCategory, isDifficulty } from "./routes";
import { startSession, answerQuestion, getCurrentQuestion, getCategories } from "./engine";
import { TRIVIA_CATEGORIES, TRIVIA_DIFFICULTIES } from "./types";

export const plugin: PluginManifest = {
  name: "trivia",
  version: "1.0.0",
  description: "Trivia mini-game with categories, difficulty levels, and streak bonuses",
  author: "loop-lore team",
  license: "Apache-2.0 OR MIT",

  async onLoad(context) {
    // Register API routes
    context.registerApiRoute({
      method: "POST",
      path: "/api/trivia/start",
      handler: handleStart,
      description: "Start a trivia session",
    });

    context.registerApiRoute({
      method: "POST",
      path: "/api/trivia/answer",
      handler: handleAnswer,
      description: "Answer a trivia question",
    });

    context.registerApiRoute({
      method: "GET",
      path: "/api/trivia/categories",
      handler: handleCategories,
      description: "List trivia categories and difficulties",
    });

    // Register AI tool for chat-based trivia
    context.registerTool({
      name: "play_trivia",
      description: "Play a trivia quiz. Start a session, then answer questions one by one.",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["start", "answer", "categories"],
            description: "start = new quiz, answer = answer current question, categories = list options",
          },
          category: {
            type: "string",
            enum: [...TRIVIA_CATEGORIES],
            description: "Question category (for start)",
          },
          difficulty: {
            type: "string",
            enum: [...TRIVIA_DIFFICULTIES],
            description: "Difficulty level (for start)",
          },
          answerIndex: {
            type: "number",
            description: "0-based index of chosen answer (for answer)",
          },
        },
        required: ["action"],
      },
      handler: async (params) => {
        const action = params.action as string;

        if (action === "categories") {
          const cats = getCategories().map((c) => `${c.id} — ${c.name}`);
          return {
            content: `Categories: ${cats.join(", ")}. Difficulties: ${TRIVIA_DIFFICULTIES.join(", ")}.`,
          };
        }

        if (action === "start") {
          const category = typeof params.category === "string" ? params.category : undefined;
          const difficulty = typeof params.difficulty === "string" ? params.difficulty : undefined;
          if (category !== undefined && !isCategory(category)) {
            return {
              content: `Invalid category. Choose one of: ${TRIVIA_CATEGORIES.join(", ")}.`,
              isError: true,
            };
          }
          if (difficulty !== undefined && !isDifficulty(difficulty)) {
            return {
              content: `Invalid difficulty. Choose one of: ${TRIVIA_DIFFICULTIES.join(", ")}.`,
              isError: true,
            };
          }
          try {
            const session = startSession(category, difficulty, 5);

            // Store session metadata in result
            const current = getCurrentQuestion(session);
            if (!current) return { content: "Failed to generate questions.", isError: true };

            const opts = current.options.map((o, i) => `[${i}] ${o}`).join(", ");
            return {
              content: `Trivia time! (${current.category}, ${current.difficulty}) Q1/${session.totalQuestions}: ${current.question}\n${opts}`,
              metadata: { sessionId: session.id, session },
            };
          } catch (error) {
            return { content: `Error: ${(error as Error).message}`, isError: true };
          }
        }

        if (action === "answer") {
          // For chat, sessions are managed via metadata round-trips
          return {
            content: "To answer a trivia question, use the /api/v1/trivia/answer endpoint with your sessionId and answerIndex. Chat-based stateful trivia coming soon.",
          };
        }

        return { content: 'Unknown action. Use "start", "answer", or "categories".', isError: true };
      },
    });

    // Register agent role
    context.registerAgentRole({
      id: "trivia-host",
      name: "Trivia Host",
      description: "Hosts trivia quiz games for players",
      systemPrompt:
        "You are a charismatic trivia host. When a player wants to play trivia, use the play_trivia tool. " +
        "Read questions dramatically, celebrate correct answers, and console wrong ones. " +
        "Share fun facts from explanations. Keep the energy high!",
      tools: ["play_trivia"],
    });

    context.logger.info("Trivia routes, tools, and host role registered");
  },
};