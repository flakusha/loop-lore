// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Cost-aware autoroute: the selector prices the DISCOVERED candidates — the
 * models each harness advertised — and breaks a tie by cost.
 *
 * Resource contract: in-memory fakes only — no DB, no ports, no subprocess,
 * no fixed paths, no shared fixtures. The provider registry is
 * process-global, so every case registers its own uniquely-named providers
 * and unregisters them in afterEach; the admin-settings singleton is reset
 * before and after every case, so the file-config fallback governs whatever
 * order the cases run in. Every case is order-independent and parallel-safe.
 */
import { afterEach, beforeEach, describe, expect, it, } from "bun:test";
import type { AcpProfileConfig, } from "../../config/schema/harness";
import { registerProvider, unregisterProvider, } from "../../generation/providers/registry";
import type { LLMProvider, } from "../../generation/providers/types";
import { resetHarnessAdminSettings, } from "./admin-settings";
import { type FakeAdapterSpec, fakeFactory, } from "./fakes";
import { ProfileBreaker, } from "./profile-breaker";
import { ProfileRegistry, } from "./profile-registry";
import { ProfileSelector, } from "./profile-selector";
import { UsageLedger, } from "./usage-ledger";

/** Provider names unique to this file: the registry is process-global. */
const CHEAP = "autoroute-cheap";
const PRICEY = "autoroute-pricey";
const UNPRICED = "autoroute-unpriced";

/** Register a provider publishing a price (USD per 1k tokens). */
function registerPriced(name: string, costPer1kTokens: number,): void {
  registerProvider(name, {
    capabilities: { label: name, costPer1kTokens, },
  } as unknown as LLMProvider,);
}

/** One profile whose tiers both run the same model. */
function cfg(name: string, model: string,): AcpProfileConfig {
  return {
    name,
    command: ["fake", name,],
    tiers: {
      good: { model, capabilities: ["tools", "thinking",], },
      fast: { model, capabilities: ["tools",], },
    },
    tosGrayzoneAcknowledged: true,
  };
}

/** A selector over the profiles, each harness advertising its models. */
function makeSelector(
  profiles: AcpProfileConfig[],
  specs: Record<string, FakeAdapterSpec>,
): ProfileSelector {
  const { factory, } = fakeFactory(specs,);
  const registry = new ProfileRegistry({ acp: { enabled: true, profiles, }, factory, },);
  return new ProfileSelector({
    registry,
    ledger: new UsageLedger(),
    breaker: new ProfileBreaker(registry.healthThresholds.bind(registry,),),
  },);
}

beforeEach(() => {
  resetHarnessAdminSettings();
},);

afterEach(() => {
  resetHarnessAdminSettings();
  unregisterProvider(CHEAP,);
  unregisterProvider(PRICEY,);
  unregisterProvider(UNPRICED,);
},);

describe("cost-aware autoroute", () => {
  it("prices the discovered candidates and picks the cheaper one", async () => {
    registerPriced(CHEAP, 0.5,);
    registerPriced(PRICEY, 2,);
    const cheap = cfg("cheap", `${CHEAP}/model`,);
    const pricey = cfg("pricey", `${PRICEY}/model`,);
    // Config order is the failover order: without a price the pricey profile
    // would come first.
    const selector = makeSelector([pricey, cheap,], {
      pricey: { models: [`${PRICEY}/model`,], },
      cheap: { models: [`${CHEAP}/model`,], },
    },);

    const picks = await selector.select({ taskType: "mechanical", needsCapabilities: ["tools",], },);
    expect(picks.map((c,) => c.profile),).toEqual(["cheap", "pricey",],);
  });

  it("ranks a candidate whose provider publishes no price last", async () => {
    registerPriced(CHEAP, 0.5,);
    const priced = cfg("priced", `${CHEAP}/model`,);
    const unpriced = cfg("unpriced", `${UNPRICED}/model`,);
    const selector = makeSelector([unpriced, priced,], {
      unpriced: { models: [`${UNPRICED}/model`,], },
      priced: { models: [`${CHEAP}/model`,], },
    },);

    const picks = await selector.select({ taskType: "mechanical", needsCapabilities: ["tools",], },);
    expect(picks.map((c,) => c.profile),).toEqual(["priced", "unpriced",],);
  });

  it("keeps the failover order when no provider publishes a price", async () => {
    const a = cfg("a", "autoroute-none-a/model",);
    const b = cfg("b", "autoroute-none-b/model",);
    const selector = makeSelector([a, b,], {
      a: { models: ["autoroute-none-a/model",], },
      b: { models: ["autoroute-none-b/model",], },
    },);

    const picks = await selector.select({ taskType: "mechanical", needsCapabilities: ["tools",], },);
    expect(picks.map((c,) => c.profile),).toEqual(["a", "b",],);
  });

  it("admits no candidate when the harness advertised nothing", async () => {
    const a = cfg("a", "autoroute-none-a/model",);
    const selector = makeSelector([a,], { a: { models: [], failProbe: true, }, },);

    const picks = await selector.select({ taskType: "mechanical", needsCapabilities: ["tools",], },);
    expect(picks,).toEqual([],);
  });
});
