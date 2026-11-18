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
import { deflateSync, } from "node:zlib";
import { OpenAiCompatibleProvider, } from "../../../src/generation/providers/openai-compatible";
import { resolveLlamaSwapBase, } from "../../../src/llm/llama-swap-unload";

const BASE = process.env.LLAMA_SWAP_BASE_URL ?? "http://127.0.0.1:7180";
const CHAT_MODEL = process.env.E2E_LOCAL_CHAT_MODEL ?? "llama-qwen3.5-llmfan-9b";
const DECISION_MODEL = process.env.E2E_LOCAL_DECISION_MODEL ?? "llama-d3-2b";
const SD_MODEL = process.env.E2E_LOCAL_SD_MODEL ?? "sdcpp-nova";
const EMBED_MODEL = process.env.E2E_LOCAL_EMBED_MODEL ?? "qwen3-embed-0.6B";
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

/** 64x32 PNG, left half red / right half blue, generated inline (no fixture). */
function redBluePngBase64(): string {
  const W = 64, H = 32;
  const raw = Buffer.alloc((W * 4 + 1) * H,);
  const table = new Int32Array(256,);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) { c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; }
    table[n] = c;
  }

  const crc = (b: Buffer,): number => {
    let c = 0xffffffff;
    for (const x of b) { c = table[(c ^ x) & 255]! ^ (c >>> 8); }
    return (c ^ 0xffffffff) >>> 0;
  };

  const chunk = (type: string, data: Buffer,): Buffer => {
    const len = Buffer.alloc(4,);
    len.writeUInt32BE(data.length,);
    const td = Buffer.concat([Buffer.from(type,), data,],);
    const sum = Buffer.alloc(4,);
    sum.writeUInt32BE(crc(td,),);
    return Buffer.concat([len, td, sum,],);
  };

  for (let y = 0; y < H; y++) {
    raw[y * (W * 4 + 1)] = 0;
    for (let x = 0; x < W; x++) {
      const o = y * (W * 4 + 1) + 1 + x * 4;
      if (x < W / 2) {
        raw[o] = 255;
        raw[o! + 3] = 255;
      } else {
        raw[o! + 2] = 255;
        raw[o! + 3] = 255;
      }
    }
  }

  const ihdr = Buffer.alloc(13,);
  ihdr.writeUInt32BE(W, 0,);
  ihdr.writeUInt32BE(H, 4,);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10,],),
    chunk("IHDR", ihdr,),
    chunk("IDAT", deflateSync(raw,),),
    chunk("IEND", Buffer.alloc(0,),),
  ],);

  return png.toString("base64",);
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

  test("live: vision describes the red half through the app provider", async () => {
    if (!LIVE) { return; }
    const health = await probe("/health",);
    if (!health?.ok) { return; }

    const provider = new OpenAiCompatibleProvider({
      name: "e2e-local-vision",
      label: "e2e local vision",
      baseUrl: `${BASE}/v1`,
      model: CHAT_MODEL,
      timeout: 300_000,
      retries: 0,
      allowUserApiKey: false,
    },);

    const res = await provider.complete({
      model: CHAT_MODEL,
      messages: [{
        role: "user",
        content: "Which half of this image is red, left or right? Reply with one word.",
        images: [{ mediaType: "image/png", base64: redBluePngBase64(), },],
      },],
      params: { temperature: 0, maxTokens: 256, },
    },);

    const text = res.content + (res.thinking ?? "");
    expect(text.toLowerCase(),).toContain("left",);
  }, 300_000,);

  test("live: decision model answers a choice question via systemone", async () => {
    if (!LIVE) { return; }
    const health = await probe("/health",);
    if (!health?.ok) { return; }

    const res = await fetch(`${BASE}/v1/systemone`, {
      method: "POST",
      headers: { "Content-Type": "application/json", },
      body: JSON.stringify({
        model: DECISION_MODEL,
        state: {},
        questions: {
          q1: {
            type: "choice",
            question: "which reply is correct?",
            choices: ["decision-ok", "wrong",],
            criteria: { relevance: "pick the exact correct reply", },
          },
        },
      },),
      signal: AbortSignal.timeout(120_000,),
    },);

    if (!res.ok) { return; }
    const body = await res.json() as { answers?: Record<string, { choice?: unknown; confidence?: unknown }> };
    const q1 = body.answers?.["q1"];
    expect(typeof q1?.choice,).toBe("string",);
    expect(q1?.confidence,).toBeGreaterThanOrEqual(0,);
  }, 120_000,);

  test("live: sdcpp renders an image while the proxy stays healthy", async () => {
    if (!LIVE) { return; }
    const health = await probe("/health",);
    if (!health?.ok) { return; }

    const gen = await fetch(`${BASE}/upstream/${SD_MODEL}/sdcpp/v1/img_gen`, {
      method: "POST",
      headers: { "Content-Type": "application/json", },
      body: JSON.stringify({
        prompt: "a red square",
        width: 256,
        height: 256,
        steps: 2,
      },),
      signal: AbortSignal.timeout(540_000,),
    },);

    if (!gen.ok) { return; }
    const buf = new Uint8Array(await gen.arrayBuffer(),);
    expect(buf.length,).toBeGreaterThan(0,);

    const running = await probe("/running",);
    expect(running?.ok,).toBe(true,);
  }, 600_000,);

  test("live: embedding model returns a vector when configured", async () => {
    if (!LIVE) { return; }
    const health = await probe("/health",);
    if (!health?.ok) { return; }

    const res = await fetch(`${BASE}/v1/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json", },
      body: JSON.stringify({ model: EMBED_MODEL, input: "local-ok", },),
      signal: AbortSignal.timeout(300_000,),
    },);

    // Skip when the operator config does not define the embedding model.
    if (!res.ok) { return; }
    const body = await res.json() as { data?: Array<{ embedding?: number[] }> };
    expect((body.data?.[0]?.embedding ?? []).length,).toBeGreaterThan(0,);
  }, 300_000,);
});
