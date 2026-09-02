// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { beforeAll, describe, expect, it, } from "bun:test";
import type { GenerateRequest, } from "../../generation/providers/types";
import { createLogger, } from "../../logger";
import { getCommand, } from "./registry";
import { runImprove, } from "./improve";

beforeAll(() => {
  createLogger({ level: "error", },);
},);

describe("improve command", () => {
  it("is registered", () => {
    expect(getCommand("improve",),).toBeDefined();
  });

  it("uses the LLM output when complete is provided", async () => {
    let captured: GenerateRequest | undefined;
    const complete = async (req: GenerateRequest,): Promise<{ content: string }> => {
      captured = req;
      return { content: "A clearer sentence.", };
    };

    const result = await runImprove(
      ["this needs clarity",],
      { chatId: "c1", },
      { complete, },
    );

    // System prompt must match the spec verbatim
    expect(captured?.messages[0]?.content,).toBe(
      "Rewrite the following text for clarity and flow. Preserve meaning.",
    );
    expect(captured?.messages[1]?.content,).toBe("this needs clarity",);
    expect(result.systemMessage,).toContain("A clearer sentence.",);
    expect(result.systemMessage,).not.toContain("LLM unavailable",);
  });

  it("falls back to local heuristics when complete is undefined", async () => {
    const result = await runImprove(
      ["hello world",],
      { chatId: "c1", },
      {},
    );

    expect(result.systemMessage,).toContain("LLM unavailable — applied local heuristics only",);
    expect(result.systemMessage,).toContain("Hello world.",);
    expect(result.actionPayload,).toEqual(
      expect.objectContaining({ fallback: true, }),
    );
  });

  it("falls back to local heuristics when complete throws", async () => {
    const complete = async (): Promise<{ content: string }> => {
      throw new Error("provider down",);
    };
    const result = await runImprove(
      ["hello world",],
      { chatId: "c1", },
      { complete, },
    );
    expect(result.systemMessage,).toContain("LLM unavailable — applied local heuristics only",);
    expect(result.systemMessage,).toContain("Hello world.",);
  });

  it("returns usage hint when no text is supplied", async () => {
    const result = await runImprove([], { chatId: "c1", }, { complete: async () => ({ content: "x", }), },);
    expect(result.systemMessage,).toContain("Usage",);
  });
});
