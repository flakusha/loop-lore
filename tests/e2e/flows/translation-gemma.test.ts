// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * E2E: free chat-model translation over the /translate path.
 *
 * Tier 1 (always runs, no key, no network): the command's local
 * parser/fallback behavior only — usage text, unparseable input, and the
 * heuristic fallback payload (fallback: true) via `runTranslate` with no
 * `complete` dep.
 *
 * Tier 2 (creds-gated): with BYOK_E2E_API_KEY set, drives `runTranslate`
 * with a live OpenRouter-backed `complete` adapter — the same request shape
 * /translate builds (system prompt + user text, translator model) — on two
 * short strings (en->es, es->en), asserting a non-empty result that differs
 * from the input and contains an expected anchor word.
 * Skip tier 2: leave BYOK_E2E_API_KEY blank or set BYOK_E2E_SKIP=1.
 * Model IDs come from env only (E2E_TRANSLATE_MODEL, default
 * google/gemma-4-26b-a4b-it:free — verified present and $0/$0 in the live
 * OpenRouter catalog 2026-11-18).
 */

import type { CommandContext, } from "@/assistant/commands/registry";
import { runTranslate, } from "@/assistant/commands/translate";
import { describe, expect, test, } from "bun:test";

const LIVE_BASE_URL = process.env.BYOK_E2E_BASE_URL ?? "https://openrouter.ai/api/v1";
const LIVE_KEY = process.env.BYOK_E2E_API_KEY ?? "";
const LIVE_MODEL = process.env.E2E_TRANSLATE_MODEL ?? "google/gemma-4-26b-a4b-it:free";

const LIVE = LIVE_KEY !== "" && process.env.BYOK_E2E_SKIP !== "1";
const describeLive = LIVE ? describe : describe.skip;

function ctxWith(positionalArgs: string[],): CommandContext {
  return { chatId: "e2e-translate", positionalArgs, };
}

describe("translate command local parser + fallback (no key)", () => {
  test("no args returns usage, handled", async () => {
    const result = await runTranslate([], ctxWith([],), {},);
    expect(result.handled,).toBe(true,);
    expect(result.systemMessage ?? "",).toContain("/translate",);
  });

  test("unparseable input explains usage, handled", async () => {
    const result = await runTranslate(["blarg",], ctxWith(["blarg",],), {},);
    expect(result.handled,).toBe(true,);
    expect(result.systemMessage ?? "",).toContain("Could not parse",);
  });

  test("no complete dep falls back to identity with fallback flag", async () => {
    const result = await runTranslate(
      ["Hello", "to", "es",],
      ctxWith(["Hello", "to", "es",],),
      {},
    );

    expect(result.handled,).toBe(true,);
    const payload = result.actionPayload as
      | { translated?: string; fallback?: boolean }
      | undefined;

    expect(payload?.translated,).toBe("Hello",);
    expect(payload?.fallback,).toBe(true,);
    expect(result.systemMessage ?? "",).toContain("local heuristics",);
  });

  test("stub complete short-circuits the fallback", async () => {
    const result = await runTranslate(
      ["Hello", "to", "es",],
      ctxWith(["Hello", "to", "es",],),
      { complete: async () => ({ content: "Hola", }), model: "stub", },
    );

    const payload = result.actionPayload as
      | { translated?: string; fallback?: boolean }
      | undefined;

    expect(payload?.translated,).toBe("Hola",);
    expect(payload?.fallback,).toBeUndefined();
  });
});

describeLive("live translation over the free chat model", () => {
  /**
   * OpenRouter-backed adapter matching the TranslateDeps `complete` shape.
   * Free shared-pool models 429 transiently upstream — retry briefly.
   */
  async function liveComplete(req: {
    model: string;
    messages: { role: string; content: string }[];
    params?: { maxTokens?: number; temperature?: number };
  },): Promise<{ content: string }> {
    let res: Response | undefined;
    for (let attempt = 0; attempt < 3; attempt++) {
      res = await fetch(`${LIVE_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LIVE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: req.model,
          messages: req.messages,
          max_tokens: req.params?.maxTokens ?? 512,
          temperature: req.params?.temperature ?? 0.7,
          stream: false,
        },),
      },);

      if (res.status !== 429 || attempt === 2) { break; }
      await new Promise((resolve,) => setTimeout(resolve, 15000,));
    }

    expect(res?.status,).toBe(200,);
    const data = (await res?.json()) as {
      choices?: { message?: { content?: string | null } }[];
    };

    const content = data.choices?.[0]?.message?.content ?? "";
    return { content, };
  }

  const cases = [
    { words: ["Good", "morning", "to", "es",], anchor: "buenos", },
    { words: ["Buenas", "noches", "to", "en",], anchor: "good", },
  ] as const;

  for (const { words, anchor, } of cases) {
    test(`translates "${words.slice(0, -2,).join(" ",)}" (anchor "${anchor}")`, async () => {
      const input = words.slice(0, -2,).join(" ",);
      const result = await runTranslate([...words,], ctxWith([...words,],), {
        complete: liveComplete,
        model: LIVE_MODEL,
      },);

      expect(result.handled,).toBe(true,);
      const payload = result.actionPayload as
        | { translated?: string; fallback?: boolean }
        | undefined;

      expect(payload?.fallback,).toBeUndefined();
      const translated = (payload?.translated ?? "").trim();
      expect(translated.length,).toBeGreaterThan(0,);
      expect(translated.toLowerCase(),).not.toBe(input.toLowerCase(),);
      expect(translated.toLowerCase(),).toContain(anchor,);
    }, 60000,);
  }
},);
