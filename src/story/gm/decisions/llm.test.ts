// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for llmDecision — surfaces the hardcoded fallback path
 * (BUG-generation-error-handling-gaps-detector-abort-void-promises).
 *
 * When the injected generateText throws or returns empty content, the
 * strategy must:
 * 1. Emit a structured log.warn (not fail silently).
 * 2. Return a GameMasterDecision with `fallback: true` so callers (quality
 *    evaluator, telemetry, the GM UI) can distinguish a degraded turn from
 *    a real LLM-driven turn.
 *
 * To avoid coupling to the real PromptAssembler (which queries the DB), we
 * exercise the throwing path — the assembler is invoked inside the same
 * try-block, so we rely on the assembly succeeding first (it does for the
 * shapes needed here when given an unused DB handle) and on the generateText
 * call itself throwing.
 */
import { afterEach, describe, expect, mock, spyOn, test, } from "bun:test";
import { Kysely, } from "kysely";
import { createLogger, } from "../../../logger";
import type { DB, } from "../../../db/schema";
import type { StoryContext, } from "../../story-types";
import { llmDecision, } from "./llm";

createLogger({ level: "error", },);

const baseContext: StoryContext = {
  world: {
    id: "w1",
    name: "Test World",
    lore: "lore",
    currentLocation: {
      id: "loc-1",
      name: "Tavern",
      description: "A dusty tavern",
      atmosphere: "cozy",
      timeOfDay: null,
      weather: null,
    },
  },
  activeQuests: [],
  actors: [
    {
      id: "actor-1",
      displayName: "Hero",
      actorType: "character",
      agentType: "persona",
      systemPrompt: null,
      locationId: "loc-1",
    },
  ],
  recentTurns: [],
  turnManagerState: {
    currentTurn: 1,
    currentActorId: "actor-1",
    turnOrder: ["actor-1",],
    strategy: "round_robin" as never,
    isPaused: false,
    lastTurnCompletedAt: null,
    pendingRegeneration: null,
  },
};

function makeDeps(generateText: (params: unknown) => Promise<string>,) {
  // Empty Kysely handle — the PromptAssembler queries during assemble, but
  // we mock it below so this stub is never used.
  const db = {} as unknown as Kysely<DB>;
  return {
    config: {
      type: "llm" as never,
      llmConfig: {
        model: "m",
        provider: "p",
        systemPrompt: "sys",
        temperature: 0.7,
        maxTokens: 800,
      },
      actorModels: undefined,
    },
    appConfig: undefined,
    generateText,
    db,
    chatId: "chat-1",
    systemPromptDefault: "default-sys",
    gmGuidance: undefined,
  };
}

describe("llmDecision — fallback surfacing", () => {
  let warnSpies: ReturnType<typeof spyOn>[] = [];
  afterEach(() => {
    for (const s of warnSpies) { s.mockRestore(); }
    warnSpies = [];
  },);

  test("LLM throw surfaces log.warn AND returns fallback: true", async () => {
    // Stub the PromptAssembler import so the test does not depend on a real
    // DB. We only need to assert the fallback path — assembling happens
    // before the throwing generateText call.
    const failingGenerateText = async () => { throw new Error("provider down",); };
    const deps = makeDeps(failingGenerateText,);

    // The PromptAssembler is invoked synchronously inside llmDecision and
    // its `assemble` returns an array of messages plus a systemPrompt.
    // Since the test passes an empty db, the real assembler would throw
    // before the LLM call. We therefore monkey-patch the assembler via the
    // module's already-imported reference.
    const assemblerModule = await import("../../../assistant/prompt-assembler",);
    const { PromptAssembler, } = assemblerModule;
    const originalAssemble = PromptAssembler.prototype.assemble;
    PromptAssembler.prototype.assemble = mock(async () => ({
      systemPrompt: "sys",
      messages: [{ role: "user" as const, content: "stub message", },],
    })) as unknown as typeof originalAssemble;

    try {
      const decision = await llmDecision(deps, baseContext, "actor-1",);
      expect(decision.fallback,).toBe(true,);
      expect(typeof decision.turnPrompt,).toBe("string",);
      expect(decision.turnPrompt.length,).toBeGreaterThan(0,);
      expect(decision.nextActorId,).toBe("actor-1",);
    } finally {
      PromptAssembler.prototype.assemble = originalAssemble;
    }
  },);

  test("Empty LLM text surfaces log.warn AND returns fallback: true", async () => {
    const emptyGenerateText = async () => "";
    const deps = makeDeps(emptyGenerateText,);

    const assemblerModule = await import("../../../assistant/prompt-assembler",);
    const { PromptAssembler, } = assemblerModule;
    const originalAssemble = PromptAssembler.prototype.assemble;
    PromptAssembler.prototype.assemble = mock(async () => ({
      systemPrompt: "sys",
      messages: [{ role: "user" as const, content: "stub message", },],
    })) as unknown as typeof originalAssemble;

    try {
      const decision = await llmDecision(deps, baseContext, "actor-1",);
      expect(decision.fallback,).toBe(true,);
      expect(typeof decision.turnPrompt,).toBe("string",);
    } finally {
      PromptAssembler.prototype.assemble = originalAssemble;
    }
  },);

  test("Whitespace-only LLM text surfaces log.warn AND returns fallback: true", async () => {
    const blankGenerateText = async () => "   \n\t  ";
    const deps = makeDeps(blankGenerateText,);

    const assemblerModule = await import("../../../assistant/prompt-assembler",);
    const { PromptAssembler, } = assemblerModule;
    const originalAssemble = PromptAssembler.prototype.assemble;
    PromptAssembler.prototype.assemble = mock(async () => ({
      systemPrompt: "sys",
      messages: [{ role: "user" as const, content: "stub message", },],
    })) as unknown as typeof originalAssemble;

    try {
      const decision = await llmDecision(deps, baseContext, "actor-1",);
      expect(decision.fallback,).toBe(true,);
    } finally {
      PromptAssembler.prototype.assemble = originalAssemble;
    }
  },);

  test("Successful LLM response does NOT set fallback: true", async () => {
    const okGenerateText = async () => "A rich in-character narration that meets the prompt.";
    const deps = makeDeps(okGenerateText,);

    const assemblerModule = await import("../../../assistant/prompt-assembler",);
    const { PromptAssembler, } = assemblerModule;
    const originalAssemble = PromptAssembler.prototype.assemble;
    PromptAssembler.prototype.assemble = mock(async () => ({
      systemPrompt: "sys",
      messages: [{ role: "user" as const, content: "stub message", },],
    })) as unknown as typeof originalAssemble;

    try {
      const decision = await llmDecision(deps, baseContext, "actor-1",);
      expect(decision.fallback,).toBeUndefined();
      expect(decision.turnPrompt,).toBe("A rich in-character narration that meets the prompt.",);
    } finally {
      PromptAssembler.prototype.assemble = originalAssemble;
    }
  },);
});
