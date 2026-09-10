// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { beforeAll, describe, expect, it, } from "bun:test";
import type { Config, } from "../../config/schema";
import { ModelRole, } from "../../db/enums";
import { registerProvider, unregisterProvider, } from "../../generation/providers/registry";
import type { GenerateRequest, GenerateResponse, LLMProvider, } from "../../generation/providers/types";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertModelRoleOverrides, } from "../../test-utils/insert-helpers";
import { runImprove, } from "./improve";
import { type CommandContext, getCommand, } from "./registry";

beforeAll(() => {
  createLogger({ level: "error", },);
},);

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

/** Stub LLM provider returning a fixed improvement. */
function makeStubProvider(content: string,): LLMProvider {
  const response = (): GenerateResponse => ({
    content,
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
    complete: async (_req: GenerateRequest,) => response(),
    stream: async (_req: GenerateRequest, _handler: never,) => response(),
    healthCheck: async () => ({ status: "ok", model: "mock-improve-model", }),
    listModels: async () => [],
  };
}

describe("improve command", () => {
  it("is registered", () => {
    expect(getCommand("improve",),).toBeDefined();
  });

  it("uses the shared AUX service output when an auxiliary model resolves", async () => {
    const { db, } = await createTestDb();
    await insertModelRoleOverrides(db, "mock", "mock-improve-model", { role: ModelRole.Auxiliary, } as never,);
    registerProvider("mock", makeStubProvider("A clearer sentence.",),);
    try {
      const ctx: CommandContext = { chatId: "c1", db, config: makeConfig(), userId: "u1", };
      const result = await runImprove(["this needs clarity",], ctx,);

      expect(result.systemMessage,).toContain("A clearer sentence.",);
      expect(result.systemMessage,).not.toContain("LLM unavailable",);
      expect(result.actionPayload,).toEqual(
        expect.objectContaining({ original: "this needs clarity", level: "wording", },),
      );
    } finally {
      // Provider registry is process-global — always remove the mock.
      unregisterProvider("mock",);
    }
  });

  it("degrades to local heuristics when no auxiliary model is configured", async () => {
    const { db, } = await createTestDb();
    const ctx: CommandContext = { chatId: "c1", db, config: makeConfig(), userId: "u1", };
    const result = await runImprove(["hello world",], ctx,);

    expect(result.systemMessage,).toContain("LLM unavailable — applied local heuristics only",);
    expect(result.systemMessage,).toContain("Hello world.",);
    expect(result.actionPayload,).toEqual(
      expect.objectContaining({ fallback: true, },),
    );
  });

  it("falls back to local heuristics without backend context", async () => {
    const result = await runImprove(
      ["hello world",],
      { chatId: "c1", },
    );

    expect(result.systemMessage,).toContain("LLM unavailable — applied local heuristics only",);
    expect(result.systemMessage,).toContain("Hello world.",);
    expect(result.actionPayload,).toEqual(
      expect.objectContaining({ fallback: true, },),
    );
  });

  it("returns usage hint when no text is supplied", async () => {
    const result = await runImprove([], { chatId: "c1", },);
    expect(result.systemMessage,).toContain("Usage",);
  });

  it("honors the --level flag", async () => {
    const { db, } = await createTestDb();
    const ctx: CommandContext = { chatId: "c1", db, config: makeConfig(), userId: "u1", };
    const result = await runImprove(["hello world", "--level", "creative",], ctx,);
    expect(result.actionPayload,).toEqual(
      expect.objectContaining({ level: "creative", fallback: true, },),
    );
  });

  describe("edge cases", () => {
    it("handles 10KB input prompt", async () => {
      const huge = "lorem ipsum dolor sit amet ".repeat(500,);
      const result = await runImprove([huge,], { chatId: "c1", },);
      expect(typeof result.systemMessage,).toBe("string",);
      expect(result.systemMessage?.length ?? 0,).toBeGreaterThan(0,);
    });

    it("handles unicode + emoji input", async () => {
      const result = await runImprove(["日本語 🎌 test",], { chatId: "c1", },);
      expect(result.systemMessage,).toContain("LLM unavailable",);
    });

    it("discards malformed --level values and keeps default", async () => {
      const result = await runImprove(
        ["hello world", "--level", "nonsense",],
        { chatId: "c1", },
      );
      expect(result.actionPayload,).toEqual(
        expect.objectContaining({ level: "wording", },),
      );
    });
  });
});
