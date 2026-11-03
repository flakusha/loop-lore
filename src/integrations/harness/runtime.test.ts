// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Composition-root tests (TASK-acp-composition-root-wiring): the factory
 * builds the four pieces ONCE and they share instances (the selector runs
 * over THE runtime registry/ledger/breaker), the boot singleton hands out
 * the same composed instance, a disabled config composes nothing, and the
 * production factory dispatches each profile's own flavor. Pure in-memory
 * fakes — no subprocess, parallel-safe.
 */
import { afterEach, describe, expect, it, } from "bun:test";
import type { AcpProfileConfig, HarnessAcpConfig, } from "../../config/schema/harness";
import { CodexAcpAdapter, } from "./codex";
import { fakeFactory, } from "./fakes";
import { OmpAcpAdapter, } from "./omp";
import { ProfileBreaker, } from "./profile-breaker";
import { ProfileRegistry, } from "./profile-registry";
import { ProfileSelector, } from "./profile-selector";
import {
  createHarnessRuntime,
  getHarnessRuntime,
  harnessAdapterFactoryFor,
  initHarnessRuntime,
  resetHarnessRuntime,
} from "./runtime";
import { UsageLedger, } from "./usage-ledger";

afterEach(() => {
  resetHarnessRuntime();
},);

describe("createHarnessRuntime", () => {
  it("composes the four pieces sharing instances", () => {
    const acp: HarnessAcpConfig = {
      enabled: true,
      profiles: [{ name: "p", command: ["fake", "p",], tiers: {}, },],
    };

    const { factory, } = fakeFactory({},);
    const runtime = createHarnessRuntime({ acp, factory, },);

    expect(runtime.acp,).toBe(acp,);
    expect(runtime.registry,).toBeInstanceOf(ProfileRegistry,);
    expect(runtime.selector,).toBeInstanceOf(ProfileSelector,);
    expect(runtime.ledger,).toBeInstanceOf(UsageLedger,);
    expect(runtime.breaker,).toBeInstanceOf(ProfileBreaker,);
  });

  it("wires the selector to the runtime's own registry, ledger and breaker", async () => {
    const acp: HarnessAcpConfig = {
      enabled: true,
      profiles: [{
        name: "p",
        command: ["fake", "p",],
        tiers: { fast: { model: "zai/flash", capabilities: ["tools",], }, },
        tosGrayzoneAcknowledged: true,
      },],
    };

    const { factory, } = fakeFactory({ p: { models: ["zai/flash",], reply: "ok", }, },);
    const runtime = createHarnessRuntime({ acp, factory, },);

    const turn = await runtime.selector.runTurn(
      { taskType: "chat", needsCapabilities: ["tools",], },
      "hi",
      factory,
    );

    expect(turn.profile,).toBe("p",);
    expect(turn.tier,).toBe("fast",);
    expect(turn.model,).toBe("zai/flash",);
    // The dispatch was recorded in THE runtime's ledger (a fresh ledger
    // would not know the event): the rpm window is spent at one dispatch.
    expect(runtime.ledger.check("p", { rpm: 1, },).allowed,).toBe(false,);
    expect(runtime.ledger.check("p", { rpm: 2, },).allowed,).toBe(true,);
    // And the breaker closed again on the successful turn.
    expect(runtime.breaker.allow("p",),).toBe(true,);
  });

  it("resolves each profile's own flavor through the production factory", () => {
    const acp: HarnessAcpConfig = {
      enabled: true,
      profiles: [
        { name: "omp-main", command: ["omp",], tiers: {}, },
        { name: "codex-sub", command: ["codex",], tiers: {}, harness: "codex", },
      ],
    };

    const factory = harnessAdapterFactoryFor(acp,);

    expect(factory("omp-main", ["omp",],),).toBeInstanceOf(OmpAcpAdapter,);
    expect(factory("codex-sub", ["codex",],),).toBeInstanceOf(CodexAcpAdapter,);
    // A CONFIGURED flavor with no shipped adapter is the guarded case.
    const unknownFlavor = {
      name: "bedrock-p",
      command: ["x",],
      tiers: {},
      harness: "bedrock",
    } as unknown as AcpProfileConfig;

    expect(
      () => harnessAdapterFactoryFor({ enabled: true, profiles: [unknownFlavor,], },)("bedrock-p", ["x",],),
    ).toThrow(/no ACP adapter factory/,);
  });

  it("throws when invoked with a profile name absent from the config", () => {
    const acp: HarnessAcpConfig = {
      enabled: true,
      profiles: [{ name: "omp-main", command: ["omp",], tiers: {}, },],
    };

    expect(
      () => harnessAdapterFactoryFor(acp,)("ghost", ["omp",],),
    ).toThrow('no harness profile named "ghost" — adapter factory cannot resolve its flavor',);
  });
});

describe("initHarnessRuntime", () => {
  it("composes once: repeated getters hand out the same instance", () => {
    const acp: HarnessAcpConfig = {
      enabled: true,
      profiles: [{ name: "p", command: ["fake", "p",], tiers: {}, },],
    };

    initHarnessRuntime(acp,);

    const first = getHarnessRuntime();
    expect(first,).toBeDefined();
    expect(getHarnessRuntime(),).toBe(first,);
    expect(first?.acp,).toBe(acp,);

    // A later init replaces the composition (boot calls init exactly once).
    initHarnessRuntime(acp,);
    expect(getHarnessRuntime(),).not.toBe(first,);
  });

  it("a disabled config composes nothing", () => {
    initHarnessRuntime({ enabled: false, profiles: [], },);
    expect(getHarnessRuntime(),).toBeNull();
  });
});
