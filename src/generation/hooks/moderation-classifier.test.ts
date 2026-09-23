// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Moderation classifier tests — LLM severity verdict mapping and the
 * ModerationHook escalation wiring (escalate / llm-only / fail-open / flag-off).
 *
 * Resource contract: fully in-memory and parallel-safe — every test builds its
 * own HookContext and AUX mock (never shared across tests); no files, ports,
 * sockets, or DB; the only global touched is the process logger, configured
 * identically to the rest of the suite. Passes alone, in any order, and
 * alongside hooks.test.ts.
 */
import { beforeAll, describe, expect, mock, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { AuxCallOptions, AuxCallResult, AuxTaskName, callAux, } from "../../aux-pipeline";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import type { GenerationMessage, } from "../../generation/gen-types-options";
import { createLogger, } from "../../logger";
import { detectModerationWithLlm, } from "./moderation-classifier";
import { ModerationHook, } from "./moderation-hook";
import type { HookContext, } from "./types";

// ── Helpers ──────────────────────────────────────────────────

/**
 * @param overrides
 */
function makeCtx(overrides?: Partial<HookContext>,): HookContext {
  return {
    chatId: "chat-1",
    actorId: "actor-1",
    userId: "user-1",
    content: "",
    config: {
      hooks: { enableModerationLlmClassifier: true, },
      templates: { llm: { systemPrompts: {}, }, },
    } as unknown as Config,
    nsfwConfig: {
      allowNsfw: true,
      nsfwMinAge: 18,
      defaultNsfwScope: "chat",
      consentRequired: true,
      auditLogging: true,
      useLlmClassifier: false,
    },
    db: {} as Kysely<DB>,
    ...overrides,
  };
}

/**
 * @param severity
 */
function auxReply(severity: string,): AuxCallResult {
  return {
    content: JSON.stringify({ severity, categories: [], confidence: 0.9, },),
    model: "test-model",
    provider: "test",
    latencyMs: 1,
    promptTokens: 1,
    completionTokens: 1,
  };
}

/**
 * @param impl
 */
/** callAux double with bun's mock handle surfaced for call assertions. */
type AuxMockArgs = [AuxTaskName, Config, Kysely<DB>, GenerationMessage[], (AuxCallOptions | undefined)?,];
type AuxMock = typeof callAux & { mock: { calls: AuxMockArgs[] } };

function makeAux(impl: () => Promise<AuxCallResult | null>,): AuxMock {
  return mock(
    async (
      _task: AuxTaskName,
      _config: Config,
      _db: Kysely<DB>,
      _messages: GenerationMessage[],
      _opts?: AuxCallOptions,
    ) => impl(),
  ) as unknown as AuxMock;
}

/**
 * @param aux
 */
function makeHook(aux: typeof callAux,): ModerationHook {
  return new ModerationHook({
    callAux: aux,
    auditRecorder: () => ({ recordAction: async () => ({}), }),
  },);
}

// ── detectModerationWithLlm ──────────────────────────────────

describe("detectModerationWithLlm", () => {
  beforeAll(() => {
    createLogger({ level: "error", },);
  },);

  test("maps severe verdict and passes the AUX contract", async () => {
    const aux = makeAux(async () => auxReply("severe",));
    const verdict = await detectModerationWithLlm("some hostile message", makeCtx(), aux,);
    expect(verdict,).toBe("severe",);
    expect(aux.mock.calls,).toHaveLength(1,);
    const [task, , , messages, opts,] = aux.mock.calls[0]!;
    expect(task,).toBe("moderation",);
    expect(messages[0]!.content,).toContain("content moderation classifier",);
    expect(messages[1]!.content,).toBe("some hostile message",);
    expect(opts?.temperature,).toBe(0,);
    expect(opts?.maxTokens,).toBe(50,);
  });

  test("truncates user content to 500 chars", async () => {
    const aux = makeAux(async () => auxReply("moderate",));
    const verdict = await detectModerationWithLlm("x".repeat(600,), makeCtx(), aux,);
    expect(verdict,).toBe("moderate",);
    expect(aux.mock.calls[0]![3]![1]!.content,).toHaveLength(500,);
  });

  test("clean and unknown severities map to null", async () => {
    const clean = await detectModerationWithLlm("x", makeCtx(), makeAux(async () => auxReply("clean",)),);
    const unknown = await detectModerationWithLlm("x", makeCtx(), makeAux(async () => auxReply("bogus",)),);
    expect(clean,).toBeNull();
    expect(unknown,).toBeNull();
  });

  test("null AUX response maps to null", async () => {
    const verdict = await detectModerationWithLlm("x", makeCtx(), makeAux(async () => null),);
    expect(verdict,).toBeNull();
  });

  test("AUX failure fails open to null", async () => {
    const aux = makeAux(async () => {
      throw new Error("boom",);
    },);
    const verdict = await detectModerationWithLlm("x", makeCtx(), aux,);
    expect(verdict,).toBeNull();
  });

  test("systemPrompts.moderation override wins over the default", async () => {
    const aux = makeAux(async () => auxReply("severe",));
    const ctx = makeCtx({
      config: {
        hooks: { enableModerationLlmClassifier: true, },
        templates: { llm: { systemPrompts: { moderation: "CUSTOM", }, }, },
      } as unknown as Config,
    },);
    await detectModerationWithLlm("x", ctx, aux,);
    expect(aux.mock.calls[0]![3]![0]!.content,).toBe("CUSTOM",);
  });
});

// ── ModerationHook LLM escalation ────────────────────────────

describe("ModerationHook LLM escalation", () => {
  beforeAll(() => {
    createLogger({ level: "error", },);
  },);

  test("moderate keyword is escalated to severe and suppressed", async () => {
    const aux = makeAux(async () => auxReply("severe",));
    const result = await makeHook(aux,).execute("That was a rude and offensive insult.", makeCtx(),);
    expect(result.handled,).toBe(true,);
    expect(result.suppressContent,).toBe(true,);
    expect(result.data?.severity,).toBe("severe",);
    expect(result.data?.llmEscalated,).toBe(true,);
    expect(result.reason,).toContain("llm-escalated",);
    expect(aux.mock.calls[0]![0],).toBe("moderation",);
  });

  test("clean keyword content is flagged llm-only when the LLM says severe", async () => {
    const aux = makeAux(async () => auxReply("severe",));
    const result = await makeHook(aux,).execute("Have a wonderful day full of kindness!", makeCtx(),);
    expect(result.handled,).toBe(true,);
    expect(result.suppressContent,).toBe(true,);
    expect(result.data?.llmOnly,).toBe(true,);
    expect(result.data?.matched,).toEqual([],);
    expect(result.data?.llmEscalated,).toBe(false,);
  });

  test("LLM failure keeps the keyword verdict", async () => {
    const aux = makeAux(async () => {
      throw new Error("boom",);
    },);
    const result = await makeHook(aux,).execute("That was a rude and offensive insult.", makeCtx(),);
    expect(result.handled,).toBe(true,);
    expect(result.suppressContent,).toBeFalsy();
    expect(result.data?.severity,).toBe("moderate",);
    expect(result.data?.llmEscalated,).toBe(false,);
  });

  test("flag disabled → no AUX call, keyword verdict stands", async () => {
    const aux = makeAux(async () => auxReply("severe",));
    const ctx = makeCtx({
      config: {
        hooks: { enableModerationLlmClassifier: false, },
        templates: { llm: { systemPrompts: {}, }, },
      } as unknown as Config,
    },);
    const clean = await makeHook(aux,).execute("Have a wonderful day full of kindness!", ctx,);
    expect(clean.handled,).toBe(false,);
    const flagged = await makeHook(aux,).execute("That was a rude and offensive insult.", ctx,);
    expect(flagged.handled,).toBe(true,);
    expect(flagged.suppressContent,).toBeFalsy();
    expect(flagged.data?.llmEscalated,).toBe(false,);
    expect(aux.mock.calls,).toHaveLength(0,);
  });
});
