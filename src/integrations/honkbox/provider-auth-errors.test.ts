// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** 401/403 dispatch mapping: named errors, never the credential. */

import { describe, expect, test, } from "bun:test";
import {
  cancelHonkboxJob,
  getHonkboxJobs,
  HonkboxArtifactDeliveryUnavailableError,
  HonkboxAuthError,
  honkboxCustomProviderConfig,
  type HonkboxProbeResult,
  HonkboxScopeError,
  openHonkboxEventStream,
  parseHonkboxCapabilities,
  runHonkboxChatTurn,
  runHonkboxImageJob,
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

  test("jobs 500 stays a generic dispatch failure, not an auth error", async () => {
    const prior = globalThis.fetch;
    globalThis.fetch =
      (async () =>
        new Response("boom", { status: 500, headers: { "Content-Type": "text/plain", }, },)) as unknown as typeof fetch;

    try {
      const failure = await getHonkboxJobs({ config: config(), probe: liveProbe(), },).then(
        () => {
          throw new Error("expected rejection",);
        },
        (error: unknown,) => error,
      );

      expect(failure,).not.toBeInstanceOf(HonkboxAuthError,);
      expect(failure,).not.toBeInstanceOf(HonkboxScopeError,);
      expect((failure as Error).message,).toContain("jobs request failed",);
    } finally {
      globalThis.fetch = prior;
    }
  });

  test("cancel 403 surfaces HonkboxScopeError without the key", async () => {
    const prior = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({ error: { message: "Missing required scope: jobs", code: "scope_denied", }, },),
        { status: 403, headers: { "Content-Type": "application/json", }, },
      )) as unknown as typeof fetch;

    try {
      const failure = await cancelHonkboxJob({ config: config(), probe: liveProbe(), }, "job 1",).then(
        () => {
          throw new Error("expected rejection",);
        },
        (error: unknown,) => error,
      );

      expect(failure,).toBeInstanceOf(HonkboxScopeError,);
      expect((failure as Error).message,).toContain("jobs",);
      expect((failure as Error).message,).not.toContain(SECRET,);
    } finally {
      globalThis.fetch = prior;
    }
  });

  test("events 401 surfaces HonkboxAuthError without the key", async () => {
    const prior = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({ error: { message: "invalid_api_key", code: "invalid_api_key", }, },),
        { status: 401, headers: { "Content-Type": "application/json", }, },
      )) as unknown as typeof fetch;

    try {
      const failure = await openHonkboxEventStream({ config: config(), probe: liveProbe(), },).then(
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

  test("image job 403 is a failed outcome, never the key", async () => {
    const prior = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({ error: { message: "Missing required scope: jobs", code: "scope_denied", }, },),
        { status: 403, headers: { "Content-Type": "application/json", }, },
      )) as unknown as typeof fetch;

    try {
      // The image engine never throws on provider failures: auth denials come
      // back as failed outcomes, so the only assertion is no credential leak.
      const outcome = await runHonkboxImageJob(
        { config: config(), probe: liveProbe(), },
        { prompt: "a cat", n: 1, outputFormat: "png", },
      );

      expect(outcome.ok,).toBe(false,);
      if (!outcome.ok) {
        expect(outcome.error,).not.toContain(SECRET,);
      }
    } finally {
      globalThis.fetch = prior;
    }
  });
});

describe("honkbox artifact delivery", () => {
  function artifactProbe(storagePresent: boolean,): HonkboxProbeResult {
    const probe = liveProbe();
    if (!probe.ok) { throw new Error("unreachable",); }
    return {
      ...probe,
      capabilities: {
        ...probe.capabilities,
        features: { ...probe.capabilities.features, artifactDelivery: true, },
        storage: { dataDirPresent: storagePresent, },
      },
    };
  }

  test("artifact delivery without server storage fails closed", async () => {
    const prior = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response("{}", { status: 200, },);
    }) as unknown as typeof fetch;

    try {
      const failure = await runHonkboxImageJob(
        { config: config(), probe: artifactProbe(false,), },
        { prompt: "a cat", n: 1, outputFormat: "png", },
        { artifactDelivery: true, },
      ).then(
        () => {
          throw new Error("expected rejection",);
        },
        (error: unknown,) => error,
      );

      expect(failure,).toBeInstanceOf(HonkboxArtifactDeliveryUnavailableError,);
      expect(calls,).toBe(0,);
    } finally {
      globalThis.fetch = prior;
    }
  });

  test("artifact delivery returns descriptors and drops malformed entries", async () => {
    const prior = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          artifacts: [
            { artifact_id: "a1", content_type: "image/png", size_bytes: 10, job_id: "j1", },
            { bogus: true, },
            { artifact_id: "", },
          ],
          bundle: "b1",
          job_id: "j1",
        },),
        { status: 200, headers: { "Content-Type": "application/json", }, },
      )) as unknown as typeof fetch;

    try {
      const outcome = await runHonkboxImageJob(
        { config: config(), probe: artifactProbe(true,), },
        { prompt: "a cat", n: 1, outputFormat: "png", },
        { artifactDelivery: true, },
      );

      expect(outcome.ok,).toBe(true,);
      if (outcome.ok && "artifacts" in outcome) {
        expect(outcome.artifacts,).toHaveLength(1,);
        expect(outcome.artifacts[0]?.artifact_id,).toBe("a1",);
      } else {
        throw new Error("expected artifact-delivery outcome",);
      }
    } finally {
      globalThis.fetch = prior;
    }
  });

  test("artifact delivery 403 surfaces HonkboxScopeError without the key", async () => {
    const prior = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({ error: { message: "Missing required scope: jobs", code: "scope_denied", }, },),
        { status: 403, headers: { "Content-Type": "application/json", }, },
      )) as unknown as typeof fetch;

    try {
      const failure = await runHonkboxImageJob(
        { config: config(), probe: artifactProbe(true,), },
        { prompt: "a cat", n: 1, outputFormat: "png", },
        { artifactDelivery: true, },
      ).then(
        () => {
          throw new Error("expected rejection",);
        },
        (error: unknown,) => error,
      );

      expect(failure,).toBeInstanceOf(HonkboxScopeError,);
      expect((failure as Error).message,).not.toContain(SECRET,);
    } finally {
      globalThis.fetch = prior;
    }
  });
});
