// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/federation/clock.ts — Monotonic send-side clock for envelope LWW.
//
// Hybrid-logical-clock send/receive rules collapsed onto a single INTEGER
// millisecond value (the `clock` column stays INTEGER, no migration):
// send stamps max(wall, last+1), receive adopts higher remote stamps.
// Guarantees per-node monotonicity across bursts and restarts of the wall
// clock; cross-node skew still resolves via the content-hash tie-break.

/** Monotonic mesh clock. Not shared across processes. */
export interface MeshClock {
  /** Next send timestamp (monotonic). */
  tick(): number;
  /** Adopt a received timestamp when higher (HLC receive rule). */
  observe(remote: number,): void;
}

/**
 * @param now Wall-clock source (injectable for tests).
 * @example
 * const clock = createMeshClock();
 * const envelope = await sealContent({ ..., clock: clock.tick(), cipher, });
 */
export function createMeshClock(now: () => number = Date.now,): MeshClock {
  let last = 0;
  return {
    tick(): number {
      last = Math.max(now(), last + 1,);
      return last;
    },
    observe(remote: number,): void {
      if (remote > last) { last = remote; }
    },
  };
}
