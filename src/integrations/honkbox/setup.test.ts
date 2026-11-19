// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Tests for the honkbox provider-setup probe (mirrors sd.cpp setup gating). */

import { afterEach, describe, expect, test, } from "bun:test";
import { getProvider, unregisterProvider, } from "../../generation/providers/registry";
import {
  clearHonkboxCapabilitiesCache,
  setupHonkboxCustomProvider,
} from "./index";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  clearHonkboxCapabilitiesCache();
  unregisterProvider("honkbox-setup-test",);
},);

const document = {
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

describe("setupHonkboxCustomProvider", () => {
  test("probes once at setup, registers the Custom provider and resolves admission", async () => {
    const urls: string[] = [];
    globalThis.fetch = (async (url: string | URL | Request,) => {
      urls.push(String(url,),);
      return new Response(JSON.stringify(document,), { status: 200, },);
    }) as typeof fetch;

    const result = await setupHonkboxCustomProvider({
      name: "honkbox-setup-test",
      baseUrl: "http://127.0.0.1:9010",
      model: "llama",
    },);

    expect(urls,).toEqual(["http://127.0.0.1:9010/v1/capabilities",],);
    expect(result.config.baseUrl,).toBe("http://127.0.0.1:9010/v1",);
    expect(result.admission.owner,).toBe("honkbox",);
    expect(result.admission.localAdmissionDenied,).toBe(true,);
    expect(result.probe.ok,).toBe(true,);
    expect(getProvider("honkbox-setup-test",),).toBeDefined();
  });

  test("an unreachable server still registers but warns without breaking boot", async () => {
    globalThis.fetch =
      (async (_url: string | URL | Request,) => new Response("down", { status: 503, },)) as typeof fetch;

    const result = await setupHonkboxCustomProvider({
      name: "honkbox-setup-test",
      baseUrl: "http://127.0.0.1:9010/v1",
      model: "llama",
    },);

    expect(result.probe.ok,).toBe(false,);
    expect(result.admission.owner,).toBe("loop-lore",);
    expect(getProvider("honkbox-setup-test",),).toBeDefined();
  });
});
