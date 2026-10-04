// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for build-prompt.ts — prompt assembly boundaries:
 * explicit-prompt passthrough, includeExamples precedence (input > opts >
 * default-true), the strict 85% compaction threshold, best-effort compaction
 * failure handling, and assembler parameter wiring.
 *
 * PromptAssembler / resolveSystemPrompt / ContextCompactor are replaced with
 * deterministic doubles (mock.module) so only build-prompt's own branching is
 * exercised.
 */
import { afterEach, describe, expect, mock, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { AssembledPrompt, } from "../../assistant/prompt/types";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { describeOrSkipStrict, STRICTLY_ISOLATED, } from "../../test-utils/isolate-only";
import type { GenerationMessage, } from "../types";
import type { GenerateRequest, } from "./types";

// ── Doubles ────────────────────────────────────────────────

type Assembled = AssembledPrompt;

const assembleCalls: Record<string, unknown>[] = [];
let assembleResult: Assembled = {
  messages: [{ role: "user", content: "assembled", },],
  systemPrompt: "assembled sys",
  tokenCount: 0,
  tokenBudget: 1000,
  sections: [],
};

const compactCalls: { messages: GenerationMessage[]; budget: number }[] = [];
let compactResult: {
  messages: GenerationMessage[];
  compacted: boolean;
  droppedTokens: number;
} = {
  messages: [{ role: "system", content: "[Conversation Summary]\nsum", },],
  compacted: true,
  droppedTokens: 100,
};

let compactThrows = false;

if (STRICTLY_ISOLATED) {
  mock.module("../../assistant/prompt-assembler", () => ({
    PromptAssembler: class {
      async assemble(params: Record<string, unknown>,): Promise<Assembled> {
        assembleCalls.push(params,);
        return assembleResult;
      }
    },
  }),);
}

if (STRICTLY_ISOLATED) {
  mock.module("../../prompts", () => ({
    resolveSystemPrompt: (_templates: unknown, purpose: string,) => `fallback:${purpose}`,
  }),);
}

if (STRICTLY_ISOLATED) {
  mock.module("../context-compactor", () => ({
    ContextCompactor: class {
      async compact(messages: GenerationMessage[], tokenBudget: number,): Promise<typeof compactResult> {
        compactCalls.push({ messages, budget: tokenBudget, },);
        if (compactThrows) { throw new Error("compactor down",); }
        return compactResult;
      }
    },
  }),);
}

// Static import cannot work here: mock.module must register before the SUT
// import or the real modules bind first (first-wins), so the dynamic import
// below is load-bearing (same convention as the sibling route tests).
const { buildPrompt, } = await import("./build-prompt");
const { resolveSystemPrompt: resolveFn, } = await import("../../prompts");
const { PromptAssembler: AssemblerFn, } = await import("../../assistant/prompt-assembler");
const { ContextCompactor: CompactorFn, } = await import("../context-compactor");

// Bun's mock.module is process-global: without --isolate, an earlier file
// may have replaced these modules first (first-wins), so the factories
// above never apply. Fail-closed: verify this file's own doubles are the
// ones in effect and skip otherwise instead of testing through another
// file's stubs.
//
// A probe that throws means the real implementation is bound — the real
// PromptAssembler queries `this.db.selectFrom`, and the probes below pass a
// stub db. That is the answer "not my doubles", not a test failure, so each
// probe swallows and reports false.
const probe = async (check: () => Promise<boolean> | boolean,): Promise<boolean> => {
  try {
    return await check();
  } catch {
    return false;
  }
};

const promptsSelfOk = await probe(
  () => resolveFn(undefined, "assistant",) === "fallback:assistant",
);

const assemblerSelfOk = await probe(async () => {
  const inst = new AssemblerFn({} as Kysely<DB>,);
  return (await inst.assemble({ actorId: "actor-1", chatId: "chat-1", modelId: "model-x", },)) ===
    assembleResult;
},);

const compactorSelfOk = await probe(async () => {
  const inst = new CompactorFn({},);
  return (await inst.compact([], 1,)) === compactResult;
},);

const buildPromptSelfOk = promptsSelfOk && assemblerSelfOk && compactorSelfOk;
const describeSelf = buildPromptSelfOk ? describeOrSkipStrict : describe.skip;

afterEach(() => {
  compactThrows = false;
},);

// ── Harness ────────────────────────────────────────────────

const mockConfig = {
  templates: { llm: { systemPrompts: { assistant: "custom assistant", }, }, },
} as unknown as Config;

const baseInput = {
  chatId: "chat-1",
  parentMessageId: "p1",
  actorId: "actor-1",
  idempotencyKey: "idem-1",
  repetitionDetection: {},
  policyDetection: {},
  responseLimit: {},
} as unknown as GenerateRequest;

async function run(
  overrides: Partial<GenerateRequest> = {},
  opts: { userId?: string; groupParticipantIds?: string[]; includeExamples?: boolean } = {},
): Promise<{ messages: GenerationMessage[]; systemPrompt: string | undefined }> {
  return buildPrompt({
    input: { ...baseInput, ...overrides, },
    database: {} as Kysely<DB>,
    resolvedModel: "model-x",
    resolvedProviderName: "provider-x",
    cfg: mockConfig,
    ...opts,
  },);
}

// ── Tests ──────────────────────────────────────────────────

describeSelf("buildPrompt — explicit prompt passthrough", () => {
  test("returns the explicit prompt and system prompt without invoking the assembler", async () => {
    assembleCalls.length = 0;
    const prompt: GenerationMessage[] = [
      { role: "user", content: "héllo 🌍", },
      { role: "assistant", content: "réponse", },
    ];

    const { messages, systemPrompt, } = await run({ prompt, systemPrompt: "custom sys", },);
    expect(messages,).toBe(prompt,);
    expect(systemPrompt,).toBe("custom sys",);
    expect(assembleCalls.length,).toBe(0,);
  });

  test("falls through to the assembler when the prompt list is empty", async () => {
    assembleCalls.length = 0;
    const { messages, } = await run({ prompt: [], },);
    expect(assembleCalls.length,).toBe(1,);
    expect(messages,).toBe(assembleResult.messages,);
  });
},);

describeSelf("buildPrompt — includeExamples precedence", () => {
  test("input.includeExamples=false wins over opts.includeExamples=true", async () => {
    assembleCalls.length = 0;
    await run({ includeExamples: false, }, { includeExamples: true, },);
    expect(assembleCalls[0]!.includeExamples,).toBe(false,);
  });

  test("opts.includeExamples=false applies when the input omits the flag", async () => {
    assembleCalls.length = 0;
    await run({}, { includeExamples: false, },);
    expect(assembleCalls[0]!.includeExamples,).toBe(false,);
  });

  test("defaults to true when neither input nor opts set the flag", async () => {
    assembleCalls.length = 0;
    await run({}, {},);
    expect(assembleCalls[0]!.includeExamples,).toBe(true,);
  });
},);

describeSelf("buildPrompt — 85% compaction threshold", () => {
  test("compacts when tokenCount exceeds 85% of the budget", async () => {
    compactCalls.length = 0;
    assembleResult = { ...assembleResult, tokenCount: 851, tokenBudget: 1000, };
    const { messages, } = await run({}, {},);
    expect(compactCalls.length,).toBe(1,);
    expect(compactCalls[0]!.budget,).toBe(1000,);
    expect(messages,).toBe(compactResult.messages,);
  });

  test("skips compaction at exactly 85% of the budget (strict >)", async () => {
    compactCalls.length = 0;
    assembleResult = { ...assembleResult, tokenCount: 850, tokenBudget: 1000, };
    const { messages, } = await run({}, {},);
    expect(compactCalls.length,).toBe(0,);
    expect(messages,).toBe(assembleResult.messages,);
  });

  test("keeps assembled messages when the compactor reports no compaction", async () => {
    compactCalls.length = 0;
    compactResult = { ...compactResult, compacted: false, };
    assembleResult = { ...assembleResult, tokenCount: 900, tokenBudget: 1000, };
    const { messages, } = await run({}, {},);
    expect(compactCalls.length,).toBe(1,);
    expect(messages,).toBe(assembleResult.messages,);
  });

  test("proceeds with full context when the compactor throws", async () => {
    compactCalls.length = 0;
    compactThrows = true;
    assembleResult = { ...assembleResult, tokenCount: 900, tokenBudget: 1000, };
    const { messages, } = await run({}, {},);
    expect(compactCalls.length,).toBe(1,);
    expect(messages,).toBe(assembleResult.messages,);
  });
},);

describeSelf("buildPrompt — assembler wiring", () => {
  test("passes resolved ids, user, group participants, and system prompt fallback", async () => {
    assembleCalls.length = 0;
    await run({ systemPrompt: "override sys", }, { userId: "user-9", groupParticipantIds: ["a", "b",], },);
    const params = assembleCalls[0]!;
    expect(params.actorId,).toBe("actor-1",);
    expect(params.chatId,).toBe("chat-1",);
    expect(params.modelId,).toBe("model-x",);
    expect(params.providerId,).toBe("provider-x",);
    expect(params.userId,).toBe("user-9",);
    expect(params.systemPromptOverride,).toBe("override sys",);
    expect(params.systemPromptFallback,).toBe("fallback:assistant",);
    expect(params.config,).toBe(mockConfig,);
    expect(params.groupParticipantIds,).toEqual(["a", "b",],);
    expect(params.task,).toBe("chat-reply",);
  });
},);
