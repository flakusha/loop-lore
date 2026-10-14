// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Local procedural audio provider — synthesizes ambient/SFX textures with
 * pure DSP (no model, no network). Registered as "local" and always
 * available, so the ambient endpoint works without any provider config.
 *
 * ponytail: hand-rolled lowpass/brown-noise/heuristic crackles — a real
 * sample library is the upgrade path if textures need to sound better.
 */
import type { AudioGenOutcome, AudioGenRequest, AudioProvider, } from "../types";
import { encodeWav, } from "../wav";

/**
 * Deterministic per-seed RNG (mulberry32).
 * @param seed
 */
function makeRng(seed: number,): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1,);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61,);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/**
 * Stable text hash for prompt-derived seeds.
 * @param text
 */
function hashText(text: string,): number {
  let h = 2_166_136_261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i,);
    h = Math.imul(h, 16_777_619,);
  }

  return h >>> 0;
}

/**
 * One-pole low-pass in place.
 * @param opts
 */
function lowpass(opts: { out: Float32Array; cutoff: number; sampleRate: number },): void {
  const { out, cutoff, sampleRate, } = opts;
  const alpha = 1 - Math.exp((-2 * Math.PI * cutoff) / sampleRate,);
  let acc = 0;

  for (let i = 0; i < out.length; i++) {
    acc += alpha * (out[i]! - acc);
    out[i] = acc;
  }
}

/**
 * Fill `out` with white noise.
 * @param out
 * @param rng
 */
function white(out: Float32Array, rng: () => number,): void {
  for (let i = 0; i < out.length; i++) { out[i]! = rng() * 2 - 1; }
}

/**
 * Brown (integrated) noise in place, peak-normalized.
 * @param out
 * @param rng
 */
function brown(out: Float32Array, rng: () => number,): void {
  let last = 0;
  for (let i = 0; i < out.length; i++) {
    last = (last + 0.02 * (rng() * 2 - 1)) / 1.02;
    out[i]! = last;
  }

  normalize(out,);
}

/**
 * One decaying sine burst written at `start`.
 * @param opts
 */
function burst(opts: {
  out: Float32Array;
  start: number;
  freq: number;
  decaySec: number;
  amp: number;
  sampleRate: number;
},): void {
  const { out, start, freq, decaySec, amp, sampleRate, } = opts;
  const len = Math.round(decaySec * sampleRate,);
  for (let i = 0; i < len && start + i < out.length; i++) {
    const env = Math.exp(-8 * (i / len),);
    out[start + i]! += amp * env * Math.sin(2 * Math.PI * freq * (i / sampleRate),);
  }
}

/**
 * Sine sweep burst (horns).
 * @param opts
 */
function sweep(opts: {
  out: Float32Array;
  start: number;
  fromHz: number;
  toHz: number;
  durSec: number;
  amp: number;
  sampleRate: number;
},): void {
  const { out, start, fromHz, toHz, durSec, amp, sampleRate, } = opts;
  const len = Math.round(durSec * sampleRate,);
  let phase = 0;
  for (let i = 0; i < len && start + i < out.length; i++) {
    const freq = fromHz + ((toHz - fromHz) * i) / len;
    phase += 2 * Math.PI * freq / sampleRate;
    out[start + i]! += amp * Math.sin(phase,);
  }
}

/**
 * Slow amplitude LFO applied in place (0..1 → 0..depth).
 * @param opts
 */
function lfo(opts: { out: Float32Array; rateHz: number; depth: number; sampleRate: number },): void {
  const { out, rateHz, depth, sampleRate, } = opts;
  for (let i = 0; i < out.length; i++) {
    const mod = 1 - depth * (0.5 + 0.5 * Math.sin(2 * Math.PI * rateHz * (i / sampleRate),));
    out[i]! *= mod;
  }
}

/**
 * Peak-normalize to 0.89.
 * @param out
 */
function normalize(out: Float32Array,): void {
  let peak = 0;
  for (const v of out) { peak = Math.max(peak, Math.abs(v,),); }
  if (peak > 0) {
    const scale = 0.89 / peak;
    for (let i = 0; i < out.length; i++) { out[i]! *= scale; }
  }
}

/** Texture builder: fills `n` samples for the given RNG. */
type TextureFn = (out: Float32Array, rng: () => number, sampleRate: number,) => void;

const TEXTURES: Record<string, TextureFn> = {
  rain: (out, rng, sr,) => {
    white(out, rng,);
    lowpass({ out, cutoff: 2_500, sampleRate: sr, },);
    lfo({ out, rateHz: 0.08, depth: 0.25, sampleRate: sr, },);
  },
  wind: (out, rng, sr,) => {
    brown(out, rng,);
    lowpass({ out, cutoff: 700, sampleRate: sr, },);
    lfo({ out, rateHz: 0.05, depth: 0.6, sampleRate: sr, },);
  },
  fire: (out, rng, sr,) => {
    brown(out, rng,);
    lowpass({ out, cutoff: 420, sampleRate: sr, },);
    for (let t = Math.round(0.05 * sr,); t < out.length; t += Math.round((0.06 + rng() * 0.22) * sr,)) {
      burst({ out, start: t, freq: 700 + rng() * 2_600, decaySec: 0.05, amp: 0.25 + rng() * 0.4, sampleRate: sr, },);
    }
  },
  night: (out, rng, sr,) => {
    white(out, rng,);
    lowpass({ out, cutoff: 500, sampleRate: sr, },);
    for (let t = Math.round(0.1 * sr,); t < out.length; t += Math.round((0.12 + rng() * 0.25) * sr,)) {
      burst({ out, start: t, freq: 4_200 + rng() * 800, decaySec: 0.012, amp: 0.2 + rng() * 0.3, sampleRate: sr, },);
    }
  },
  forest: (out, rng, sr,) => {
    white(out, rng,);
    lowpass({ out, cutoff: 1_800, sampleRate: sr, },);
    for (let t = Math.round(0.4 * sr,); t < out.length; t += Math.round((0.5 + rng() * 1.4) * sr,)) {
      const chirp = Math.round((0.03 + rng() * 0.05) * sr,);
      const freq = 1_800 + rng() * 2_200;
      for (let i = 0; i < chirp && t + i < out.length; i++) {
        const env = Math.exp(-6 * (i / chirp),);
        out[t + i]! += 0.25 * env * Math.sin(2 * Math.PI * (freq + 1_600 * (i / chirp)) * (i / sr),);
      }
    }
  },
  city: (out, rng, sr,) => {
    brown(out, rng,);
    lowpass({ out, cutoff: 180, sampleRate: sr, },);
    for (let t = Math.round(1.5 * sr,); t < out.length; t += Math.round((2 + rng() * 5) * sr,)) {
      sweep({
        out,
        start: t,
        fromHz: 180 + rng() * 120,
        toHz: 140 + rng() * 140,
        durSec: 0.35 + rng() * 0.5,
        amp: 0.12 + rng() * 0.18,
        sampleRate: sr,
      },);
    }
  },
  water: (out, rng, sr,) => {
    white(out, rng,);
    lowpass({ out, cutoff: 1_500, sampleRate: sr, },);
    lfo({ out, rateHz: 0.12, depth: 0.35, sampleRate: sr, },);
  },
  cave: (out, rng, sr,) => {
    brown(out, rng,);
    lowpass({ out, cutoff: 300, sampleRate: sr, },);
    lfo({ out, rateHz: 0.03, depth: 0.4, sampleRate: sr, },);
    for (let t = Math.round(0.8 * sr,); t < out.length; t += Math.round((0.7 + rng() * 2) * sr,)) {
      burst({ out, start: t, freq: 800 + rng() * 500, decaySec: 0.12, amp: 0.15 + rng() * 0.2, sampleRate: sr, },);
    }
  },
  bed: (out, rng, sr,) => {
    white(out, rng,);
    lowpass({ out, cutoff: 450, sampleRate: sr, },);
    lfo({ out, rateHz: 0.04, depth: 0.2, sampleRate: sr, },);
  },
};

/** Fallback texture when `texture` is unknown. */
const DEFAULT_TEXTURE: TextureFn = TEXTURES.bed!;

/**
 * Create the local procedural audio provider (id "local").
 * @returns A provider synthesizing a deterministic texture per request.
 */
export function createLocalAudioProvider(): AudioProvider {
  return {
    id: "local",
    async generate(request: AudioGenRequest,): Promise<AudioGenOutcome> {
      const sampleRate = 32_000;
      const seconds = Math.max(1, Math.min(300, Math.round(request.seconds,),),);
      const texture = request.texture ?? "";
      const builder = TEXTURES[texture] ?? DEFAULT_TEXTURE;
      const seed = request.seed ?? hashText(texture || request.prompt,);
      const out = new Float32Array(Math.round(seconds * sampleRate,),);

      builder(out, makeRng(seed,), sampleRate,);
      normalize(out,);

      return { ok: true, buffer: encodeWav({ sampleRate, samples: out, },), mimeType: "audio/wav", };
    },
  };
}
