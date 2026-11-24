// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for integrations/honkbox/capabilities.ts.
 *
 * Every test swaps globalThis.fetch (the safeFetch transport) and restores it
 * afterwards. Covers: the landed Capabilities shape, the exact
 * `{baseUrl}/capabilities` probe URL, unavailable/degraded contracts, the
 * cached probe path and the single-owner GPU admission boundary.
 */
import { afterEach, describe, expect, test, } from "bun:test";
import {
  assertNoDoubleGpuAdmission,
  clearHonkboxCapabilitiesCache,
  DEFAULT_HONKBOX_PROBE_TIMEOUT_MS,
  getHonkboxCapabilities,
  HONKBOX_CAPABILITIES_PATH,
  HONKBOX_FEATURE_KEYS,
  HONKBOX_PROBE_CACHE_TTL_MS,
  HONKBOX_SUPPORTED_API_MAJOR,
  honkboxAdmissionDecision,
  HonkboxAdmissionError,
  honkboxCacheKey,
  honkboxCustomProviderConfig,
  isHonkboxExternalToolAvailable,
  isHonkboxFeatureEnabled,
  normalizeHonkboxBaseUrl,
  parseHonkboxCapabilities,
  peekHonkboxCapabilities,
  probeHonkboxCapabilities,
  refreshHonkboxCapabilities,
} from "./index";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  clearHonkboxCapabilitiesCache();
},);

/** Swap globalThis.fetch for the duration of `fn`. */
async function withMockFetch(
  handler: (url: string, init?: RequestInit,) => Response | Promise<Response>,
  fn: () => Promise<void>,
): Promise<void> {
  globalThis.fetch =
    (async (url: string | URL | Request, init?: RequestInit,) => handler(String(url,), init,)) as typeof fetch;

  try {
    await fn();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

/** Landed `GET /v1/capabilities` document (honkbox api-types shape). */
function capabilitiesDoc(overrides: Record<string, unknown> = {},): Record<string, unknown> {
  return {
    api_version: "v1",
    server: { name: "honkbox", version: "0.9.0", },
    features: {
      vision: { built: true, models: 2, },
      controlnet: { available: false, models: 0, },
      lora: true,
      video: false,
      decisions: false,
      audio_cpp: { built: false, stt_families: [], tts_families: [], },
      rerank: false,
      python_sidecar: false,
      texture_postprocess: false,
      fizgig: false,
      residency_control: false,
      jobs: true,
      events: true,
      vad: false,
      experimental_ash_sd: false,
    },
    formats: {
      read: ["png", "jpeg",],
      write: [{ format: "png", compression: false, }, { format: "jpeg", compression: true, },],
      limits: {
        output_compression: { min: 0, max: 100, applies_to: "jpeg", },
        body_bytes: 20_971_520,
      },
    },
    auth: { mode: "bearer", },
    queue: {
      gpu_slots: 1,
      queue_wait_secs: 30,
      retry_after_secs: 1,
      kinds: [{ kind: "sd", queue_cap: 4, ttl_secs: 30, },],
    },
    image_ops: { ops: ["resize",], },
    tools: {
      tool_choice_honored: ["auto",],
      tool_choice_clamped: ["none",],
      tool_choice_named_function_clamped: true,
      parallel_tool_calls: false,
    },
    recognition: { barcode: true, ocr: false, },
    openapi: "/v1/openapi.json",
    models: "/v1/models",
    ...overrides,
  };
}

/** JSON response with the landed document. */
function capsResponse(doc: Record<string, unknown> = capabilitiesDoc(),): Response {
  return new Response(JSON.stringify(doc,), { status: 200, },);
}

describe("parseHonkboxCapabilities", () => {
  test("mirrors the landed Capabilities shape", () => {
    const parsed = parseHonkboxCapabilities(capabilitiesDoc(),);

    expect(parsed.ok,).toBe(true,);
    if (!parsed.ok) { return; }
    const caps = parsed.capabilities;
    expect(caps.apiVersion,).toBe("v1",);
    expect(caps.server,).toEqual({ name: "honkbox", version: "0.9.0", },);
    expect(caps.features.vision,).toEqual({ built: true, models: 2, },);
    expect(caps.features.controlnet,).toEqual({ available: false, models: 0, },);
    expect(caps.features.video,).toBe(false,);
    expect(caps.features.decisions,).toBe(false,);
    expect(caps.features.audioCpp,).toEqual({
      built: false,
      sttFamilies: [],
      ttsFamilies: [],
    },);

    expect(caps.features.rerank,).toBe(false,);
    expect(caps.features.pythonSidecar,).toBe(false,);
    expect(caps.features.texturePostprocess,).toBe(false,);
    expect(caps.features.fizgig,).toBe(false,);
    expect(caps.features.residencyControl,).toBe(false,);

    expect(caps.features.jobs,).toBe(true,);
    expect(caps.formats.read,).toEqual(["png", "jpeg",],);
    expect(caps.formats.write,).toEqual([
      { format: "png", compression: false, },
      { format: "jpeg", compression: true, },
    ],);

    expect(caps.formats.limits.outputCompression,).toEqual({
      min: 0,
      max: 100,
      appliesTo: "jpeg",
    },);

    expect(caps.auth.mode,).toBe("bearer",);
    expect(caps.queue.gpuSlots,).toBe(1,);
    expect(caps.queue.kinds,).toEqual([{ kind: "sd", queueCap: 4, ttlSecs: 30, },],);
    expect(caps.imageOps?.ops,).toEqual(["resize",],);
    expect(caps.tools?.parallelToolCalls,).toBe(false,);
    expect(caps.recognition,).toEqual({ barcode: true, ocr: false, },);
    expect(caps.openapi,).toBe("/v1/openapi.json",);
    expect(caps.models,).toBe("/v1/models",);
  });

  test("parses the scoped-consumer surface, absent when the server omits it", () => {
    const parsed = parseHonkboxCapabilities(capabilitiesDoc({
      scopes: { enabled: true, scopes: ["HONKBOX_READ_KEY", 42, "",], },
    },),);

    expect(parsed.ok,).toBe(true,);
    if (!parsed.ok) { return; }
    expect(parsed.capabilities.scopes,).toEqual({
      enabled: true,
      consumers: ["HONKBOX_READ_KEY",],
    },);

    const absent = parseHonkboxCapabilities(capabilitiesDoc(),);
    expect(absent.ok,).toBe(true,);
    if (!absent.ok) { return; }
    expect(absent.capabilities.scopes,).toBeUndefined();

    const malformed = parseHonkboxCapabilities(capabilitiesDoc({ scopes: "scoped", },),);
    expect(malformed.ok,).toBe(true,);
    if (!malformed.ok) { return; }
    expect(malformed.capabilities.scopes,).toBeUndefined();
  });

  test("mirrors the feature-on audio.cpp + decisions snapshot", () => {
    const parsed = parseHonkboxCapabilities(capabilitiesDoc({
      features: {
        decisions: false,
        audio_cpp: { built: true, stt_families: ["qwen3_asr",], tts_families: [], },
      },
    },),);

    expect(parsed.ok,).toBe(true,);
    if (!parsed.ok) { return; }
    const caps = parsed.capabilities;
    expect(caps.features.decisions,).toBe(false,);
    expect(caps.features.audioCpp,).toEqual({
      built: true,
      sttFamilies: ["qwen3_asr",],
      ttsFamilies: [],
    },);

    const probe = { ok: true, capabilities: caps, supported: true, latencyMs: 1, } as const;
    expect(isHonkboxFeatureEnabled(probe, "decisions",),).toBe(false,);
    expect(isHonkboxFeatureEnabled(probe, "audio_cpp",),).toBe(true,);
  });

  test("degrades absent and malformed new fields to false/empty", () => {
    const parsed = parseHonkboxCapabilities(capabilitiesDoc({
      features: {
        decisions: "yes",
        audio_cpp: { built: true, stt_families: "qwen3_asr", },
        future_flag: { built: true, },
      },
    },),);

    expect(parsed.ok,).toBe(true,);
    if (!parsed.ok) { return; }
    const caps = parsed.capabilities;
    expect(caps.features.decisions,).toBe(false,);
    expect(caps.features.audioCpp,).toEqual({
      built: true,
      sttFamilies: [],
      ttsFamilies: [],
    },);

    expect("future_flag" in caps.features,).toBe(false,);

    const absent = parseHonkboxCapabilities(capabilitiesDoc({
      features: { audio_cpp: "not-an-object", },
    },),);

    expect(absent.ok,).toBe(true,);
    if (!absent.ok) { return; }
    expect(absent.capabilities.features.audioCpp,).toBeUndefined();
    expect("decisions" in absent.capabilities.features,).toBe(true,);
    const absentProbe = {
      ok: true,
      capabilities: absent.capabilities,
      supported: true,
      latencyMs: 1,
    } as const;

    expect(isHonkboxFeatureEnabled(absentProbe, "audio_cpp",),).toBe(false,);
  });

  test("parses rerank, python sidecar, texture postprocess and fizgig flags", () => {
    const flags = ["rerank", "python_sidecar", "texture_postprocess", "fizgig", "residency_control",] as const;
    const parsed = parseHonkboxCapabilities(capabilitiesDoc({
      features: {
        rerank: true,
        python_sidecar: true,
        texture_postprocess: true,
        fizgig: true,
        residency_control: true,
      },
    },),);

    expect(parsed.ok,).toBe(true,);
    if (!parsed.ok) { return; }
    expect(parsed.capabilities.features.rerank,).toBe(true,);
    expect(parsed.capabilities.features.pythonSidecar,).toBe(true,);
    expect(parsed.capabilities.features.texturePostprocess,).toBe(true,);
    expect(parsed.capabilities.features.fizgig,).toBe(true,);
    expect(parsed.capabilities.features.residencyControl,).toBe(true,);

    const probe = {
      ok: true,
      capabilities: parsed.capabilities,
      supported: true,
      latencyMs: 1,
    } as const;

    for (const flag of flags) {
      expect(HONKBOX_FEATURE_KEYS,).toContain(flag,);
      expect(isHonkboxFeatureEnabled(probe, flag,),).toBe(true,);
    }

    for (
      const features of [
        {},
        { rerank: "yes", python_sidecar: 1, texture_postprocess: null, fizgig: "yes", residency_control: "yes", },
      ]
    ) {
      const tolerant = parseHonkboxCapabilities(capabilitiesDoc({ features, },),);
      expect(tolerant.ok,).toBe(true,);
      if (!tolerant.ok) { continue; }
      const off = {
        ok: true,
        capabilities: tolerant.capabilities,
        supported: true,
        latencyMs: 1,
      } as const;

      for (const flag of flags) {
        expect(isHonkboxFeatureEnabled(off, flag,),).toBe(false,);
      }
    }
  });

  test("parses artifact delivery, storage and external tools", () => {
    const parsed = parseHonkboxCapabilities(capabilitiesDoc({
      features: { jobs: true, events: true, blender: true, artifact_delivery: true, },
      storage: { data_dir_present: true, },
      external_tools: {
        tools: [{
          id: "blender",
          version: "4.3",
          capabilities: ["gltf-binary",],
          devices: ["cpu",],
          available: true,
        },],
      },
    },),);

    expect(parsed.ok,).toBe(true,);
    if (!parsed.ok) { return; }

    const caps = parsed.capabilities;
    expect(caps.features.artifactDelivery,).toBe(true,);
    expect(caps.features.blender,).toBe(true,);
    expect(caps.storage.dataDirPresent,).toBe(true,);
    expect(caps.externalTools?.tools[0]?.id,).toBe("blender",);

    const probe = { ok: true, capabilities: caps, supported: true, latencyMs: 1, } as const;
    expect(isHonkboxFeatureEnabled(probe, "artifactDelivery",),).toBe(true,);
    expect(isHonkboxExternalToolAvailable(probe, "blender", "gltf-binary",),).toBe(true,);
    expect(isHonkboxExternalToolAvailable(probe, "blender", "missing",),).toBe(false,);
  });

  test("llama_server tool gate requires the matching row and capability", () => {
    const parsed = parseHonkboxCapabilities(capabilitiesDoc({
      external_tools: {
        tools: [
          { id: "llama_server", capabilities: ["openai_compat",], available: true, },
          { id: "other_tool", capabilities: ["other",], available: true, },
          { id: "third_tool", capabilities: ["openai_compat",], available: true, },
          { id: "llama_server", capabilities: ["openai_compat",], available: false, },
        ],
      },
    },),);

    expect(parsed.ok,).toBe(true,);
    if (!parsed.ok) { return; }
    const probe = {
      ok: true,
      capabilities: parsed.capabilities,
      supported: true,
      latencyMs: 1,
    } as const;

    expect(
      isHonkboxExternalToolAvailable(probe, "llama_server", "openai_compat",),
    ).toBe(true,);

    expect(isHonkboxExternalToolAvailable(probe, "llama_server",),).toBe(true,);
    expect(isHonkboxExternalToolAvailable(probe, "llama_server", "other",),).toBe(false,);
    expect(isHonkboxExternalToolAvailable(probe, "other_tool", "openai_compat",),).toBe(false,);
    expect(
      isHonkboxExternalToolAvailable(undefined, "llama_server", "openai_compat",),
    ).toBe(false,);

    const unavailable = parseHonkboxCapabilities(capabilitiesDoc({
      external_tools: {
        tools: [{ id: "llama_server", capabilities: ["openai_compat",], available: false, },],
      },
    },),);

    expect(unavailable.ok,).toBe(true,);
    if (!unavailable.ok) { return; }
    const unavailableProbe = {
      ok: true,
      capabilities: unavailable.capabilities,
      supported: true,
      latencyMs: 1,
    } as const;

    expect(
      isHonkboxExternalToolAvailable(unavailableProbe, "llama_server", "openai_compat",),
    ).toBe(false,);
  });

  test("defaults missing sections and rejects non-object bodies", () => {
    expect(parseHonkboxCapabilities({ api_version: "v1", },).ok,).toBe(true,);
    for (const body of [null, ["array",], "string", 42,]) {
      const parsed = parseHonkboxCapabilities(body,);
      expect(parsed.ok,).toBe(false,);
      if (!parsed.ok) { expect(parsed.error,).toContain("not a JSON object",); }
    }

    const missingVersion = parseHonkboxCapabilities({},);
    expect(missingVersion.ok,).toBe(false,);
  });
});

describe("probeHonkboxCapabilities", () => {
  test("successful probe GETs {baseUrl}/capabilities with the bearer key", async () => {
    await withMockFetch((url, init,) => {
      expect(url,).toBe("http://127.0.0.1:9010/v1/capabilities",);
      const headers = new Headers(init?.headers,);
      expect(headers.get("Authorization",),).toBe("Bearer k",);
      return capsResponse();
    }, async () => {
      const probe = await probeHonkboxCapabilities({
        baseUrl: "http://127.0.0.1:9010/v1///",
        apiKey: "k",
      },);

      expect(probe.ok,).toBe(true,);
      if (probe.ok) {
        expect(probe.supported,).toBe(true,);
        expect(probe.capabilities.apiVersion,).toBe("v1",);
        expect(probe.warning,).toBeUndefined();
      }
    },);
  });

  test("unavailable capability: HTTP 404 is a structured failure", async () => {
    await withMockFetch(
      () => new Response("not found", { status: 404, },),
      async () => {
        const probe = await probeHonkboxCapabilities({ baseUrl: "http://127.0.0.1:9010/v1", },);
        expect(probe.ok,).toBe(false,);
        if (!probe.ok) {
          expect(probe.reason,).toBe("http-error",);
          expect(probe.httpStatus,).toBe(404,);
        }
      },
    );
  });

  test("network failure and blank base URL never throw", async () => {
    const blank = await probeHonkboxCapabilities({ baseUrl: "   ", },);
    expect(blank.ok,).toBe(false,);
    if (!blank.ok) { expect(blank.reason,).toBe("invalid-base-url",); }

    await withMockFetch(
      () => {
        throw new Error("ECONNREFUSED",);
      },
      async () => {
        const probe = await probeHonkboxCapabilities({ baseUrl: "http://127.0.0.1:9/v1", },);
        expect(probe.ok,).toBe(false,);
        if (!probe.ok) { expect(probe.reason,).toBe("unreachable",); }
      },
    );
  });

  test("unknown major api_version warns and degrades all flags", async () => {
    await withMockFetch(
      () => capsResponse(capabilitiesDoc({ api_version: "v2", },),),
      async () => {
        const probe = await probeHonkboxCapabilities({ baseUrl: "http://127.0.0.1:9010/v1", },);
        expect(probe.ok,).toBe(true,);
        if (probe.ok) {
          expect(probe.supported,).toBe(false,);
          expect(probe.warning,).toContain("v2",);
          expect(isHonkboxFeatureEnabled(probe, "vision",),).toBe(false,);
          expect(isHonkboxFeatureEnabled(probe, "jobs",),).toBe(false,);
        }
      },
    );
  });

  test("feature gate returns false when a flag or optional section is absent", async () => {
    const doc = capabilitiesDoc();
    delete doc.image_ops;
    delete doc.tools;
    delete doc.recognition;
    const features = doc.features as Record<string, unknown>;
    delete features.decisions;
    delete features.audio_cpp;
    await withMockFetch(() => capsResponse(doc,), async () => {
      const probe = await probeHonkboxCapabilities({ baseUrl: "http://127.0.0.1:9010/v1", },);
      expect(isHonkboxFeatureEnabled(probe, "imageOps",),).toBe(false,);
      expect(isHonkboxFeatureEnabled(probe, "tools",),).toBe(false,);
      expect(isHonkboxFeatureEnabled(probe, "recognition",),).toBe(false,);
      expect(isHonkboxFeatureEnabled(probe, "controlnet",),).toBe(false,);
      expect(isHonkboxFeatureEnabled(probe, "video",),).toBe(false,);
      expect(isHonkboxFeatureEnabled(probe, "decisions",),).toBe(false,);
      expect(isHonkboxFeatureEnabled(probe, "audio_cpp",),).toBe(false,);
      expect(isHonkboxFeatureEnabled(undefined, "vision",),).toBe(false,);
    },);
  });
});

describe("capability cache", () => {
  test("one probe per setup/refresh, keyed by baseUrl plus credential fingerprint", async () => {
    let calls = 0;
    await withMockFetch(() => {
      calls += 1;
      return capsResponse();
    }, async () => {
      const first = await getHonkboxCapabilities({ baseUrl: "http://127.0.0.1:9010/v1", apiKey: "k", },);
      const second = await getHonkboxCapabilities({ baseUrl: "http://127.0.0.1:9010/v1", apiKey: "k", },);
      expect(calls,).toBe(1,);
      expect(second.ok && second.cached,).toBe(true,);

      const fresh = await refreshHonkboxCapabilities({ baseUrl: "http://127.0.0.1:9010/v1", apiKey: "k", },);
      expect(calls,).toBe(2,);
      expect(fresh.ok && fresh.cached,).toBeFalsy();

      await getHonkboxCapabilities({ baseUrl: "http://127.0.0.1:9010/v1", apiKey: "other", },);
      expect(calls,).toBe(3,);

      const key = honkboxCacheKey("http://127.0.0.1:9010/v1", "k",);
      expect(key,).toContain("http://127.0.0.1:9010/v1",);
      expect(key,).not.toContain("k",);
      expect(first.ok,).toBe(true,);
    },);
  });

  test("stale entries re-probe, fresh entries stay cached", async () => {
    let calls = 0;
    await withMockFetch(() => {
      calls += 1;
      return capsResponse();
    }, async () => {
      const opts = { baseUrl: "http://127.0.0.1:9010/v1", apiKey: "stale-key", };
      await getHonkboxCapabilities(opts,);
      expect(calls,).toBe(1,);

      await getHonkboxCapabilities({ ...opts, maxAgeMs: 0, },);
      expect(calls,).toBe(2,);

      const cached = await getHonkboxCapabilities({ ...opts, maxAgeMs: HONKBOX_PROBE_CACHE_TTL_MS, },);
      expect(calls,).toBe(2,);
      expect(cached.ok && cached.cached,).toBe(true,);

      const fresh = await getHonkboxCapabilities(opts,);
      expect(calls,).toBe(2,);
      expect(fresh.ok && fresh.cached,).toBe(true,);
    },);
  });

  test("a failed refresh drops the stale entry", async () => {
    let status = 200;
    await withMockFetch(
      () => status === 200 ? capsResponse() : new Response("down", { status: 503, },),
      async () => {
        await getHonkboxCapabilities({ baseUrl: "http://127.0.0.1:9010/v1", },);
        status = 503;
        const failed = await refreshHonkboxCapabilities({ baseUrl: "http://127.0.0.1:9010/v1", },);
        expect(failed.ok,).toBe(false,);
        status = 200;
        const reProbe = await getHonkboxCapabilities({ baseUrl: "http://127.0.0.1:9010/v1", },);
        expect(reProbe.ok,).toBe(true,);
        expect(reProbe.ok && reProbe.cached,).toBeFalsy();
      },
    );
  });
});

describe("single-side GPU admission", () => {
  test("a live ledger gives honkbox sole ownership; no ledger gives loop-lore", async () => {
    await withMockFetch(() => capsResponse(), async () => {
      const probe = await probeHonkboxCapabilities({ baseUrl: "http://127.0.0.1:9010/v1", },);
      const caps = probe.ok ? probe.capabilities : undefined;
      const decision = honkboxAdmissionDecision(caps,);
      expect(decision.owner,).toBe("honkbox",);
      expect(decision.localAdmissionDenied,).toBe(true,);
      expect(decision.gpuSlots,).toBe(1,);
      expect(() => assertNoDoubleGpuAdmission(decision, true,)).toThrow(HonkboxAdmissionError,);
      expect(() => assertNoDoubleGpuAdmission(decision, false,)).not.toThrow();
    },);

    const fallback = honkboxAdmissionDecision(undefined,);
    expect(fallback.owner,).toBe("loop-lore",);
    expect(fallback.localAdmissionDenied,).toBe(false,);
    expect(() => assertNoDoubleGpuAdmission(fallback, true,)).not.toThrow();
  });

  test("the Custom provider config keeps /v1 once for chat and the probe", () => {
    const config = honkboxCustomProviderConfig({
      baseUrl: "http://127.0.0.1:9010",
      model: "llama",
    },);

    expect(config.baseUrl,).toBe("http://127.0.0.1:9010/v1",);
  });
});

describe("registry constants and URL helpers", () => {
  test("wire-contract constants match the landed protocol", () => {
    expect(HONKBOX_CAPABILITIES_PATH,).toBe("/capabilities",);
    expect(DEFAULT_HONKBOX_PROBE_TIMEOUT_MS,).toBe(3_000,);
    expect(HONKBOX_SUPPORTED_API_MAJOR,).toBe(1,);
    expect([...HONKBOX_FEATURE_KEYS,],).toEqual([
      "vision",
      "controlnet",
      "lora",
      "video",
      "jobs",
      "events",
      "vad",
      "experimentalAshSd",
      "blender",
      "artifactDelivery",
      "imageOps",
      "tools",
      "recognition",
      "decisions",
      "audio_cpp",
      "rerank",
      "python_sidecar",
      "texture_postprocess",
      "fizgig",
      "residency_control",
    ],);
  });

  test("normalizeHonkboxBaseUrl trims and strips trailing slashes", () => {
    expect(normalizeHonkboxBaseUrl("http://127.0.0.1:9010/v1/",),).toBe("http://127.0.0.1:9010/v1",);
    expect(normalizeHonkboxBaseUrl("  http://127.0.0.1:9010/v1  ",),).toBe("http://127.0.0.1:9010/v1",);
    expect(normalizeHonkboxBaseUrl("",),).toBe("",);
  });

  test("peekHonkboxCapabilities sees probed entries and misses unknown hosts", async () => {
    expect(peekHonkboxCapabilities("http://127.0.0.1:9010/v1", "k",),).toBeUndefined();
    await withMockFetch(() => capsResponse(), async () => {
      const probed = await getHonkboxCapabilities({ baseUrl: "http://127.0.0.1:9010/v1", apiKey: "k", },);
      expect(probed.ok,).toBe(true,);
      const hit = peekHonkboxCapabilities("http://127.0.0.1:9010/v1", "k",);
      expect(hit?.ok,).toBe(true,);
      expect(hit?.cached,).toBe(true,);
      expect(peekHonkboxCapabilities("http://127.0.0.1:9010/v1", "other",),).toBeUndefined();
    },);
  });
});
