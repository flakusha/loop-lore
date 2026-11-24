// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** 401/403 dispatch mapping: named errors, never the credential. */

import { describe, expect, test, } from "bun:test";
import {
  getHonkboxJobs,
  HonkboxAuthError,
  honkboxCustomProviderConfig,
  type HonkboxProbeResult,
  HonkboxScopeError,
  parseHonkboxCapabilities,
  runHonkboxChatTurn,
} from "./index";

const SECRET = "test-key-abc123";

function liveProbe(): HonkboxProbeResult {
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

function config() {
  return honkboxCustomProviderConfig({ baseUrl: "http://127.0.0.1:9010/v1", model: "llama", apiKey: SECRET, },);
}

function request() {
  return { model: "llama", messages: [{ role: "user" as const, content: "hi", },], params: {}, };
}

describe("honkbox 401/403 mapping", () => {
  test("chat 401 surfaces HonkboxAuthError without the key", async () => {
    const prior = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({ error: { message: "invalid_api_key", code: "invalid_api_key", }, },),
        { status: 401, },
      )) as unknown as typeof fetch;

    try {
      const failure = await runHonkboxChatTurn(
        { config: config(), probe: liveProbe(), },
        request(),
      ).then(
        () => {
          throw new Error("expected rejection",);
        },
        (error: unknown,) => error,
      );

      expect(failure,).toBeInstanceOf(HonkboxAuthError,);
      expect((failure as Error).message,).toContain("401",);
      expect((failure as Error).message,).not.toContain(SECRET,);
    } finally {
      globalThis.fetch = prior;
    }
  });

  test("chat 403 surfaces HonkboxScopeError with the server scope reason", async () => {
    const prior = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({ error: { message: "Missing required scope: admin", code: "scope_denied", }, },),
        { status: 403, },
      )) as unknown as typeof fetch;

    try {
      const failure = await runHonkboxChatTurn(
        { config: config(), probe: liveProbe(), },
        request(),
      ).then(
        () => {
          throw new Error("expected rejection",);
        },
        (error: unknown,) => error,
      );

      expect(failure,).toBeInstanceOf(HonkboxScopeError,);
      expect((failure as Error).message,).toContain("admin",);
      expect((failure as Error).message,).not.toContain(SECRET,);
    } finally {
      globalThis.fetch = prior;
    }
  });

  test("jobs 401 surfaces HonkboxAuthError without the key", async () => {
    const prior = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({ error: { message: "invalid_api_key", code: "invalid_api_key", }, },),
        { status: 401, headers: { "Content-Type": "application/json", }, },
      )) as unknown as typeof fetch;

    try {
      const failure = await getHonkboxJobs({ config: config(), probe: liveProbe(), },).then(
        () => {
          throw new Error("expected rejection",);
        },
        (error: unknown,) => error,
      );

      expect(failure,).toBeInstanceOf(HonkboxAuthError,);
      expect((failure as Error).message,).not.toContain(SECRET,);
    } finally {
      globalThis.fetch = prior;
    }
  });
});
