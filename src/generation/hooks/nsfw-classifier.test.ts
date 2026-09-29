// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for nsfw-classifier.ts — keyword tiers and the LLM fallback.
 *
 * detectNsfwLevel: tier precedence (intense > moderate > mild), case
 * insensitivity, substring matching, empty input.
 * detectNsfwWithLlm: rating → NsfwLevel mapping, null/missing/unknown rating
 * degradation to "none", LLM failure fail-open, 500-char truncation, system
 * prompt resolution, and the AUX call contract.
 *
 * Resource contract: fully in-memory — no DB, no files, no network; the only
 * global touched is the process logger, configured identically to the rest of
 * the suite.
 */
import { beforeAll, describe, expect, mock, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { AuxCallOptions, AuxCallResult, AuxTaskName, callAux, } from "../../aux-pipeline";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import type { GenerationMessage, } from "../../generation/gen-types-options";
import { createLogger, } from "../../logger";
import { detectNsfwLevel, detectNsfwWithLlm, } from "./nsfw-classifier";
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
      templates: { llm: { systemPrompts: {}, }, },
    } as unknown as Config,
    nsfwConfig: {
      allowNsfw: true,
      nsfwMinAge: 18,
      defaultNsfwScope: "chat",
      consentRequired: true,
      auditLogging: false,
      useLlmClassifier: true,
    },
    db: {} as Kysely<DB>,
    ...overrides,
  };
}

/**
 * @param rating
 */
function auxReply(rating: string,): AuxCallResult {
  return {
    content: JSON.stringify({ rating, },),
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

// ── detectNsfwLevel ─────────────────────────────────────────

describe("detectNsfwLevel", () => {
  beforeAll(() => {
    createLogger({ level: "error", },);
  },);

  test("returns intense for each intense keyword", () => {
    for (const kw of ["explicit", "graphic", "violent", "brutal", "gore",]) {
      expect(detectNsfwLevel(`some ${kw} content here`,),).toBe("intense",);
    }
  },);

  test("returns moderate for each moderate keyword", () => {
    for (const kw of ["suggestive", "provocative", "steamy", "passionate", "arousing",]) {
      expect(detectNsfwLevel(`some ${kw} content here`,),).toBe("moderate",);
    }
  },);

  test("returns mild for each mild keyword", () => {
    for (const kw of ["flirt", "attractive", "beautiful", "handsome", "charming",]) {
      expect(detectNsfwLevel(`some ${kw} content here`,),).toBe("mild",);
    }
  },);

  test("matches keywords case-insensitively", () => {
    expect(detectNsfwLevel("EXPLICIT content",),).toBe("intense",);
    expect(detectNsfwLevel("Very GORE-ish",),).toBe("intense",);
    expect(detectNsfwLevel("quite Steamy",),).toBe("moderate",);
    expect(detectNsfwLevel("so CHARMING",),).toBe("mild",);
  },);

  test("intense outranks moderate and mild", () => {
    expect(detectNsfwLevel("explicit, suggestive and flirtatious",),).toBe("intense",);
  },);

  test("moderate outranks mild", () => {
    expect(detectNsfwLevel("suggestive and flirtatious",),).toBe("moderate",);
  },);

  test("matches keywords as substrings", () => {
    expect(detectNsfwLevel("explicitly described",),).toBe("intense",);
    expect(detectNsfwLevel("blood and gorefest",),).toBe("intense",);
  },);

  test("returns none when no keyword is present", () => {
    expect(detectNsfwLevel("a perfectly innocent gardening manual",),).toBe("none",);
    expect(detectNsfwLevel("",),).toBe("none",);
  },);
});

// ── detectNsfwWithLlm ───────────────────────────────────────

describe("detectNsfwWithLlm", () => {
  beforeAll(() => {
    createLogger({ level: "error", },);
  },);

  test("maps each nsfw rating to its level", async () => {
    expect(await detectNsfwWithLlm("x", makeCtx(), makeAux(async () => auxReply("nsfw_mild"),)),).toBe("mild",);
    expect(await detectNsfwWithLlm("x", makeCtx(), makeAux(async () => auxReply("nsfw_moderate"),)),).toBe("moderate",);
    expect(await detectNsfwWithLlm("x", makeCtx(), makeAux(async () => auxReply("nsfw_intense"),)),).toBe("intense",);
    expect(await detectNsfwWithLlm("x", makeCtx(), makeAux(async () => auxReply("nsfw_extreme"),)),).toBe("extreme",);
  },);

  test("null AUX response degrades to none", async () => {
    const verdict = await detectNsfwWithLlm("x", makeCtx(), makeAux(async () => null,),);
    expect(verdict,).toBe("none",);
  },);

  test("missing rating degrades to none", async () => {
    const aux = makeAux(async () => ({ content: "{}", model: "m", provider: "p", latencyMs: 1, promptTokens: 1, completionTokens: 1, }),);
    expect(await detectNsfwWithLlm("x", makeCtx(), aux,),).toBe("none",);
  },);

  test("unknown or sfw rating degrades to none", async () => {
    const sfw = await detectNsfwWithLlm("x", makeCtx(), makeAux(async () => auxReply("sfw"),));
    const unknown = await detectNsfwWithLlm("x", makeCtx(), makeAux(async () => auxReply("bogus"),));
    expect(sfw,).toBe("none",);
    expect(unknown,).toBe("none",);
  },);

  test("AUX failure fails open to none", async () => {
    const aux = makeAux(async () => {
      throw new Error("boom",);
    },);
    expect(await detectNsfwWithLlm("x", makeCtx(), aux,),).toBe("none",);
  },);

  test("truncates user content to 500 chars", async () => {
    const aux = makeAux(async () => auxReply("nsfw_mild"),);
    await detectNsfwWithLlm("x".repeat(600,), makeCtx(), aux,);
    expect(aux.mock.calls[0]![3]![1]!.content,).toHaveLength(500,);
  },);

  test("resolves the system prompt from config templates", async () => {
    const aux = makeAux(async () => auxReply("nsfw_mild"),);
    const ctx = makeCtx({
      config: {
        templates: { llm: { systemPrompts: { nsfw: "CUSTOM NSFW PROMPT", }, }, },
      } as unknown as Config,
    },);
    await detectNsfwWithLlm("x", ctx, aux,);
    expect(aux.mock.calls[0]![3]![0]!.content,).toBe("CUSTOM NSFW PROMPT",);
  },);

  test("passes the AUX contract (task, temperature, maxTokens, user/chat)", async () => {
    const aux = makeAux(async () => auxReply("nsfw_intense"),);
    await detectNsfwWithLlm("questionable content", makeCtx(), aux,);
    expect(aux.mock.calls,).toHaveLength(1,);
    const [task, , , messages, opts,] = aux.mock.calls[0]!;
    expect(task,).toBe("nsfw",);
    expect(messages[1]!.content,).toBe("questionable content",);
    expect(opts?.temperature,).toBe(0,);
    expect(opts?.maxTokens,).toBe(50,);
    expect(opts?.userId,).toBe("user-1",);
    expect(opts?.chatId,).toBe("chat-1",);
  },);
});
