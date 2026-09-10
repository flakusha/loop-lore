// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Prompt-improve service tests — per-level parameter threading, content
 * stripping, local-polish fallback, and analysis parsing hardening.
 *
 * LLM path runs through the shared aux pipeline: in-memory DB with an
 * "auxiliary" model-role override to a registered "mock" provider.
 */
import { afterAll, beforeAll, describe, expect, it, } from "bun:test";
import type { Kysely, } from "kysely";
import type { Config, } from "../config/schema";
import { ModelRole, } from "../db/enums";
import type { DB, } from "../db/schema";
import { registerProvider, unregisterProvider, } from "../generation/providers/registry";
import type { GenerateRequest, GenerateResponse, LLMProvider, } from "../generation/providers/types";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertModelRoleOverrides, } from "../test-utils/insert-helpers";
import { promptImproveSystemPrompt, } from "./prompts";
import { improveOrPolish, improvePrompt, parseAnalysis, polishText, } from "./service";

let db: Kysely<DB>;

/** Captured provider requests (mutated by the stub, read by tests). */
let lastReq: GenerateRequest | undefined;

/** Mutable provider response — set per test. */
let providerContent = "Improved text.";

/** Stub LLM provider returning {@link providerContent} and capturing requests. */
function makeCapturingProvider(): LLMProvider {
  const response = (): GenerateResponse => ({
    content: providerContent,
    finishReason: "stop",
    usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30, },
  });
  return {
    capabilities: {
      type: "openai-compatible",
      label: "Stub",
      text: true,
      image: false,
      embeddings: false,
      streaming: false,
      tools: false,
      thinking: false,
    },
    complete: async (req: GenerateRequest,) => {
      lastReq = req;
      return response();
    },
    stream: async (_req: GenerateRequest, _handler: never,) => response(),
    healthCheck: async () => ({ status: "ok", model: "mock-improve-model", }),
    listModels: async () => [],
  };
}

/** Minimal Config stub sufficient for resolveModelRole + BYO resolution. */
function makeConfig(): Config {
  return {
    generation: {
      defaultProvider: "mock",
      defaultModels: {},
      providers: { openaiCompatible: [], },
    },
    byoKey: { enabled: false, encryptionKey: null, },
  } as unknown as Config;
}

beforeAll(async () => {
  createLogger({ level: "error", },);
  const testDb = await createTestDb();
  db = testDb.db;
  await insertModelRoleOverrides(db, "mock", "mock-improve-model", { role: ModelRole.Auxiliary, } as never,);
  registerProvider("mock", makeCapturingProvider(),);
},);

afterAll(() => {
  // Provider registry is process-global — always clean up.
  unregisterProvider("mock",);
},);

describe("improvePrompt level threading", () => {
  it("threads per-level temperature and maxTokens to the provider", async () => {
    providerContent = "Clean text.";
    const spellcheck = await improvePrompt({ level: "spellcheck", text: "helo wrold", config: makeConfig(), db, },);
    expect(lastReq?.params?.temperature,).toBe(0,);
    expect(lastReq?.params?.maxTokens,).toBe(512,);
    expect(spellcheck?.content,).toBe("Clean text.",);
    expect(spellcheck?.level,).toBe("spellcheck",);

    providerContent = "A VIVID rewrite";
    await improvePrompt({ level: "creative", text: "something", config: makeConfig(), db, },);
    expect(lastReq?.params?.temperature,).toBe(0.9,);
    expect(lastReq?.params?.maxTokens,).toBe(1024,);
  });

  it("binds the style reference into the system prompt for style levels", async () => {
    providerContent = "styled text";
    await improvePrompt({
      level: "style-chat",
      text: "something",
      styleContext: "assistant: Hello there!",
      config: makeConfig(),
      db,
    },);
    expect(lastReq?.messages?.[0]?.content,).toContain("STYLE REFERENCE",);
    expect(lastReq?.messages?.[0]?.content,).toContain("assistant: Hello there",);
  });

  it("strips wrapping fences and quotes from provider output", async () => {
    providerContent = "```text\nPolished line.\n```";
    const fenced = await improvePrompt({ level: "wording", text: "x", config: makeConfig(), db, },);
    expect(fenced?.content,).toBe("Polished line.",);

    providerContent = '"Quoted output."';
    const quoted = await improvePrompt({ level: "wording", text: "x", config: makeConfig(), db, },);
    expect(quoted?.content,).toBe("Quoted output.",);
  });

  it("returns null for empty input", async () => {
    const result = await improvePrompt({ level: "wording", text: "   ", config: makeConfig(), db, },);
    expect(result,).toBeNull();
  });
});

describe("improveOrPolish fallback", () => {
  it("falls back to local polish when no aux model resolves", async () => {
    const freshDb = await createTestDb(); // no role overrides → resolution fails
    const result = await improveOrPolish({
      level: "wording",
      text: "hello world",
      config: makeConfig(),
      db: freshDb.db,
    },);
    expect(result.model,).toBe("local-heuristics",);
    expect(result.content,).toBe("Hello world.",);
  });

  it("falls back to local polish on empty input too", async () => {
    const result = await improveOrPolish({
      level: "wording",
      text: "",
      config: makeConfig(),
      db,
    },);
    expect(result.model,).toBe("local-heuristics",);
    expect(result.content,).toBe("",);
  });
});

describe("polishText", () => {
  it("capitalizes, punctuates, and normalizes whitespace", () => {
    expect(polishText("  hello  world ,again  ",),).toBe("Hello world, again.",);
    expect(polishText("Already fine!",),).toBe("Already fine!",);
  });
});

describe("parseAnalysis hardening", () => {
  it("parses a valid analysis", () => {
    const parsed = parseAnalysis(
      '{"intent":"action","clarity":0.8,"issues":[],"suggestions":["add detail"],"confidence":0.9}',
    );
    expect(parsed,).toEqual({
      intent: "action",
      clarity: 0.8,
      issues: [],
      suggestions: ["add detail",],
      confidence: 0.9,
    },);
  });

  it("clamps out-of-range numbers injected by the model", () => {
    const parsed = parseAnalysis(
      '{"intent":"ooc","clarity":5,"issues":[],"suggestions":[],"confidence":-2}',
    );
    expect(parsed?.clarity,).toBe(1,);
    expect(parsed?.confidence,).toBe(0,);
  });

  it("rejects malformed payloads", () => {
    expect(parseAnalysis("no json here",),).toBeNull();
    expect(parseAnalysis('{"intent":"hijacked"}',),).toBeNull();
    expect(parseAnalysis('{"intent":"action","issues":"not-array"}',),).toBeNull();
    expect(parseAnalysis("[]",),).toBeNull();
  });

  it("extracts JSON embedded in chatty output", () => {
    const parsed = parseAnalysis(
      'Here you go: {"intent":"question","clarity":0.5,"issues":["vague"],"suggestions":[],"confidence":0.4} hope this helps',
    );
    expect(parsed?.intent,).toBe("question",);
  });
});

describe("promptImproveSystemPrompt", () => {
  it("returns the bare level instruction without style context", () => {
    const prompt = promptImproveSystemPrompt("spellcheck",);
    expect(prompt,).toContain("Fix spelling mistakes",);
    expect(prompt,).not.toContain("STYLE REFERENCE",);
  });
});
