// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { ConcurrencyLimiter, createLimiterRegistry, } from "./concurrency-limiter";

describe("ConcurrencyLimiter", () => {
  test("constructor rejects non-positive max", () => {
    expect(() => new ConcurrencyLimiter({ max: 0, },)).toThrow(RangeError,);
    expect(() => new ConcurrencyLimiter({ max: -1, },)).toThrow(RangeError,);
    expect(() => new ConcurrencyLimiter({ max: 1.5, },)).toThrow(RangeError,);
  });

  test("acquire returns a release function", async () => {
    const lim = new ConcurrencyLimiter({ max: 2, },);
    expect(lim.inUse,).toBe(0,);
    const r1 = await lim.acquire();
    expect(lim.inUse,).toBe(1,);
    r1();
    expect(lim.inUse,).toBe(0,);
  });

  test("max concurrent holders is enforced", async () => {
    const lim = new ConcurrencyLimiter({ max: 2, },);
    const r1 = await lim.acquire();
    const r2 = await lim.acquire();
    expect(lim.inUse,).toBe(2,);

    let third = false;
    const p = lim.acquire().then((r3,) => {
      third = true;
      r3();
    },);

    // Yield a few microtasks; third must still be waiting.
    await Promise.resolve();
    await Promise.resolve();
    expect(third,).toBe(false,);
    expect(lim.pending,).toBe(1,);

    r1();
    await p;
    expect(third,).toBe(true,);
    r2();
  });

  test("run releases the slot on success and on throw", async () => {
    const lim = new ConcurrencyLimiter({ max: 1, },);
    const ok = await lim.run(async () => 7);
    expect(ok,).toBe(7,);
    expect(lim.inUse,).toBe(0,);

    await expect(lim.run(async () => {
      throw new Error("boom",);
    },),).rejects.toThrow("boom",);
    expect(lim.inUse,).toBe(0,);
  });

  test("FIFO ordering of waiters", async () => {
    const lim = new ConcurrencyLimiter({ max: 1, },);
    const order: number[] = [];
    const r1 = await lim.acquire();
    const pa = lim.acquire().then((r,) => {
      order.push(1,);
      r();
    },);
    const pb = lim.acquire().then((r,) => {
      order.push(2,);
      r();
    },);
    await Promise.resolve();
    r1();
    await Promise.all([pa, pb,],);
    expect(order,).toEqual([1, 2,],);
  });

  test("release is idempotent", async () => {
    const lim = new ConcurrencyLimiter({ max: 1, },);
    const r = await lim.acquire();
    r();
    r();
    r();
    expect(lim.inUse,).toBe(0,);
  });
});

describe("createLimiterRegistry", () => {
  test("returns the same limiter for repeated keys", () => {
    const reg = createLimiterRegistry();
    const a1 = reg.get("openai", 3,);
    const a2 = reg.get("openai", 3,);
    expect(a1,).toBe(a2,);
    expect(reg.size,).toBe(1,);
  });

  test("drop removes the limiter", () => {
    const reg = createLimiterRegistry();
    reg.get("x", 2,);
    expect(reg.size,).toBe(1,);
    reg.drop("x",);
    expect(reg.size,).toBe(0,);
  });

  test("mismatch on existing key throws", () => {
    const reg = createLimiterRegistry();
    reg.get("openai", 3,);
    expect(() => reg.get("openai", 4,)).toThrow(/capacity mismatch/,);
  });
});
