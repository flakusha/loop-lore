// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/autonomy/rng.ts — seed → per-tick RNG derivation
//
// The autonomy determinism split (see docs/spec/autonomy-determinism.md):
// the deterministic tier needs no RNG at all, and the nondeterministic
// tier (jitter drop, wander/flee target choice) is made reproducible by
// deriving a FRESH stream per tick instead of sharing one across the
// world's whole lifetime.
//
// ponytail: no snapshot/replay subsystem by design. Persisted state
// (`world_simulation_state` + `autonomy_budget`) is the commit point;
// a replay harness can re-derive any tick from seed + tickIndex, so
// snapshotting RNG state would add machinery nothing reads.

/**
 * Standard 32-bit PRNG (mulberry32). State advances by the golden-ratio
 * increment, then a bit mix; output is a float in [0, 1).
 * @param seed 32-bit initial state.
 * @returns generator producing floats in [0, 1).
 */
export function mulberry32(seed: number,): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1,);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61,);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Fold arbitrary parts into one 32-bit unsigned int. FNV-1a over each
 * part's string form — cheap, stable across processes, no deps.
 * @param parts values to fold (strings, ids, or numbers)
 * @returns 32-bit unsigned hash
 */
export function hashSeed(...parts: Array<string | number>): number {
  let hash = 0x811c9dc5;
  for (const part of parts) {
    const text = String(part,);
    for (let i = 0; i < text.length; i++) {
      hash = Math.imul(hash ^ text.charCodeAt(i,), 0x01000193,) >>> 0;
    }

    // Separator so ("ab","c") and ("a","bc") don't collide.
    hash = Math.imul(hash ^ 0x2f, 0x01000193,) >>> 0;
  }

  return hash >>> 0;
}

/**
 * RNG for one world-tick. `seed === null` is the production path and
 * returns `Math.random` unchanged.
 *
 * Deriving per tick (rather than one shared stream per world) means a
 * jitter drop in tick 7 cannot shift tick 8's draws, so replaying a
 * single tick in isolation is exact.
 * @param root0 seed from `AutonomyConfig.seed`; null = unseeded
 * @param root0.seed
 * @param root0.worldId world the tick belongs to
 * @param root0.tickIndex index of the tick within the world's run
 * @returns generator producing floats in [0, 1)
 */
export function deriveTickRng(
  { seed, worldId, tickIndex, }: { seed: number | null; worldId: string; tickIndex: number },
): () => number {
  if (seed === null) { return Math.random; }
  return mulberry32(hashSeed(seed, worldId, tickIndex,),);
}
