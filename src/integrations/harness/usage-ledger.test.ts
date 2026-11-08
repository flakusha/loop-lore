// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * UsageLedger tests. Clock is injected — windows are driven by advancing a
 * fake timestamp; no sleeps, no shared state (parallel-safe).
 */
import { describe, expect, it, } from "bun:test";
import { type LedgerClock, UsageLedger, } from "./usage-ledger";

/** Mutable fake clock: returns the current step, advanced by tests. */
function fakeClock(): { now: () => number; advance: (ms: number,) => void } {
  let t = 1_000_000;
  const clock: LedgerClock = () => t;
  return {
    now: clock,
    advance: (ms: number,) => {
      t += ms;
    },
  };
}

describe("UsageLedger", () => {
  it("allows unlimited profiles unconditionally", () => {
    const { now, } = fakeClock();
    const ledger = new UsageLedger(now,);
    ledger.record("p", 1000,);
    expect(ledger.check("p", undefined,).allowed,).toBe(true,);
  });

  it("blocks when the rpm window is full and reports the retry time", () => {
    const { now, advance, } = fakeClock();
    const ledger = new UsageLedger(now,);
    for (let i = 0; i < 3; i++) { ledger.record("p", 0,); }
    const verdict = ledger.check("p", { rpm: 3, },);
    expect(verdict.allowed,).toBe(false,);
    if (!verdict.allowed) {
      expect(verdict.reason,).toBe("rpm",);
      expect(verdict.retryAtMs,).toBe(1_000_000 + 60_000,);
    }

    advance(60_001,);
    expect(ledger.check("p", { rpm: 3, },).allowed,).toBe(true,);
  });

  it("blocks when tokensPerDay is exhausted and unblocks after a day", () => {
    const { now, advance, } = fakeClock();
    const ledger = new UsageLedger(now,);
    ledger.record("p", 500,);
    ledger.record("p", 500,);
    const verdict = ledger.check("p", { tokensPerDay: 1000, },);
    expect(verdict.allowed,).toBe(false,);
    if (!verdict.allowed) { expect(verdict.reason,).toBe("tokensPerDay",); }
    advance(86_400_001,);
    expect(ledger.check("p", { tokensPerDay: 1000, },).allowed,).toBe(true,);
  });

  it("honors exhausted quota reports and their reset time", () => {
    const { now, advance, } = fakeClock();
    const ledger = new UsageLedger(now,);
    ledger.applyUsageReports("p", [
      {
        providerId: "zai",
        status: "exhausted",
        remainingFraction: 0,
        resetsAt: new Date(1_000_000 + 30_000,).toISOString(),
      },
    ],);

    const verdict = ledger.check("p", undefined,);
    expect(verdict.allowed,).toBe(false,);
    if (!verdict.allowed) { expect(verdict.reason,).toBe("quota",); }
    advance(30_001,);
    expect(ledger.check("p", undefined,).allowed,).toBe(true,);
  });

  it("ignores non-exhausted reports and null report sets", () => {
    const { now, } = fakeClock();
    const ledger = new UsageLedger(now,);
    ledger.applyUsageReports("p", null,);
    ledger.applyUsageReports("p", [{ providerId: "zai", status: "ok", remainingFraction: 0.9, resetsAt: null, },],);
    expect(ledger.check("p", undefined,).allowed,).toBe(true,);
  });

  it("profiles are isolated (instance-owned state)", () => {
    const { now, } = fakeClock();
    const ledger = new UsageLedger(now,);
    ledger.record("a", 10_000,);
    expect(ledger.check("b", { tokensPerDay: 100, },).allowed,).toBe(true,);
    expect(ledger.check("a", { tokensPerDay: 100, },).allowed,).toBe(false,);
  });

  describe("snapshot", () => {
    it("reports one entry per known profile with the windowed counters", () => {
      const { now, } = fakeClock();
      const ledger = new UsageLedger(now,);
      ledger.record("a", 100,);
      ledger.record("a", 50,);
      ledger.record("b", 10,);

      expect(ledger.snapshot(),).toEqual([
        { profile: "a", dispatchesInWindow: 2, tokensInDay: 150, quotaResetAt: null, },
        { profile: "b", dispatchesInWindow: 1, tokensInDay: 10, quotaResetAt: null, },
      ],);
    });

    it("drops dispatches that left the rpm window and tokens that left the day window", () => {
      const { now, advance, } = fakeClock();
      const ledger = new UsageLedger(now,);
      ledger.record("a", 100,);
      advance(60_001,);
      ledger.record("a", 7,);
      // The day window still holds both token events.
      expect(ledger.snapshot()[0]?.dispatchesInWindow,).toBe(1,);
      expect(ledger.snapshot()[0]?.tokensInDay,).toBe(107,);

      advance(86_400_001,);
      expect(ledger.snapshot()[0]?.dispatchesInWindow,).toBe(0,);
      expect(ledger.snapshot()[0]?.tokensInDay,).toBe(0,);
    });

    it("creates no entry for an unknown profile", () => {
      const { now, } = fakeClock();
      const ledger = new UsageLedger(now,);
      expect(ledger.snapshot(),).toEqual([],);
    });

    it("does not mutate state: check() still sees the same usage afterwards", () => {
      const { now, } = fakeClock();
      const ledger = new UsageLedger(now,);
      ledger.record("a", 100,);
      for (let i = 0; i < 2; i++) { ledger.snapshot(); }

      // The rpm limit of 3 is not reached by one dispatch, and the token limit
      // is still exactly exhausted — the snapshot consumed nothing.
      expect(ledger.check("a", { rpm: 3, },).allowed,).toBe(true,);
      expect(ledger.check("a", { tokensPerDay: 100, },).allowed,).toBe(false,);
    });

    it("reports the reported quota reset without clearing it", () => {
      const { now, advance, } = fakeClock();
      const ledger = new UsageLedger(now,);
      ledger.applyUsageReports("a", [
        {
          providerId: "zai",
          status: "exhausted",
          remainingFraction: 0,
          resetsAt: new Date(1_000_000 + 30_000,).toISOString(),
        },
      ],);

      expect(ledger.snapshot()[0]?.quotaResetAt,).toBe(1_000_000 + 30_000,);
      advance(30_001,);
      // The snapshot is read-only: it leaves the expiry to check().
      expect(ledger.snapshot()[0]?.quotaResetAt,).toBe(1_000_000 + 30_000,);
      expect(ledger.check("a", undefined,).allowed,).toBe(true,);
      expect(ledger.snapshot()[0]?.quotaResetAt,).toBeNull();
    });
  });
});
