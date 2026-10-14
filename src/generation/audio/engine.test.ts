/**
 * Tests for audio provider registration + resolution.
 *
 * Scope: config-driven ComfyUI registration, resolution order (explicit id,
 * first comfyui, local fallback), and the failure branches.
 */
import { describe, expect, test, } from "bun:test";
import type { Config, } from "../../config/schema/config";
import { generateAudio, registerAudioProviders, resolveAudioProvider, } from "./engine";
import { getAudioProvider, listAudioProviders, unregisterAudioProvider, } from "./types";

/** Minimal config stub — only the generation.providers.audio slice matters. */
function configWithAudio(audio: { baseUrl: string; workflow: string }[],): Config {
  const providers = audio.map((entry,) => ({
    name: entry.workflow,
    baseUrl: entry.baseUrl,
    apiFamily: "comfyui" as const,
    workflow: entry.workflow,
    timeout: 1_000,
    generationTimeout: 2_000,
  }));

  return { generation: { providers: { openaiCompatible: [], audio: providers, }, }, } as unknown as Config;
}

describe("registerAudioProviders", () => {
  test("registers the local provider with no config", () => {
    registerAudioProviders(undefined,);
    expect(listAudioProviders(),).toContain("local",);
  });

  test("registers one provider per configured ComfyUI entry", () => {
    registerAudioProviders(configWithAudio([
      { baseUrl: "http://localhost:8188", workflow: "txt2audio", },
      { baseUrl: "http://localhost:8189", workflow: "txt2music", },
    ],),);

    const ids = listAudioProviders();
    expect(ids,).toContain("local",);
    expect(ids,).toContain("comfyui:txt2audio",);
    expect(ids,).toContain("comfyui:txt2music",);
    expect(getAudioProvider("comfyui:txt2audio",)?.id,).toBe("comfyui:txt2audio",);
    expect(getAudioProvider("comfyui:absent",),).toBeUndefined();
  });
});

describe("resolveAudioProvider", () => {
  test("rejects an unknown explicit id with 400", () => {
    const resolved = resolveAudioProvider({ provider: "missing", },);
    expect(resolved.ok,).toBe(false,);
    if (resolved.ok) { return; }
    expect(resolved.status,).toBe(400,);
  });

  test("resolves an explicit id over the default order", () => {
    const resolved = resolveAudioProvider({ provider: "local", },);
    expect(resolved.ok,).toBe(true,);
    if (!resolved.ok) { return; }
    expect(resolved.provider.id,).toBe("local",);
  });

  test("prefers comfyui over local when no id is given", () => {
    registerAudioProviders(configWithAudio([{ baseUrl: "http://localhost:8188", workflow: "txt2audio", },],),);
    const resolved = resolveAudioProvider({},);
    expect(resolved.ok,).toBe(true,);
    if (!resolved.ok) { return; }
    expect(resolved.provider.id,).toBe("comfyui:txt2audio",);
  });

  test("falls back to local once comfyui entries are gone", () => {
    for (const id of listAudioProviders().filter((id,) => id.startsWith("comfyui:",))) {
      unregisterAudioProvider(id,);
    }

    const resolved = resolveAudioProvider({},);
    expect(resolved.ok,).toBe(true,);
    if (!resolved.ok) { return; }
    expect(resolved.provider.id,).toBe("local",);
  });

  test("reports 503 when no provider is registered at all", () => {
    for (const id of listAudioProviders()) {
      unregisterAudioProvider(id,);
    }

    const resolved = resolveAudioProvider({},);
    expect(resolved.ok,).toBe(false,);
    if (resolved.ok) { return; }
    expect(resolved.status,).toBe(503,);

    // Restore for sibling suites sharing this process.
    registerAudioProviders(undefined,);
  });
});

describe("generateAudio", () => {
  test("passes the request through the resolved provider", async () => {
    const outcome = await generateAudio({ request: { prompt: "rain", seconds: 1, }, },);
    expect(outcome.ok,).toBe(true,);
    if (!outcome.ok) { return; }
    expect(outcome.mimeType,).toBe("audio/wav",);
    expect(outcome.buffer.length,).toBeGreaterThan(0,);
  });
});
