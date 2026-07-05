/**
 * Assistant Service — Rule-based MVP
 *
 * Keyword detection → predefined responses with confidence scores.
 * Designed to be swapped for LLM-backed agent runtime later.
 *
 * Response shape: { type: "suggestion" | "info" | "error", content: string, confidence: number }
 */

import type { Config } from "../config/schema";

export interface AssistantResponse {
  type: "suggestion" | "info" | "error";
  content: string;
  confidence: number;
}

export interface GenerateResponseParams {
  userInput: string;
  chatMode?: string;
  context?: Record<string, unknown>;
}

// Keyword → response map
const RESPONSE_MAP: Record<string, AssistantResponse[]> = {
  help: [
    {
      type: "info",
      content: "Try sending a message to start chatting. Type /help for commands.",
      confidence: 0.9,
    },
  ],
  hello: [{ type: "info", content: "Hello! How can I help you today?", confidence: 0.8 }],
  "/help": [
    {
      type: "info",
      content: "Commands: /help — this menu. /clear — clear chat. /stats — show chat stats.",
      confidence: 1,
    },
  ],
  lore: [
    {
      type: "suggestion",
      content: "Create a world with lore entries to build rich backstory for your characters.",
      confidence: 0.7,
    },
  ],
};

/**
 * Generate an assistant response based on user input.
 * Returns null if no match found (no response needed).
 */
export function generateResponse(params: GenerateResponseParams): AssistantResponse | null {
  const { userInput } = params;
  const lower = userInput.toLowerCase().trim();

  // Check exact matches first
  for (const [keyword, responses] of Object.entries(RESPONSE_MAP)) {
    if (lower.startsWith(keyword)) {
      return responses[0] ?? null;
    }
  }

  // Check keyword containment
  for (const [keyword, responses] of Object.entries(RESPONSE_MAP)) {
    if (lower.includes(keyword)) {
      return responses[0] ?? null;
    }
  }

  return null;
}

export function isAssistantEnabled(config: Config): boolean {
  return config.assistant.enabled;
}
