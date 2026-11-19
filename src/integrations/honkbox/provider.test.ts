// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Tests for integrations/honkbox/provider.ts — Custom-provider wiring. */

import { beforeEach, describe, expect, test, } from "bun:test";
import {
  cancelHonkboxJob,
  getHonkboxJobs,
  HonkboxAdmissionError,
  HonkboxCapabilityUnavailableError,
  honkboxChatBaseUrl,
  honkboxCustomProviderConfig,
  honkboxImageBaseUrl,
  type HonkboxProbeResult,
  openHonkboxEventStream,
  parseHonkboxCapabilities,
  runHonkboxChatTurn,
  runHonkboxImageJob,
} from "./index";

const originalFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = originalFetch;
},);

/** Swap globalThis.fetch for the duration of `fn`; records every URL. */
async function withMockFetch(
  handler: (url: string, init?: RequestInit,) => Response | Promise<Response>,
  fn: (urls: string[],) => Promise<void>,
): Promise<void> {
  const urls: string[] = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit,) => {
    const href = String(url,);
    urls.push(href,);
    return handler(href, init,);
  }) as typeof fetch;

  try {
    await fn(urls,);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

/** A live, v1 contract with honkbox-owned GPU admission. `featureOverrides`
 * patches individual feature flags for the "unavailable capability" cases. */
function liveProbe(
  featureOverrides: Record<string, unknown> = {},
): HonkboxProbeResult {
  const doc = {
    api_version: "v1",
    server: { name: "honkbox", version: "0.9.0", },
    features: {
      vision: { built: true, models: 1, },
      controlnet: { available: false, models: 0, },
      lora: false,
      video: false,
      jobs: true,
      events: true,
      vad: false,
      experimental_ash_sd: false,
      ...featureOverrides,
    },
    formats: { read: ["png",], write: [], limits: {}, },
    auth: { mode: "bearer", },
    queue: { gpu_slots: 1, queue_wait_secs: 30, retry_after_secs: 1, kinds: [], },
    openapi: "/v1/openapi.json",
    models: "/v1/models",
  };

  const parsed = parseHonkboxCapabilities(doc,);
  if (!parsed.ok) { throw new Error(parsed.error,); }
  return { ok: true, capabilities: parsed.capabilities, supported: true, latencyMs: 0, };
}

/** From an origin URL or an already `/v1`-inclusive URL. */
function config(baseUrl = "http://127.0.0.1:9010/v1",) {
  return honkboxCustomProviderConfig({ baseUrl, model: "llama", apiKey: "k", },);
}

describe("base URL normalization", () => {
  test("chat keeps /v1 once; image engine gets the origin", () => {
    expect(honkboxChatBaseUrl("http://127.0.0.1:9010///",),).toBe("http://127.0.0.1:9010/v1",);
    expect(honkboxChatBaseUrl("http://127.0.0.1:9010/v1",),).toBe("http://127.0.0.1:9010/v1",);
    expect(honkboxImageBaseUrl("http://127.0.0.1:9010/v1",),).toBe("http://127.0.0.1:9010",);
    expect(config().baseUrl,).toBe("http://127.0.0.1:9010/v1",);
  });
});

describe("runHonkboxChatTurn", () => {
  test("one chat turn through /v1/chat/completions with honkbox owning admission", async () => {
    await withMockFetch(
      () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: "hello back", }, finish_reason: "stop", },],
            usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5, },
          },),
          { status: 200, },
        ),
      async (urls,) => {
        const result = await runHonkboxChatTurn(
          { config: config(), probe: liveProbe(), },
          { model: "llama", messages: [{ role: "user", content: "hi", },], params: {}, },
        );

        expect(urls,).toEqual(["http://127.0.0.1:9010/v1/chat/completions",],);
        expect(result.content,).toBe("hello back",);
        expect(result.usage?.totalTokens,).toBe(5,);
      },
    );
  });

  test("admission denial: a loop-lore slot is rejected before any dispatch", async () => {
    await withMockFetch(
      () => new Response("{}", { status: 200, },),
      async (urls,) => {
        expect(runHonkboxChatTurn(
          {
            config: config(),
            probe: liveProbe(),
            localAdmission: true,
          },
          { model: "llama", messages: [{ role: "user", content: "hi", },], params: {}, },
        ),).rejects.toThrow(HonkboxAdmissionError,);

        expect(urls,).toEqual([],);
      },
    );
  });

  test("unavailable capability fails closed", async () => {
    await withMockFetch(
      () => new Response("{}", { status: 200, },),
      async (urls,) => {
        expect(runHonkboxChatTurn(
          { config: config(), probe: { ok: false, reason: "unreachable", detail: "down", }, },
          { model: "llama", messages: [{ role: "user", content: "hi", },], params: {}, },
        ),).rejects.toThrow(HonkboxCapabilityUnavailableError,);

        expect(urls,).toEqual([],);
      },
    );
  });
});

describe("image job and observability", () => {
  test("one image job through /v1/images/generations", async () => {
    await withMockFetch(
      () => new Response(JSON.stringify({ data: [{ b64_json: "YWJj", },], },), { status: 200, },),
      async (urls,) => {
        const outcome = await runHonkboxImageJob(
          { config: config(), probe: liveProbe(), },
          { prompt: "a cat", n: 1, outputFormat: "png", },
        );

        expect(urls,).toEqual(["http://127.0.0.1:9010/v1/images/generations",],);
        expect(outcome.ok,).toBe(true,);
        if (outcome.ok) {
          expect(outcome.images,).toHaveLength(1,);
          expect(outcome.mimeType,).toBe("image/png",);
        }
      },
    );
  });

  test("image job requires the jobs capability", async () => {
    await withMockFetch(
      () => new Response("{}", { status: 200, },),
      async (urls,) => {
        expect(runHonkboxImageJob(
          { config: config(), probe: liveProbe({ jobs: false, },), },
          { prompt: "a cat", n: 1, outputFormat: "png", },
        ),).rejects.toThrow('capability "jobs" is not available',);

        expect(urls,).toEqual([],);
      },
    );
  });

  test("jobs listing, mid-run cancel and events stream hit the landed routes", async () => {
    await withMockFetch(
      () => new Response(JSON.stringify({ jobs: [], },), { status: 200, },),
      async (urls,) => {
        const opts = { config: config(), probe: liveProbe(), };
        expect(await getHonkboxJobs(opts,),).toEqual({ jobs: [], },);
        expect(await cancelHonkboxJob(opts, "job 1",),).toBe(true,);
        const stream = await openHonkboxEventStream(opts,);
        expect(stream.status,).toBe(200,);
        expect(urls,).toEqual([
          "http://127.0.0.1:9010/v1/jobs",
          "http://127.0.0.1:9010/v1/jobs/job%201/cancel",
          "http://127.0.0.1:9010/v1/events",
        ],);
      },
    );
  });

  test("admission denial also guards the image path", async () => {
    await withMockFetch(
      () => new Response("{}", { status: 200, },),
      async (urls,) => {
        expect(runHonkboxImageJob(
          { config: config(), probe: liveProbe(), localAdmission: true, },
          { prompt: "a cat", n: 1, outputFormat: "png", },
        ),).rejects.toThrow(HonkboxAdmissionError,);

        expect(urls,).toEqual([],);
      },
    );
  });
});
