// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * E2E: local llama-swap proxy confirmation.
 *
 * Tier 1 (no proxy): resolver defaults + unreachable-probe skip shape.
 * Live presence (fast, always attempted): /health, /running shape, and the
 * /v1/models roster carrying the ids the operator's config defines. Skips
 * cleanly when the proxy is down.
 * Live completion (expensive — first request loads the model): gated on
 * E2E_LOCAL_LIVE=1, one short completion through the app's own
 * OpenAiCompatibleProvider pointed at the proxy. Defaults to the smallest
 * model (llama-d3-2b, the decision-tuned 2B) so the load is cheap.
 */

import { describe, expect, test, } from "bun:test";
import { OpenAiCompatibleProvider, } from "../../../src/generation/providers/openai-compatible";
import { resolveLlamaSwapBase, } from "../../../src/llm/llama-swap-unload";

const BASE = process.env.LLAMA_SWAP_BASE_URL ?? "http://127.0.0.1:7180";
const CHAT_MODEL = process.env.E2E_LOCAL_CHAT_MODEL ?? "llama-qwen3.5-llmfan-9b";
/** Set to 1 to pay for a real model load + completion. Presence is free. */
const LIVE = process.env.E2E_LOCAL_LIVE === "1";

async function probe(path: string, timeoutMs = 3_000,): Promise<Response | null> {
  try {
    const res = await fetch(`${BASE}${path}`, { signal: AbortSignal.timeout(timeoutMs,), },);
    return res;
  } catch {
    return null;
  }
}

describe("local llama-swap proxy", () => {
  test("resolver defaults to loopback proxy base", () => {
    delete process.env.LLAMA_SWAP_BASE_URL;
    expect(resolveLlamaSwapBase({ listenPort: 7180, },),).toBe("http://127.0.0.1:7180",);
    process.env.LLAMA_SWAP_BASE_URL = BASE;
  });

  test("presence: proxy answers /health, /running and lists known models", async () => {
    const health = await probe("/health",);
    if (!health) { return; }
    expect(health.ok,).toBe(true,);

    const running = await probe("/running",);
    expect(running?.ok,).toBe(true,);
    const runningJson = running ? await running.json() : null;
    const runningBody = runningJson as { running?: unknown } | null;
    expect(Array.isArray(runningBody?.running,),).toBe(true,);

    const models = await probe("/v1/models",);
    expect(models?.ok,).toBe(true,);
    const modelsJson = models ? await models.json() : null;
    const roster = modelsJson as { data?: Array<{ id?: string }> } | null;
    const ids = (roster?.data ?? []).map((m,) => m.id);
    expect(ids,).toContain("llama-d3-2b",);
    expect(ids,).toContain("comfyui_auto",);
  });

  test("live: one completion through the app provider", async () => {
    if (!LIVE) { return; }
    const health = await probe("/health",);
    if (!health?.ok) { return; }

    const provider = new OpenAiCompatibleProvider({
      name: "e2e-local",
      label: "e2e local",
      baseUrl: `${BASE}/v1`,
      model: CHAT_MODEL,
      timeout: 300_000,
      retries: 0,
      allowUserApiKey: false,
    },);

    const res = await provider.complete({
      model: CHAT_MODEL,
      messages: [{ role: "user", content: "Reply with exactly: local-ok", },],
      params: { temperature: 0, maxTokens: 256, },
    },);

    const text = res.content + (res.thinking ?? "");
    expect(text.trim().length,).toBeGreaterThan(0,);
  }, 300_000,);
});
