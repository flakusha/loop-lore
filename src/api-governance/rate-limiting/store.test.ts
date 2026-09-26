// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Store eviction tests: prune-on-access + interval sweep (no timers). */
import { describe, expect, test, } from "bun:test";
import { InMemoryRateLimitStore, } from "./store";

describe("InMemoryRateLimitStore eviction", () => {
  test("loadWindow prunes stale timestamps and drops fully expired entries", () => {
    const store = new InMemoryRateLimitStore();
    store.saveWindow("k", [1_000, 1_500,], 1_000, 1_500,);
    // 1_000 is exactly at the cutoff boundary (t > now - windowMs keeps 1_500 only
    // once now = 2_400); at now = 2_600 both are expired.
    expect(store.loadWindow("k", 2_400,),).toEqual([1_500,],);
    expect(store.loadWindow("k", 2_600,),).toEqual([],);
    // Entry dropped, not an empty shell.
    expect(store.loadWindow("k", 2_600,),).toEqual([],);
    store.destroy();
  });

  test("many idle keys stay bounded (sweep drops fully expired entries)", () => {
    const store = new InMemoryRateLimitStore();
    // SWEEP_INTERVAL is 1024 saves; insert well past it across two epochs.
    for (let i = 0; i < 2_500; i++) {
      store.saveWindow(`key-${i}`, [10,], 1_000, 100,);
    }
    // Still mid-epoch-1 in wall time: nothing evictable yet, keys present.
    expect(store.loadWindow("key-0", 100,),).toEqual([10,],);
    // Time passes far beyond every window, then one more save triggers the sweep.
    store.saveWindow("fresh", [5_000_000,], 1_000, 5_000_000,);
    for (let i = 0; i < 1_024; i++) {
      store.saveWindow(`fresh-${i}`, [5_000_000,], 1_000, 5_000_000,);
    }
    // All stale idle keys are gone.
    expect(store.loadWindow("key-0", 5_000_000,),).toEqual([],);
    expect(store.loadWindow("key-2499", 5_000_000,),).toEqual([],);
    store.destroy();
  });

  test("idle buckets are swept too", () => {
    const store = new InMemoryRateLimitStore();
    store.saveBucket("b", { tokens: 1, lastRefillMs: 100, }, 1_000, 100,);
    expect(store.loadBucket("b",),).toEqual({ tokens: 1, lastRefillMs: 100, },);
    for (let i = 0; i < 1_024; i++) {
      store.saveWindow(`w-${i}`, [5_000_000,], 1_000, 5_000_000,);
    }
    expect(store.loadBucket("b",),).toBeUndefined();
    store.destroy();
  });
});
