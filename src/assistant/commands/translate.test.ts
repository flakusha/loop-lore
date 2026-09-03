// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { beforeAll, describe, expect, it, } from "bun:test";
import { readFileSync, } from "node:fs";
import { join, } from "node:path";
import type { GenerateRequest, } from "../../generation/providers/types";
import { createLogger, } from "../../logger";
import { getCommand, } from "./registry";
import { LANGUAGES, runTranslate, } from "./translate";

beforeAll(() => {
  createLogger({ level: "error", },);
},);

describe("translate command", () => {
  it("is registered", () => {
    expect(getCommand("translate",),).toBeDefined();
  });

  it("registers the /tl alias", () => {
    expect(getCommand("tl",),).toBeDefined();
  });

  it("covers the supported language set", () => {
    expect(Object.keys(LANGUAGES,),).toEqual(
      ["en", "es", "fr", "de", "ja", "ko", "zh", "pt", "ru", "ar",],
    );
  });

  it("uses the LLM output when complete is provided (parse: <text> to <lang>)", async () => {
    let captured: GenerateRequest | undefined;
    const complete = async (req: GenerateRequest,): Promise<{ content: string }> => {
      captured = req;
      return { content: "Hola mundo", };
    };

    const result = await runTranslate(
      ["Hello world", "to", "es",],
      { chatId: "c1", },
      { complete, },
    );

    expect(captured?.messages[0]?.content,).toBe(
      "Translate the following text into Spanish. Output ONLY the translated text.",
    );
    expect(captured?.messages[1]?.content,).toBe("Hello world",);
    expect(result.systemMessage,).toContain("Hola mundo",);
    expect(result.systemMessage,).not.toContain("[Translation to",);
    expect(result.systemMessage,).not.toContain("LLM unavailable",);
  });

  it("uses the LLM output for the <lang> <text> form", async () => {
    let captured: GenerateRequest | undefined;
    const complete = async (req: GenerateRequest,): Promise<{ content: string }> => {
      captured = req;
      return { content: "Hello world", };
    };

    const result = await runTranslate(
      ["en", "Hola mundo",],
      { chatId: "c1", },
      { complete, },
    );

    expect(captured?.messages[0]?.content,).toBe(
      "Translate the following text into English. Output ONLY the translated text.",
    );
    expect(captured?.messages[1]?.content,).toBe("Hola mundo",);
    expect(result.systemMessage,).toContain("Hello world",);
  });

  it("falls back when complete is undefined and appends the system note", async () => {
    const result = await runTranslate(
      ["Hello world", "to", "es",],
      { chatId: "c1", },
      {},
    );

    expect(result.systemMessage,).toContain("LLM unavailable — applied local heuristics only",);
    expect(result.systemMessage,).toContain("Hello world",);
    expect(result.actionPayload,).toEqual(
      expect.objectContaining({ fallback: true, },),
    );
  });

  it("falls back when complete throws", async () => {
    const complete = async (): Promise<{ content: string }> => {
      throw new Error("rate limit",);
    };
    const result = await runTranslate(
      ["Hello", "to", "fr",],
      { chatId: "c1", },
      { complete, },
    );
    expect(result.systemMessage,).toContain("LLM unavailable — applied local heuristics only",);
  });

  it("does not contain the literal placeholder string", () => {
    // Source-level guard: the old `[Translation to ${langName}: ${text}]` string
    // must be GONE from translate.ts.
    const src = readFileSync(join(__dirname, "translate.ts",), "utf8",);
    expect(src,).not.toContain("[Translation to",);
  });
});
