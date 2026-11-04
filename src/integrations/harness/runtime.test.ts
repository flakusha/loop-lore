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
import { afterEach, beforeEach, describe, expect, it, } from "bun:test";
import type { AcpProfileConfig, HarnessAcpConfig, } from "../../config/schema/harness";
import type { HarnessAdapterCommandOptions, HarnessAdapterFactory, } from "./adapter-types";
import {
  harnessAdminSettings,
  initHarnessAdminSettings,
  resetHarnessAdminSettings,
} from "./admin-settings";
import { CodexAcpAdapter, } from "./codex";
import { fakeFactory, } from "./fakes";
import { OmpAcpAdapter, } from "./omp";
import { PermissionQueue, } from "./permission-queue";
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

// Parallel-safety: the admin-settings singleton is process-shared and other
// files seed it; every case in THIS file starts from an UNSEEDED store so
// the file-config fallback governs, regardless of cross-file order.
beforeEach(() => {
  resetHarnessAdminSettings();
},);

afterEach(() => {
  resetHarnessAdminSettings();
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

// Resource contract: in-memory fakes + the in-memory admin-settings store
// (reset in afterEach); the runtime singleton is reset by the file-level
// afterEach above. No DB, no subprocess, no ports — parallel-safe.
describe("initHarnessRuntime effective admin settings (BUG 369e695)", () => {
  it("a runtime composed from an enabled file config stops selecting when the store override flips off", async () => {
    const p: AcpProfileConfig = {
      name: "p",
      command: ["fake", "p",],
      tiers: { fast: { model: "p/fast", capabilities: ["tools",], }, },
      tosGrayzoneAcknowledged: true,
    };

    initHarnessAdminSettings({ enabled: true, profiles: [p,], },);
    fakeFactory({ p: { models: ["p/fast",], }, },);
    initHarnessRuntime({ enabled: true, profiles: [p,], },);
    harnessAdminSettings.update({ enabled: false, },);

    const runtime = getHarnessRuntime();
    expect(runtime,).not.toBeNull();
    const picks = await runtime?.selector.select({ taskType: "mechanical", needsCapabilities: [], },);
    expect(picks,).toEqual([],);
  });
});

// Permission queue wiring (TASK-permission-approval-flow).
// Resource contract: in-memory fakes + the in-memory admin-settings store
// (reset by the file-level hooks above); the runtime singleton is likewise
// reset there. No DB, no subprocess, no ports — parallel-safe.
describe("runtime permission queue (TASK-permission-approval-flow)", () => {
  const profile: AcpProfileConfig = {
    name: "p",
    command: ["fake", "p",],
    tiers: { fast: { model: "p/fast", capabilities: ["tools",], }, },
    tosGrayzoneAcknowledged: true,
  };

  it("composes the permission queue on the runtime", () => {
    const { factory, } = fakeFactory({},);
    const runtime = createHarnessRuntime({ acp: { enabled: true, profiles: [profile,], }, factory, },);

    expect(runtime.permissions,).toBeInstanceOf(PermissionQueue,);
  });

  it("resolves a decision through the profile's registry connection", async () => {
    const { factory, logs, } = fakeFactory({ p: { models: ["p/fast",], }, },);
    const runtime = createHarnessRuntime({ acp: { enabled: true, profiles: [profile,], }, factory, },);
    await runtime.registry.ensureProbed("p",);

    const parked = await runtime.permissions.submit({
      profile: "p",
      pending: { params: { sessionId: "s", kind: "edit", }, kind: "edit", },
      sandboxRoot: process.cwd(),
    },);

    if (parked.decision !== "pending") { throw new Error("expected the edit ask to park",); }

    expect(runtime.permissions.resolve({ id: parked.id, decision: "approve", },),).toEqual({ ok: true, },);
    expect(logs.get("p",)?.permissions,).toEqual([{ outcome: "allow_once", },],);
  });

  it("the composed factory reports adapter asks into the queue and withdrawals out", async () => {
    let captured: HarnessAdapterCommandOptions | undefined;
    const { factory: base, } = fakeFactory({ p: { models: ["p/fast",], }, },);
    const factory: HarnessAdapterFactory = (name, command, options,) => {
      captured = options;
      return base(name, command,);
    };

    const runtime = createHarnessRuntime({ acp: { enabled: true, profiles: [profile,], }, factory, },);
    await runtime.registry.ensureProbed("p",);

    expect(captured?.onPermissionRequest,).toBeTypeOf("function",);
    expect(captured?.onPermissionWithdrawn,).toBeTypeOf("function",);

    captured?.onPermissionRequest?.({ params: { sessionId: "s", kind: "edit", }, kind: "edit", },);
    await runtime.permissions.idle();
    expect(runtime.permissions.pendingCount(),).toBe(1,);

    captured?.onPermissionWithdrawn?.();
    expect(runtime.permissions.pendingCount(),).toBe(0,);
  });

  it("a disabled config composes no queue — the flow is inert", () => {
    initHarnessRuntime({ enabled: false, profiles: [], },);
    expect(getHarnessRuntime(),).toBeNull();
  });
});
