/**
 * E2E: env-gated external-harness ACP scenario (TASK-e2e-env-gated-scenario).
 *
 * Drives the landed ACP harness surface end-to-end against the fake ACP
 * server fixture: the isolation gate decides, the driver spawns the fake
 * harness over stdio JSON-RPC, and the wire is observed through the
 * fixture's reaction log. Every test owns its fixture and driver, reaped
 * in afterEach — no shared ports, paths, or module state.
 *
 * Gated behind HARNESSE2E=1: without the marker the whole file skips
 * loudly and never touches a subprocess, so plain check runs stay green.
 */

import { afterEach, describe, expect, it, } from "bun:test";
import { type HarnessConfig, } from "../../../src/config/schema/harness";
import {
  createHarnessDriver,
  type HarnessDriver,
  type HarnessDriverOptions,
} from "../../../src/integrations/harness/driver";
import {
  type FakeAcpEnv,
} from "../../../src/integrations/harness/fake-acp-server";
import {
  createHarnessFixture,
  type HarnessFixture,
} from "../../../src/integrations/harness/harness-fixture";
import {
  assertHarnessExecution,
} from "../../../src/integrations/harness/isolation-gate";

const ENABLED = process.env.HARNESSE2E === "1";

if (!ENABLED) {
  console.warn(
    "[harness-acp-e2e] SKIPPING — external-harness ACP scenario is env-gated; set HARNESSE2E=1 to run it",
  );
}

const describeGated = ENABLED ? describe : describe.skip;

/** Fixtures opened by the current test; released after each. */
const fixtures: HarnessFixture[] = [];
/** Drivers created by the current test; closed after each. */
const drivers: HarnessDriver[] = [];

afterEach(async () => {
  while (drivers.length > 0) { drivers.pop()?.close(); }
  while (fixtures.length > 0) { await fixtures.pop()?.cleanup(); }
},);

/** Open a fixture + driver bound to its fake server, tracked for teardown. */
async function open(
  server: FakeAcpEnv,
  driverOptions?: Partial<HarnessDriverOptions>,
): Promise<{ driver: HarnessDriver; fixture: HarnessFixture }> {
  const fixture = await createHarnessFixture({ server, },);
  fixtures.push(fixture,);

  const driver = await createHarnessDriver({
    profile: "fake-acp",
    command: fixture.server.argv,
    requestTimeoutMs: 5000,
    ...driverOptions,
  },);

  drivers.push(driver,);

  return { driver, fixture, };
}

/** A harness config admitting exactly the "fake-acp" profile by name. */
function harnessConfig(enabled: boolean,): HarnessConfig {
  return {
    acp: {
      enabled,
      profiles: [{
        name: "fake-acp",
        command: [],
        tiers: { good: { model: "zai/glm", capabilities: ["tools",], }, },
      },],
    },
  };
}

describeGated("Harness ACP e2e scenario", () => {
  it("denies execution at the isolation gate before any spawn", () => {
    expect(assertHarnessExecution({
      config: harnessConfig(false,),
      role: "admin",
      userId: "usr_1",
      profileName: "fake-acp",
    },),).toMatchObject({ allowed: false, code: "harness_disabled", },);

    expect(assertHarnessExecution({
      config: harnessConfig(true,),
      role: "user",
      userId: "usr_2",
      profileName: "fake-acp",
    },),).toMatchObject({ allowed: false, code: "role_denied", },);

    expect(assertHarnessExecution({
      config: harnessConfig(true,),
      role: "admin",
      userId: "usr_1",
      profileName: "no-such-profile",
    },),).toMatchObject({ allowed: false, code: "profile_unknown", },);
  });

  it("admits an admin, then discovers models and runs a prompt turn", async () => {
    const verdict = assertHarnessExecution({
      config: harnessConfig(true,),
      role: "admin",
      userId: "usr_1",
      profileName: "fake-acp",
    },);

    expect(verdict,).toMatchObject({ allowed: true, userId: "usr_1", },);
    if (!verdict.allowed) { return; }

    const { driver, } = await open({
      FAKE_MODELS: "zai/glm,omp/claude",
      FAKE_REPLY: "e2e hello",
      FAKE_STOP: "end_turn",
    },);

    expect(await driver.discoverModels(),).toEqual(["zai/glm", "omp/claude",],);

    const result = await driver.runPrompt({ prompt: "say hi", },);
    expect(result.ok,).toBe(true,);
    if (!result.ok) { return; }
    expect(result.turn.text,).toBe("e2e hello",);
    expect(result.turn.stopReason,).toBe("end_turn",);
    expect(result.turn.acpSessionId,).toBe("fake-session-1",);
  });

  it("approves a server-originated permission request mid-turn", async () => {
    const asked = Promise.withResolvers<void>();
    const { driver, fixture, } = await open(
      { FAKE_PERMISSION: "1", },
      { onPermissionRequest: () => asked.resolve(), },
    );

    const pending = driver.runPrompt({ prompt: "edit it", },);
    await asked.promise;

    expect(driver.pendingPermission(),).toMatchObject({ kind: "edit", },);
    driver.approvePermission({ outcome: "allow_once", optionId: "allow", },);
    const result = await pending;

    expect(result.ok,).toBe(true,);
    expect(fixture.server.readLog(),).toEqual([
      { event: "permission_outcome", outcome: { outcome: { outcome: "allow_once", optionId: "allow", }, }, },
    ],);
  });

  it("cancels an in-flight turn and the harness logs the cancel", async () => {
    const { driver, fixture, } = await open({ FAKE_AWAIT_CANCEL: "1", },);

    await driver.discoverModels();
    const pending = driver.runPrompt({ prompt: "long", },);
    await driver.cancel();
    const result = await pending;

    expect(result.ok,).toBe(true,);
    if (!result.ok) { return; }
    expect(result.turn.stopReason,).toBe("cancelled",);
    expect(fixture.server.readLog(),).toEqual([
      { event: "cancel", sessionId: "fake-session-1", },
    ],);
  });

  it("maps a hung harness to a typed ok:false failure", async () => {
    const { driver, } = await open({ FAKE_HANG: "1", }, { requestTimeoutMs: 200, },);

    const result = await driver.runPrompt({ prompt: "hi", },);
    expect(result.ok,).toBe(false,);
    if (result.ok) { return; }
    expect(result.kind,).toBe("initialize",);
    expect(result.message,).toContain("timed out",);
  });
},);
