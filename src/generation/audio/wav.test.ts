/**
 * Tests for the minimal WAV codec + layer mixing.
 *
 * Scope: header round trip, format rejection, mono downmix, mixLayers
 * duration/fade contract. No provider or network involved.
 */
import { describe, expect, test, } from "bun:test";
import { decodeWav, encodeWav, mixLayers, } from "./wav";

/** Build a 16-bit stereo WAV buffer for decode tests. */
function stereo16(sampleRate: number, left: number[], right: number[],): Buffer {
  const dataSize = left.length * 4;
  const buffer = Buffer.alloc(44 + dataSize,);
  buffer.write("RIFF", 0, "ascii",);
  buffer.writeUInt32LE(36 + dataSize, 4,);
  buffer.write("WAVE", 8, "ascii",);
  buffer.write("fmt ", 12, "ascii",);
  buffer.writeUInt32LE(16, 16,);
  buffer.writeUInt16LE(1, 20,);
  buffer.writeUInt16LE(2, 22,);
  buffer.writeUInt32LE(sampleRate, 24,);
  buffer.writeUInt32LE(sampleRate * 4, 28,);
  buffer.writeUInt16LE(4, 32,);
  buffer.writeUInt16LE(16, 34,);
  buffer.write("data", 36, "ascii",);
  buffer.writeUInt32LE(dataSize, 40,);
  for (let i = 0; i < left.length; i++) {
    buffer.writeInt16LE(Math.round(left[i]! * 32_767,), 44 + i * 4,);
    buffer.writeInt16LE(Math.round(right[i]! * 32_767,), 44 + i * 4 + 2,);
  }

  return buffer;
}

describe("encodeWav / decodeWav", () => {
  test("round-trips mono samples with the requested length", () => {
    const samples = new Float32Array([0, 0.5, -0.5, 1, -1, 0.25,],);
    const decoded = decodeWav(encodeWav({ sampleRate: 8_000, samples, },),);

    expect(decoded.sampleRate,).toBe(8_000,);
    expect(decoded.samples.length,).toBe(samples.length,);
    for (let i = 0; i < samples.length; i++) {
      expect(decoded.samples[i],).toBeCloseTo(samples[i]!, 3,);
    }
  });

  test("downmixes stereo to mono", () => {
    const decoded = decodeWav(stereo16(16_000, [1, -1,], [0, 0,],),);

    expect(decoded.samples.length,).toBe(2,);
    expect(decoded.samples[0],).toBeCloseTo(0.5, 3,);
    expect(decoded.samples[1],).toBeCloseTo(-0.5, 3,);
  });

  test("rejects non-WAV buffers", () => {
    expect(() => decodeWav(Buffer.from("not a wav file at all",),)).toThrow(/RIFF/,);
  });

  test("rejects unsupported bit depth", () => {
    const eight = Buffer.alloc(44 + 2,);
    eight.write("RIFF", 0, "ascii",);
    eight.writeUInt32LE(38, 4,);
    eight.write("WAVE", 8, "ascii",);
    eight.write("fmt ", 12, "ascii",);
    eight.writeUInt32LE(16, 16,);
    eight.writeUInt16LE(1, 20,);
    eight.writeUInt16LE(1, 22,);
    eight.writeUInt32LE(8_000, 24,);
    eight.writeUInt16LE(8, 34,);
    eight.write("data", 36, "ascii",);
    eight.writeUInt32LE(2, 40,);

    expect(() => decodeWav(eight,)).toThrow(/bit depth/,);
  });
});

describe("mixLayers", () => {
  const samples = new Float32Array([1, 1, 1, 1,],);

  test("produces exactly the requested duration", () => {
    const mixed = mixLayers({
      layers: [{ data: { sampleRate: 4, samples, }, volume: 1, fadeInSec: 0, fadeOutSec: 0, },],
      durationSec: 10,
      sampleRate: 4,
    },);

    expect(mixed.samples.length,).toBe(40,);
    expect(mixed.samples[0],).toBe(1,);
  });

  test("starts a faded-in layer at silence", () => {
    const mixed = mixLayers({
      layers: [{ data: { sampleRate: 4, samples, }, volume: 1, fadeInSec: 1, fadeOutSec: 0, },],
      durationSec: 4,
      sampleRate: 4,
    },);

    expect(mixed.samples[0],).toBeCloseTo(0, 5,);
    expect(mixed.samples[1],).toBeCloseTo(0.25, 5,);
  });

  test("clamps summed layers to [-1, 1]", () => {
    const mixed = mixLayers({
      layers: [
        { data: { sampleRate: 4, samples, }, volume: 1, fadeInSec: 0, fadeOutSec: 0, },
        { data: { sampleRate: 4, samples, }, volume: 1, fadeInSec: 0, fadeOutSec: 0, },
      ],
      durationSec: 4,
      sampleRate: 4,
    },);

    expect(mixed.samples.length,).toBe(16,);
    expect(Array.from(mixed.samples.slice(0, 4,),),).toEqual([1, 1, 1, 1,],);
    expect(Array.from(mixed.samples.slice(4,),),).toEqual(new Array(12,).fill(0,),);
  });
});
