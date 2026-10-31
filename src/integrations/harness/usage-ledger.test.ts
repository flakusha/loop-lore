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
});
