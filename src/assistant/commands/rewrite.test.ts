// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { beforeAll, describe, expect, it, } from "bun:test";
import type { GenerateRequest, } from "../../generation/providers/types";
import { createLogger, } from "../../logger";
import { getCommand, } from "./registry";
import { rewriteText, runRewrite, } from "./rewrite";

beforeAll(() => {
  createLogger({ level: "error", },);
},);

describe("rewrite command", () => {
  it("is registered", () => {
    expect(getCommand("rewrite",),).toBeDefined();
  });

  describe("rewriteText (local fallback)", () => {
    it("trims excess whitespace in clear style", () => {
      const out = rewriteText("  Hello   world  ", "clear",);
      expect(out,).toBe("Hello world.",);
    });

    it("removes filler words in concise style", () => {
      const out = rewriteText("I just really want to go.", "concise",);
      expect(out,).toBe("I want to go.",);
    });

    it("capitalizes emotional words in dramatic style", () => {
      const out = rewriteText("It was suddenly dark.", "dramatic",);
      expect(out,).toContain("SUDDENLY",);
    });

    it("expands contractions in formal style", () => {
      const out = rewriteText("I can't do it.", "formal",);
      expect(out,).toBe("I cannot do it.",);
    });

    it("appends sentence-ending punctuation when missing", () => {
      const out = rewriteText("Hello world", "clear",);
      expect(out,).toBe("Hello world.",);
    });
  });

  describe("runRewrite (LLM injection)", () => {
    it("returns the LLM output verbatim when complete is provided", async () => {
      let captured: GenerateRequest | undefined;
      const complete = async (req: GenerateRequest,): Promise<{ content: string }> => {
        captured = req;
        return { content: "A polished version.", };
      };

      const result = await runRewrite(
        ["some rough text",],
        { chatId: "c1", },
        { complete, },
      );

      expect(captured?.messages[0]?.content,).toBe(
        "Rewrite the following text in clear style. Preserve meaning.",
      );
      expect(captured?.messages[1]?.content,).toBe("some rough text",);
      expect(result.systemMessage,).toContain("A polished version.",);
      expect(result.systemMessage,).not.toContain("LLM unavailable",);
    });

    it("routes each --style value to a distinct system prompt", async () => {
      const captured: { style: string; systemPrompt: string }[] = [];
      const complete = async (req: GenerateRequest,): Promise<{ content: string }> => {
        const sysMsg = req.messages[0]?.content ?? "";
        const m = sysMsg.match(/in (\w+) style\./,);
        captured.push({ style: m?.[1] ?? "?", systemPrompt: sysMsg, },);
        return { content: "ok", };
      };

      for (const style of ["clear", "concise", "dramatic", "formal",]) {
        await runRewrite(
          ["--style", style, "text",],
          { chatId: "c1", },
          { complete, },
        );
      }

      expect(captured.map((c,) => c.style),).toEqual(["clear", "concise", "dramatic", "formal",],);
      // Each prompt is distinct
      const prompts = new Set(captured.map((c,) => c.systemPrompt),);
      expect(prompts.size,).toBe(4,);
    });

    it("falls back to local heuristics when complete is undefined and appends the system note", async () => {
      const result = await runRewrite(
        ["  I just   want  ", "--style", "concise",],
        { chatId: "c1", },
        {},
      );
      expect(result.systemMessage,).toContain("LLM unavailable — applied local heuristics only",);
      expect(result.systemMessage,).toContain("I want",);
      expect(result.actionPayload,).toEqual(
        expect.objectContaining({ style: "concise", fallback: true, },),
      );
    });

    it("falls back to local heuristics when complete throws", async () => {
      const complete = async (): Promise<{ content: string }> => {
        throw new Error("provider down",);
      };
      const result = await runRewrite(
        ["text",],
        { chatId: "c1", },
        { complete, },
      );
      expect(result.systemMessage,).toContain("LLM unavailable — applied local heuristics only",);
    });

    it("uses the last assistant message when no positional text is supplied", async () => {
      const complete = async (req: GenerateRequest,): Promise<{ content: string }> => {
        expect(req.messages[1]?.content,).toBe("previous reply",);
        return { content: "rewritten reply", };
      };
      const result = await runRewrite(
        [],
        {
          chatId: "c1",
          messages: [
            { id: "1", role: "user", content: "hi", created_at: "t", },
            { id: "2", role: "assistant", content: "previous reply", created_at: "t", },
          ],
        },
        { complete, },
      );
      expect(result.systemMessage,).toContain("rewritten reply",);
    });

    it("returns the no-text message when no input and no history", async () => {
      const result = await runRewrite([], { chatId: "c1", }, { complete: async () => ({ content: "x", }), },);
      expect(result.systemMessage,).toContain("No text to rewrite",);
    });
  });

  describe("runRewrite --apply", () => {
    const history = {
      chatId: "c1",
      messages: [
        { id: "1", role: "user", content: "hi", created_at: "t", },
        { id: "2", role: "assistant", content: "previous reply", created_at: "t", },
      ],
    };
    const complete = async (): Promise<{ content: string }> => ({ content: "rewritten reply", });

    it("writes back through the apply dep", async () => {
      let applied: { messageId: string; content: string } | undefined;
      const result = await runRewrite(["--apply",], history, {
        complete,
        apply: async (messageId, content,) => {
          applied = { messageId, content, };
          return { ok: true, };
        },
      },);
      expect(applied,).toEqual({ messageId: "2", content: "rewritten reply", },);
      expect(result.systemMessage,).toContain("and applied",);
      expect(result.actionPayload,).toEqual(
        expect.objectContaining({ applied: true, messageId: "2", },),
      );
    });

    it("refuses explicit text with --apply (no target)", async () => {
      const result = await runRewrite(["some text", "--apply",], { chatId: "c1", }, { complete, },);
      expect(result.systemMessage,).toContain("Nothing to apply to",);
    });

    it("maps forbidden to the authorship message", async () => {
      const result = await runRewrite(["--apply",], history, {
        complete,
        apply: async () => ({ ok: false, error: "forbidden", }),
      },);
      expect(result.systemMessage,).toContain("not the author",);
    });

    it("maps cross_chat to the scope message", async () => {
      const result = await runRewrite(["--apply",], history, {
        complete,
        apply: async () => ({ ok: false, error: "cross_chat", }),
      },);
      expect(result.systemMessage,).toContain("another chat",);
    });

    it("maps not_found to the missing message", async () => {
      const result = await runRewrite(["--apply",], history, {
        complete,
        apply: async () => ({ ok: false, error: "not_found", }),
      },);
      expect(result.systemMessage,).toContain("no longer exists",);
    });

    it("requires a backend-backed apply dep", async () => {
      const result = await runRewrite(["--apply",], history, { complete, },);
      expect(result.systemMessage,).toContain("needs a backend",);
    });
  });
});
