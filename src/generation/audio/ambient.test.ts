/**
 * Tests for ambient scene audio: layer planning, local-provider mixing,
 * determinism, and provider-resolution failures.
 *
 * The local procedural provider generates here (no network, ~1s of DSP per
 * track), so the mixed WAV is decoded back and asserted on.
 */
import { describe, expect, test, } from "bun:test";
import { buildAmbientLayers, generateAmbient, } from "./ambient";
import { createLocalAudioProvider, } from "./providers/local";
import {
  listAudioProviders,
  registerAudioProvider,
  unregisterAudioProvider,
} from "./types";
import { decodeWav, } from "./wav";

/** Register the local provider unless a sibling test already did. */
function ensureLocal(): void {
  if (!listAudioProviders().includes("local",)) {
    registerAudioProvider(createLocalAudioProvider(),);
  }
}

describe("buildAmbientLayers", () => {
  test("maps scene tags to textures in order, deduping and lowercasing", () => {
    const layers = buildAmbientLayers({ tags: ["Forest", "forest", "RAIN",], },);

    expect(layers.map((l,) => l.tag),).toEqual(["forest", "rain",],);
    expect(layers[0]?.texture,).toBe("forest",);
    expect(layers[1]?.texture,).toBe("rain",);
  });

  test("falls back to a soft bed for unmapped tags", () => {
    const layers = buildAmbientLayers({ tags: ["spaceship",], },);
    expect(layers[0]?.texture,).toBe("bed",);
  });

  test("caps layers and scales extra layers by intensity", () => {
    const calm = buildAmbientLayers({ tags: ["forest", "rain", "wind", "fire", "city",], intensity: 0, },);
    const wild = buildAmbientLayers({ tags: ["forest", "rain", "wind", "fire", "city",], intensity: 1, },);

    expect(calm,).toHaveLength(4,);
    expect(calm[0]?.volume,).toBe(0.9,);
    expect(calm[1]?.volume,).toBeCloseTo(0.25, 5,);
    expect(wild[1]?.volume,).toBeCloseTo(0.75, 5,);
  });

  test("renders prompts through the SFX audio profile template", () => {
    const layers = buildAmbientLayers({ tags: ["cave",], mood: "tense", },);

    expect(layers[0]?.prompt,).toContain("echoing cave",);
    expect(layers[0]?.prompt,).toContain("tense",);
    expect(layers[0]?.prompt,).not.toContain("{{",);
  });

  test("rejects an empty tag list", () => {
    expect(() => buildAmbientLayers({ tags: ["  ",], },)).toThrow(/scene tag/,);
  });

  test("rejects a profile that does not support sfx", () => {
    expect(() => buildAmbientLayers({ tags: ["city",], profileId: "openai-tts", },)).toThrow(/sfx/,);
  });
});

describe("generateAmbient", () => {
  test("mixes a two-layer track at the requested duration", async () => {
    ensureLocal();
    const outcome = await generateAmbient({ tags: ["forest", "rain",], durationSec: 2, seed: 42, },);

    expect(outcome.ok,).toBe(true,);
    if (!outcome.ok) { return; }
    expect(outcome.mimeType,).toBe("audio/wav",);
    expect(outcome.providerId,).toBe("local",);
    expect(outcome.layers.map((l,) => l.tag),).toEqual(["forest", "rain",],);

    const decoded = decodeWav(outcome.buffer,);
    expect(decoded.sampleRate,).toBe(32_000,);
    expect(decoded.samples.length,).toBe(64_000,);
  });

  test("is deterministic per seed and varies across seeds", async () => {
    ensureLocal();
    const a = await generateAmbient({ tags: ["night",], durationSec: 1, seed: 7, },);
    const b = await generateAmbient({ tags: ["night",], durationSec: 1, seed: 7, },);
    const c = await generateAmbient({ tags: ["night",], durationSec: 1, seed: 8, },);

    expect(a.ok && b.ok && c.ok,).toBe(true,);
    if (!a.ok || !b.ok || !c.ok) { return; }
    expect(a.buffer.equals(b.buffer,),).toBe(true,);
    expect(a.buffer.equals(c.buffer,),).toBe(false,);
  });

  test("fails with 400 for an unknown provider id", async () => {
    ensureLocal();
    const outcome = await generateAmbient({ tags: ["rain",], provider: "nope", },);

    expect(outcome.ok,).toBe(false,);
    if (outcome.ok) { return; }
    expect(outcome.status,).toBe(400,);
  });

  test("reports the registration miss when no provider is registered", async () => {
    unregisterAudioProvider("local",);
    try {
      const outcome = await generateAmbient({ tags: ["rain",], },);
      expect(outcome.ok,).toBe(false,);
      if (outcome.ok) { return; }
      expect(outcome.status,).toBe(503,);
    } finally {
      ensureLocal();
    }
  });
});
