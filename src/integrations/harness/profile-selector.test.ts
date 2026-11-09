// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * ProfileSelector tests: ordered rules (capability → limits → breaker →
 * cost) and failover rotation. In-memory fakes, injected clocks; each test
 * builds its own selector (parallel-safe).
 */
import { afterEach, beforeEach, describe, expect, it, } from "bun:test";
import type { AcpProfileConfig, } from "../../config/schema/harness";
import {
  harnessAdminSettings,
  initHarnessAdminSettings,
  resetHarnessAdminSettings,
} from "./admin-settings";
import { fakeFactory, } from "./fakes";
import { ProfileBreaker, } from "./profile-breaker";
import { ProfileRegistry, } from "./profile-registry";
import { compareCandidateCost, HARNESS_TOS_UNACKNOWLEDGED, ProfileSelector, } from "./profile-selector";
import { UsageLedger, } from "./usage-ledger";

// Parallel-safety: the admin-settings singleton is process-shared and other
// files seed it; every case in THIS file starts from an UNSEEDED store so
// the file-config fallback governs, regardless of cross-file order.
beforeEach(() => {
  resetHarnessAdminSettings();
},);

afterEach(() => {
  resetHarnessAdminSettings();
},);

/** Build a profile config. */
function cfg(
  name: string,
  good: string,
  fast: string,
  extra: Partial<AcpProfileConfig> = {},
): AcpProfileConfig {
  return {
    name,
    command: ["fake", name,],
    tiers: {
      good: { model: good, capabilities: ["tools", "thinking",], },
      fast: { model: fast, capabilities: ["tools",], },
    },
    tosGrayzoneAcknowledged: true,
    ...extra,
  };
}

/** Build a selector over specs with an injectable ledger clock. */
function makeSelector(
  profiles: AcpProfileConfig[],
  specs: Parameters<typeof fakeFactory>[0],
  opts: { clock?: () => number; costs?: Map<string, number> } = {},
): { selector: ProfileSelector; factory: ReturnType<typeof fakeFactory>["factory"] } {
  const { factory, } = fakeFactory(specs,);
  const registry = new ProfileRegistry({ acp: { enabled: true, profiles, }, factory, },);
  const selector = new ProfileSelector(
    {
      registry,
      ledger: new UsageLedger(opts.clock ?? ((): number => 1),),
      breaker: new ProfileBreaker(registry.healthThresholds.bind(registry,), opts.clock ?? ((): number => 1),),
    },
    { costPer1kTokens: opts.costs, },
  );

  return { selector, factory, };
}

describe("ProfileSelector.select", () => {
  it("filters by capability (thinking requires a good tier)", async () => {
    const p = cfg("p", "zai/glm", "zai/flash",);
    const { selector, } = makeSelector([p,], { p: { models: ["zai/glm", "zai/flash",], }, },);
    const thinking = await selector.select({ taskType: "planning", needsCapabilities: ["thinking",], },);
    expect(thinking,).toEqual([{ profile: "p", tier: "good", model: "zai/glm", },],);
    const mechanical = await selector.select({ taskType: "mechanical", needsCapabilities: ["tools",], },);
    expect(mechanical,).toEqual([{ profile: "p", tier: "fast", model: "zai/flash", },],);
  });

  it("taskType maps planning/design/review to good, others to fast", async () => {
    const p = cfg("p", "zai/glm", "zai/flash",);
    const { selector, } = makeSelector([p,], { p: { models: ["zai/glm", "zai/flash",], }, },);
    for (const taskType of ["planning", "design", "review",]) {
      const picks = await selector.select({ taskType, needsCapabilities: [], },);
      expect(picks[0]?.tier,).toBe("good",);
    }

    const other = await selector.select({ taskType: "mechanical", needsCapabilities: [], },);
    expect(other[0]?.tier,).toBe("fast",);
  });

  it("skips profiles degraded by probe drift", async () => {
    const p = cfg("p", "zai/glm", "zai/gone",);
    const { selector, } = makeSelector([p,], { p: { models: ["zai/glm",], }, },);
    const picks = await selector.select({ taskType: "mechanical", needsCapabilities: ["tools",], },);
    expect(picks,).toEqual([],);
  });

  it("skips profiles whose ledger limits are exhausted", async () => {
    let t = 10_000;
    const clock = (): number => t;
    const p = cfg("p", "zai/glm", "zai/flash", { limits: { rpm: 1, }, },);
    const { selector, factory, } = makeSelector([p,], { p: { models: ["zai/glm", "zai/flash",], }, }, { clock, },);
    await selector.runTurn({ taskType: "mechanical", needsCapabilities: [], }, "hi", factory,);
    const second = await selector.select({ taskType: "mechanical", needsCapabilities: [], },);
    expect(second,).toEqual([],);
    t += 60_001;
    const after = await selector.select({ taskType: "mechanical", needsCapabilities: [], },);
    expect(after,).toHaveLength(1,);
  });

  it("skips profiles with an open breaker", async () => {
    let t = 10_000;
    const clock = (): number => t;
    const p = cfg("p", "zai/glm", "zai/flash", { health: { maxConsecutiveFailures: 1, cooldownMs: 5_000, }, },);
    const { selector, } = makeSelector([p,], { p: { models: ["zai/glm", "zai/flash",], failPrompt: "prompt", }, }, {
      clock,
    },);

    await expect(selector.runTurn({ taskType: "mechanical", needsCapabilities: [], }, "hi", fakeFactory({},).factory,),)
      .rejects.toThrow();

    const picks = await selector.select({ taskType: "mechanical", needsCapabilities: [], },);
    expect(picks,).toEqual([],);
    t += 5_001;
    const recovered = await selector.select({ taskType: "mechanical", needsCapabilities: [], },);
    expect(recovered,).toHaveLength(1,);
  });

  it("admits local/api profiles (omp default) without an ack — ungated", async () => {
    const noAck = cfg("no-ack", "d/good", "d/fast", { tosGrayzoneAcknowledged: undefined, },);
    const ok = cfg("ok", "o/good", "o/fast",);
    const { selector, } = makeSelector([noAck, ok,], {
      "no-ack": { models: ["d/good", "d/fast",], },
      ok: { models: ["o/good", "o/fast",], },
    },);

    const picks = await selector.select({ taskType: "mechanical", needsCapabilities: ["tools",], },);
    expect(picks.map((c,) => c.profile),).toEqual(["no-ack", "ok",],);
  });

  it("denies an unacknowledged subscription-backed profile (tos_unacknowledged)", async () => {
    const denied = cfg("denied", "d/good", "d/fast", {
      harness: "codex",
      tosGrayzoneAcknowledged: undefined,
    },);

    const ok = cfg("ok", "o/good", "o/fast",);
    const { selector, } = makeSelector([denied, ok,], {
      denied: { models: ["d/good", "d/fast",], },
      ok: { models: ["o/good", "o/fast",], },
    },);

    const picks = await selector.select({ taskType: "mechanical", needsCapabilities: ["tools",], },);
    expect(picks.map((c,) => c.profile),).toEqual(["ok",],);
  });

  it("deny-by-default: a profile whose flavor has no ToS metadata is gated", async () => {
    const weird = cfg("weird", "w/good", "w/fast", {
      harness: "unknown-flavor" as unknown as AcpProfileConfig["harness"],
      tosGrayzoneAcknowledged: undefined,
    },);

    const { selector, } = makeSelector([weird,], { weird: { models: ["w/good", "w/fast",], }, },);

    const picks = await selector.select({ taskType: "mechanical", needsCapabilities: ["tools",], },);
    expect(picks,).toEqual([],);
  });

  it("runs an acknowledged profile through dispatch unchanged", async () => {
    const p = cfg("p", "zai/glm", "zai/flash",);
    const { selector, factory, } = makeSelector([p,], { p: { models: ["zai/glm", "zai/flash",], }, },);
    const turn = await selector.runTurn({ taskType: "mechanical", needsCapabilities: [], }, "hi", factory,);
    expect(turn.profile,).toBe("p",);
    expect(turn.result.text,).toBe("ok",);
  });

  it("cost tiebreak orders equal-capability candidates cheapest-first", async () => {
    const a = cfg("a", "a/good", "a/cheap",);
    const b = cfg("b", "b/good", "b/pricey",);
    const costs = new Map([["a/cheap", 0.1,], ["b/pricey", 9,],],);
    const { selector, } = makeSelector([a, b,], {
      a: { models: ["a/good", "a/cheap",], },
      b: { models: ["b/good", "b/pricey",], },
    }, { costs, },);

    const picks = await selector.select({ taskType: "mechanical", needsCapabilities: ["tools",], },);
    expect(picks.map((c,) => c.profile),).toEqual(["a", "b",],);
  });
});

describe("ProfileSelector cost tiebreak", () => {
  it("never compares two unknown costs to NaN and ranks an unknown cost last", () => {
    // Two unknown costs used to compare `Infinity - Infinity` = NaN, and the
    // sort spec treats a NaN comparator result as +0: the tiebreak was inert.
    expect(compareCandidateCost(undefined, undefined,),).toBe(0,);
    expect(Number.isNaN(compareCandidateCost(undefined, undefined,),),).toBe(false,);
    expect(compareCandidateCost(1, undefined,),).toBeLessThan(0,);
    expect(compareCandidateCost(undefined, 1,),).toBeGreaterThan(0,);
    expect(compareCandidateCost(1, 2,),).toBeLessThan(0,);
    expect(compareCandidateCost(2, 1,),).toBeGreaterThan(0,);
    expect(compareCandidateCost(1, 1,),).toBe(0,);
  });

  it("a candidate with no known cost ranks last", async () => {
    const a = cfg("a", "a/good", "a/cheap",);
    const b = cfg("b", "b/good", "b/pricey",);
    const costs = new Map([["a/cheap", 0.1,],],);
    const { selector, } = makeSelector([a, b,], {
      a: { models: ["a/good", "a/cheap",], },
      b: { models: ["b/good", "b/pricey",], },
    }, { costs, },);

    const picks = await selector.select({ taskType: "mechanical", needsCapabilities: ["tools",], },);
    expect(picks.map((c,) => c.profile),).toEqual(["a", "b",],);
  });
});

describe("ProfileSelector.runTurn", () => {
  it("rotates to the next candidate on failure and records breaker failures", async () => {
    const a = cfg("a", "a/good", "a/bad",);
    const b = cfg("b", "b/good", "b/works",);
    const specs = {
      a: { models: ["a/good", "a/bad",], failPrompt: "prompt" as const, },
      b: { models: ["b/good", "b/works",], },
    };

    const { selector, factory, } = makeSelector([a, b,], specs,);
    const turn = await selector.runTurn({ taskType: "mechanical", needsCapabilities: [], }, "hi", factory,);
    expect(turn.profile,).toBe("b",);
    expect(turn.model,).toBe("b/works",);
    expect(turn.result.text,).toBe("ok",);
    expect(turn.result.usage?.totalTokens,).toBe(15,);
  });

  it("throws a typed error when no candidates remain", async () => {
    const { selector, } = makeSelector([], {},);
    await expect(
      selector.runTurn({ taskType: "mechanical", needsCapabilities: [], }, "hi", fakeFactory({},).factory,),
    ).rejects.toThrow(/no harness profile satisfies/,);
  });

  it("names tos_unacknowledged when ToS denial emptied the candidate list", async () => {
    const a = cfg("a", "a/good", "a/fast", { harness: "codex", tosGrayzoneAcknowledged: false, },);
    const b = cfg("b", "b/good", "b/fast", {
      harness: "claude-code",
      tosGrayzoneAcknowledged: undefined,
    },);

    const { selector, factory, } = makeSelector([a, b,], {
      a: { models: ["a/good", "a/fast",], },
      b: { models: ["b/good", "b/fast",], },
    },);

    await expect(
      selector.runTurn({ taskType: "mechanical", needsCapabilities: [], }, "hi", factory,),
    ).rejects.toThrow(
      new RegExp(`${HARNESS_TOS_UNACKNOWLEDGED}:a.*${HARNESS_TOS_UNACKNOWLEDGED}:b`, "s",),
    );
  });

  it("feeds usage into the ledger from the recorded run", async () => {
    const p = cfg("p", "zai/glm", "zai/flash", { limits: { tokensPerDay: 15, }, },);
    const { selector, factory, } = makeSelector([p,], { p: { models: ["zai/glm", "zai/flash",], }, },);
    await selector.runTurn({ taskType: "mechanical", needsCapabilities: [], }, "hi", factory,);
    const after = await selector.select({ taskType: "mechanical", needsCapabilities: [], },);
    expect(after,).toEqual([],);
  });
});

// Resource contract: in-memory fakes + the in-memory admin-settings store —
// seeded per case, reset in beforeEach AND afterEach so a failed test can
// never leak store state into siblings (other suites in this file rely on
// the unseeded file-config fallback). No DB, no ports, no fixed paths.
describe("ProfileSelector effective admin settings (BUG 369e695)", () => {
  beforeEach(() => {
    resetHarnessAdminSettings();
  },);

  afterEach(() => {
    resetHarnessAdminSettings();
  },);

  it("a UI-toggled ack enables a subscription-backed profile without a config-file edit", async () => {
    const p = cfg("p", "p/good", "p/fast", { harness: "codex", tosGrayzoneAcknowledged: false, },);
    initHarnessAdminSettings({ enabled: true, profiles: [p,], },);
    const { selector, } = makeSelector([p,], { p: { models: ["p/good", "p/fast",], }, },);

    // Before the toggle: gated.
    const before = await selector.select({ taskType: "mechanical", needsCapabilities: ["tools",], },);
    expect(before,).toEqual([],);

    // The admin save path lands here as an override ack — no config edit.
    harnessAdminSettings.update({ acks: { p: true, }, },);
    const after = await selector.select({ taskType: "mechanical", needsCapabilities: ["tools",], },);
    expect(after,).toEqual([{ profile: "p", tier: "fast", model: "p/fast", },],);
  });

  it("a disabled override suppresses selection even with file enabled: true", async () => {
    const p = cfg("p", "p/good", "p/fast",);
    initHarnessAdminSettings({ enabled: true, profiles: [p,], },);
    harnessAdminSettings.update({ enabled: false, },);
    const { selector, factory, } = makeSelector([p,], { p: { models: ["p/good", "p/fast",], }, },);

    const picks = await selector.select({ taskType: "mechanical", needsCapabilities: ["tools",], },);
    expect(picks,).toEqual([],);
    await expect(
      selector.runTurn({ taskType: "mechanical", needsCapabilities: [], }, "hi", factory,),
    ).rejects.toThrow(/no harness profile satisfies/,);
  });

  it("an enabled override over a file-disabled config enables selection", async () => {
    const p = cfg("p", "p/good", "p/fast",);
    initHarnessAdminSettings({ enabled: false, profiles: [p,], },);
    harnessAdminSettings.update({ enabled: true, },);
    const { selector, } = makeSelector([p,], { p: { models: ["p/good", "p/fast",], }, },);

    const picks = await selector.select({ taskType: "mechanical", needsCapabilities: ["tools",], },);
    expect(picks,).toHaveLength(1,);
  });

  it("no-downgrade: an unseeded store falls back to file-config behavior", async () => {
    // Store deliberately unseeded (reset in beforeEach): the file flag
    // governs, exactly as before the effective view existed.
    const p = cfg("p", "p/good", "p/fast",);
    const { selector, } = makeSelector([p,], { p: { models: ["p/good", "p/fast",], }, },);

    const picks = await selector.select({ taskType: "mechanical", needsCapabilities: ["tools",], },);
    expect(picks,).toHaveLength(1,);
  });

  it("an override ack cannot be revoked below the file flag (OR semantics)", async () => {
    const p = cfg("p", "p/good", "p/fast", { harness: "codex", tosGrayzoneAcknowledged: true, },);
    initHarnessAdminSettings({ enabled: true, profiles: [p,], },);
    harnessAdminSettings.update({ acks: {}, },);
    const { selector, } = makeSelector([p,], { p: { models: ["p/good", "p/fast",], }, },);

    const picks = await selector.select({ taskType: "mechanical", needsCapabilities: ["tools",], },);
    expect(picks,).toHaveLength(1,);
  });
});
