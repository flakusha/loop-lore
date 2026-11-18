// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * E2E: text-to-speech over the OpenRouter /audio/speech endpoint.
 *
 * Tier 1 (always runs, no key, no network): the provider without a key
 * fails closed with a 500 instead of calling the network.
 *
 * Tier 2 (creds-gated): with BYOK_E2E_API_KEY set, synthesizes one short
 * sentence with the free Fish Audio model and asserts a non-empty byte
 * buffer with an audio mime type.
 * Skip tier 2: leave BYOK_E2E_API_KEY blank or set BYOK_E2E_SKIP=1.
 * Model IDs come from env only (E2E_TTS_MODEL, default
 * fish-audio/s2.1-pro-free:free — verified present and $0/$0 in the live
 * OpenRouter catalog 2026-11-18).
 */
import { createOpenRouterTtsProvider, } from "@/generation/audio/providers/openrouter-tts";
import { describe, expect, test, } from "bun:test";

const LIVE_KEY = process.env.BYOK_E2E_API_KEY ?? "";
const LIVE_MODEL = process.env.E2E_TTS_MODEL ?? "fish-audio/s2.1-pro-free:free";
const LIVE = LIVE_KEY !== "" && process.env.BYOK_E2E_SKIP !== "1";
const describeLive = LIVE ? describe : describe.skip;

describe("OpenRouter TTS provider without a key (no network)", () => {
  test("fails closed with a 500", async () => {
    const provider = createOpenRouterTtsProvider({ apiKey: "", },);
    const outcome = await provider.generate({ prompt: "Hello.", seconds: 1, },);

    expect(outcome.ok,).toBe(false,);
    if (outcome.ok) { return; }
    expect(outcome.status,).toBe(500,);
    expect(outcome.error,).toMatch(/API key/,);
  });
});

describeLive("live TTS over the free Fish Audio model", () => {
  test("synthesizes one sentence into non-empty audio bytes", async () => {
    const provider = createOpenRouterTtsProvider({
      apiKey: LIVE_KEY,
      model: LIVE_MODEL,
    },);

    const outcome = await provider.generate({
      prompt: "The lantern glows softly over the quiet harbour.",
      seconds: 1,
    },);

    expect(outcome.ok,).toBe(true,);
    if (!outcome.ok) { return; }
    expect(outcome.buffer.length,).toBeGreaterThan(0,);
    expect(outcome.mimeType,).toMatch(/^audio\//,);
  }, 60000,);
},);
