// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * ProfileRegistry probe tests: advertised-model validation (drift degrades
 * the tier), probe failure marks unhealthy, probes are memoized. Pure
 * in-memory fakes — parallel-safe.
 */
import { describe, expect, it, } from "bun:test";
import type { AcpProfileConfig, } from "../../config/schema/harness";
import { fakeFactory, } from "./fakes";
import { ProfileRegistry, } from "./profile-registry";

/** A profile config with both tiers. */
function cfg(name: string, good: string, fast: string,): AcpProfileConfig {
  return {
    name,
    command: ["fake", name,],
    tiers: {
      good: { model: good, capabilities: ["tools", "thinking",], },
      fast: { model: fast, capabilities: ["tools",], },
    },
  };
}

/** Registry over the given specs. */
function registry(
  acp: { enabled: boolean; profiles: AcpProfileConfig[] },
  specs: Parameters<typeof fakeFactory>[0],
): ProfileRegistry {
  const { factory, } = fakeFactory(specs,);
  return new ProfileRegistry({ acp, factory, },);
}

describe("ProfileRegistry", () => {
  it("probes lazily and keeps advertised tiers healthy", async () => {
    const reg = registry(
      { enabled: true, profiles: [cfg("p", "zai/glm", "zai/flash",),], },
      { p: { models: ["zai/glm", "zai/flash",], }, },
    );

    const probe = await reg.ensureProbed("p",);
    expect(probe.state,).toBe("healthy",);
    expect(probe.tiers,).toEqual([
      { tier: "good", model: "zai/glm", advertised: true, },
      { tier: "fast", model: "zai/flash", advertised: true, },
    ],);

    expect(reg.connection("p",),).toBeDefined();
  });

  it("degrades a tier whose model is not advertised (never throws)", async () => {
    const reg = registry(
      { enabled: true, profiles: [cfg("p", "zai/glm", "zai/gone",),], },
      { p: { models: ["zai/glm",], }, },
    );

    const probe = await reg.ensureProbed("p",);
    expect(probe.state,).toBe("healthy",);
    const fast = probe.tiers.find((t,) => t.tier === "fast");
    expect(fast?.advertised,).toBe(false,);
  });

  it("marks a profile unhealthy on spawn failure", async () => {
    const reg = registry(
      { enabled: true, profiles: [cfg("p", "zai/glm", "zai/flash",),], },
      { p: { models: [], failProbe: true, }, },
    );

    const probe = await reg.ensureProbed("p",);
    expect(probe.state,).toBe("unhealthy",);
    expect(probe.error,).toContain("spawn boom",);
    expect(reg.connection("p",),).toBeUndefined();
  });

  it("memoizes probes: second call returns the cached result", async () => {
    const reg = registry(
      { enabled: true, profiles: [cfg("p", "zai/glm", "zai/flash",),], },
      { p: { models: ["zai/glm", "zai/flash",], }, },
    );

    const first = await reg.ensureProbed("p",);
    const second = await reg.ensureProbed("p",);
    expect(second,).toBe(first,);
  });

  it("concurrent probes share one in-flight promise", async () => {
    const reg = registry(
      { enabled: true, profiles: [cfg("p", "zai/glm", "zai/flash",),], },
      { p: { models: ["zai/glm", "zai/flash",], }, },
    );

    const [a, b,] = await Promise.all([reg.ensureProbed("p",), reg.ensureProbed("p",),],);
    expect(b,).toBe(a,);
  });

  it("healthThresholds falls back to defaults", () => {
    const reg = registry(
      { enabled: true, profiles: [cfg("p", "zai/glm", "zai/flash",),], },
      { p: { models: [], }, },
    );

    expect(reg.healthThresholds("p",),).toEqual({ maxConsecutiveFailures: 3, cooldownMs: 300_000, },);
  });

  it("healthThresholds reads profile overrides", () => {
    const profile = cfg("p", "a/b", "a/c",);
    profile.health = { maxConsecutiveFailures: 5, cooldownMs: 1_000, };
    const reg = registry({ enabled: true, profiles: [profile,], }, { p: { models: [], }, },);
    expect(reg.healthThresholds("p",),).toEqual({ maxConsecutiveFailures: 5, cooldownMs: 1_000, },);
  });
});
