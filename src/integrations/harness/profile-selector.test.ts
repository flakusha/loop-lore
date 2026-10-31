// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * ProfileSelector tests: ordered rules (capability → limits → breaker →
 * cost) and failover rotation. In-memory fakes, injected clocks; each test
 * builds its own selector (parallel-safe).
 */
import { describe, expect, it, } from "bun:test";
import type { AcpProfileConfig, } from "../../config/schema/harness";
import { fakeFactory, } from "./fakes";
import { ProfileBreaker, } from "./profile-breaker";
import { ProfileRegistry, } from "./profile-registry";
import { ProfileSelector, } from "./profile-selector";
import { UsageLedger, } from "./usage-ledger";

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

  it("feeds usage into the ledger from the recorded run", async () => {
    const p = cfg("p", "zai/glm", "zai/flash", { limits: { tokensPerDay: 15, }, },);
    const { selector, factory, } = makeSelector([p,], { p: { models: ["zai/glm", "zai/flash",], }, },);
    await selector.runTurn({ taskType: "mechanical", needsCapabilities: [], }, "hi", factory,);
    const after = await selector.select({ taskType: "mechanical", needsCapabilities: [], },);
    expect(after,).toEqual([],);
  });
});
