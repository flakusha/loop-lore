// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Unit tests for LLM prompt-template rendering (FEAT-065-LLM): static
 * sections, variable substitution, enabled filtering, system prompt pick,
 * and priority-based token-budget trimming.
 */
import { describe, expect, test, } from "bun:test";
import type { DB, } from "../../db/schema";
import type { Kysely, } from "kysely";
import { assembleFromTemplate, } from "./template-render";
import type { AssembleContext, } from "./types";
import type { LlmTemplatePayload, } from "../../generation/template-types";

/**
 * Static-only assembly context: no DB reads (userId empty) and no built-in
 * section references, so sections render purely from `content`.
 */
function makeCtx(tokenBudget: number,): AssembleContext {
  return {
    db: null as unknown as Kysely<DB>,
    actor: {
      id: "actor-1",
      display_name: "Seraphine",
      system_prompt: null,
      description: "desc",
      personality: null,
      scenario: null,
      post_history_instructions: null,
      mes_example: null,
      agent_role: null,
      settings: null,
    },
    chat: {
      id: "chat-1",
      mode: "chat",
      world_id: null,
      current_location_id: null,
    },
    params: { chatId: "chat-1", actorId: "actor-1", userId: "", modelId: "test-model", },
    isStory: false,
    tokenBudget,
  };
}

describe("assembleFromTemplate", () => {
  test("renders enabled static sections in order with variable substitution", async () => {
    const payload: LlmTemplatePayload = {
      sections: [
        { identifier: "", role: "system", content: "You are {{charName}}.", enabled: true, priority: 3, },
        { identifier: "", role: "user", content: "Hello", enabled: true, priority: 1, },
        { identifier: "", role: "assistant", content: "Hidden", enabled: false, priority: 1, },
      ],
    };
    const res = await assembleFromTemplate(makeCtx(10_000,), payload,);
    expect(res.messages.map((m,) => `${m.role}:${m.content}`,),).toEqual(
      ["system:You are Seraphine.", "user:Hello",],
    );
    expect(res.systemPrompt,).toBe("You are Seraphine.",);
    expect(res.tokenCount,).toBeGreaterThan(0,);
    expect(res.sections.every((s,) => !s.dropped,),).toBe(true,);
  },);

  test("drops low-priority sections over budget", async () => {
    const long = "x".repeat(600,);
    const payload: LlmTemplatePayload = {
      sections: [
        { identifier: "", role: "system", content: "core", enabled: true, priority: 0, },
        { identifier: "", role: "user", content: long, enabled: true, priority: 3, },
      ],
    };
    const res = await assembleFromTemplate(makeCtx(50,), payload,);
    expect(res.sections.some((s,) => s.dropped,),).toBe(true,);
    expect(res.sections.find((s,) => s.name === "custom:0",)?.dropped,).toBe(false,);
    expect(res.tokenCount,).toBeLessThanOrEqual(50,);
  },);

  test("reports linked-but-unknown builtin identifiers as static content", async () => {
    const payload: LlmTemplatePayload = {
      sections: [
        { identifier: "noSuchBuiltin", role: "system", content: "fallback", enabled: true, priority: 1, },
      ],
    };
    const res = await assembleFromTemplate(makeCtx(10_000,), payload,);
    expect(res.messages[0]?.content,).toBe("fallback",);
  },);
});
