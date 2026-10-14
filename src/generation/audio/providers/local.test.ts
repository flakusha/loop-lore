/**
 * Tests for the local procedural audio provider: deterministic output per
 * seed, the texture catalogue, the unknown-texture fallback, duration
 * clamping and the WAV container contract.
 */
import { describe, expect, test, } from "bun:test";
import { decodeWav, } from "../wav";
import { createLocalAudioProvider, } from "./local";

/** Every texture the local provider knows how to synthesize. */
const TEXTURES = [
  "rain",
  "wind",
  "fire",
  "night",
  "forest",
  "city",
  "water",
  "cave",
  "bed",
] as const;

const provider = createLocalAudioProvider();

/** Minimal request shape used across the tests. */
function request(overrides: { texture?: string; seed?: number; seconds?: number; prompt?: string },) {
  return { prompt: overrides.prompt ?? "ambient", seconds: overrides.seconds ?? 1, ...overrides, };
}

describe("createLocalAudioProvider", () => {
  test("returns a WAV container", async () => {
    const outcome = await provider.generate(request({ texture: "rain", seed: 7, },),);

    expect(outcome.ok,).toBe(true,);
    if (!outcome.ok) { return; }
    expect(outcome.mimeType,).toBe("audio/wav",);
    expect(outcome.buffer.subarray(0, 4,).toString("ascii",),).toBe("RIFF",);
    expect(outcome.buffer.subarray(8, 12,).toString("ascii",),).toBe("WAVE",);
  });

  test("synthesizes every catalogue texture without saturating", async () => {
    for (const texture of TEXTURES) {
      const outcome = await provider.generate(request({ texture, seed: 42, },),);

      expect(outcome.ok,).toBe(true,);
      if (!outcome.ok) { return; }
      const { samples, sampleRate, } = decodeWav(outcome.buffer,);
      expect(sampleRate,).toBeGreaterThan(0,);
      expect(samples.length,).toBe(sampleRate,);
      // normalize() peaks below full scale, and no branch may emit NaN.
      const peak = Math.max(...samples.map(Math.abs,),);
      expect(peak,).toBeGreaterThan(0,);
      expect(peak,).toBeLessThanOrEqual(0.89,);
      expect(samples.some((v,) => Number.isNaN(v,)),).toBe(false,);
    }
  });

  test("is deterministic for a seed and differs across textures", async () => {
    const first = await provider.generate(request({ texture: "rain", seed: 11, },),);
    const second = await provider.generate(request({ texture: "rain", seed: 11, },),);
    const other = await provider.generate(request({ texture: "city", seed: 11, },),);

    expect(first.ok && second.ok && other.ok,).toBe(true,);
    if (!first.ok || !second.ok || !other.ok) { return; }
    expect(Buffer.compare(first.buffer, second.buffer,),).toBe(0,);
    expect(Buffer.compare(first.buffer, other.buffer,),).not.toBe(0,);
  });

  test("falls back to the bed texture for an unknown id", async () => {
    const unknown = await provider.generate(request({ texture: "nope", seed: 3, },),);
    const bed = await provider.generate(request({ texture: "bed", seed: 3, },),);

    expect(unknown.ok && bed.ok,).toBe(true,);
    if (!unknown.ok || !bed.ok) { return; }
    expect(Buffer.compare(unknown.buffer, bed.buffer,),).toBe(0,);
  });

  test("derives the seed from the prompt when none is given", async () => {
    const first = await provider.generate(request({ texture: "rain", prompt: "storm", },),);
    const second = await provider.generate(request({ texture: "rain", prompt: "storm", },),);
    const seeded = await provider.generate(
      request({ texture: "rain", prompt: "storm", seed: 99, },),
    );

    expect(first.ok && second.ok,).toBe(true,);
    if (!first.ok || !second.ok) { return; }
    expect(Buffer.compare(first.buffer, second.buffer,),).toBe(0,);
    expect(seeded.ok,).toBe(true,);
    if (!seeded.ok) { return; }
    expect(Buffer.compare(first.buffer, seeded.buffer,),).not.toBe(0,);
  });

  test("clamps the requested duration to at least one second", async () => {
    const outcome = await provider.generate(request({ texture: "rain", seed: 5, seconds: 0, },),);

    expect(outcome.ok,).toBe(true,);
    if (!outcome.ok) { return; }
    expect(decodeWav(outcome.buffer,).samples.length,).toBe(32_000,);
  });
});
