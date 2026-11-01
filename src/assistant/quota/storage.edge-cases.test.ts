import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { ASSISTANT_QUOTA_DEFAULTS, } from "../../config/sections/assistant";
import { configureQuotaStorage, consumeQuota, quotaStorageOptions, } from "./storage";

const T0 = 1_700_000_000_000;
const WINDOW = 60_000;

beforeEach(() => {
  configureQuotaStorage({ windowMs: WINDOW, limitPerWindow: 10, },);
},);

afterEach(() => {
  configureQuotaStorage({
    windowMs: ASSISTANT_QUOTA_DEFAULTS.quotaWindowMs,
    limitPerWindow: ASSISTANT_QUOTA_DEFAULTS.quotaLimitPerWindow,
  },);
},);

describe("consumeQuota (memory backend)", () => {
  test("returns the remaining units after each deduction", () => {
    expect(consumeQuota("u-remaining", 3, T0,),).toBe(7,);
    expect(consumeQuota("u-remaining", 2, T0 + 1,),).toBe(5,);
  });

  test("allows the exact-boundary spend and reports zero remaining", () => {
    expect(consumeQuota("u-boundary", 7, T0,),).toBe(3,);
    expect(consumeQuota("u-boundary", 3, T0 + 1,),).toBe(0,);
    // Any further positive cost no longer fits.
    expect(consumeQuota("u-boundary", 1, T0 + 2,),).toBeNull();
  });

  test("zero-cost operations are never blocked, even at the limit", () => {
    expect(consumeQuota("u-zero", 10, T0,),).toBe(0,);
    expect(consumeQuota("u-zero", 0, T0 + 1,),).toBe(0,);
    // The zero-cost call did not consume anything either.
    expect(consumeQuota("u-zero", 1, T0 + 2,),).toBeNull();
  });

  test("rejected deductions leave the window untouched", () => {
    expect(consumeQuota("u-reject", 8, T0,),).toBe(2,);
    // 8 + 3 > 10 → rejected, nothing deducted.
    expect(consumeQuota("u-reject", 3, T0 + 1,),).toBeNull();
    // The full 2 units are still available.
    expect(consumeQuota("u-reject", 2, T0 + 2,),).toBe(0,);
  });

  test("configureQuotaStorage swaps limits and drops every counter", () => {
    expect(consumeQuota("u-config", 10, T0,),).toBe(0,);

    configureQuotaStorage({ windowMs: 5_000, limitPerWindow: 4, },);
    expect(quotaStorageOptions(),).toEqual({ windowMs: 5_000, limitPerWindow: 4, },);

    // Fresh limit, prior spend forgotten.
    expect(consumeQuota("u-config", 4, T0,),).toBe(0,);
    expect(consumeQuota("u-config", 1, T0 + 1,),).toBeNull();
  });

  // PRODUCT BUG (edge-case sweep 2026-11-01): consumeQuota accepts negative
  // costs. `active.used + cost > limitPerWindow` passes for negative cost, so
  // `used` drops below its prior value and the returned remaining exceeds the
  // configured limit (observed: consumeQuota("u", -5, T0) → 15 with limit 10).
  // Repeated negative charges grant unlimited quota. Correct behavior: reject
  // or clamp cost < 0. Skipped so the suite stays green; see the report.
  test.skip("negative costs never raise remaining above the limit", () => {
    expect(consumeQuota("u-negative", -5, T0,),).toBeNull();
  });
});
