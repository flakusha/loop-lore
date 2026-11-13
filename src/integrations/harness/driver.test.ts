// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * HarnessDriver tests against the fake ACP server fixture. Each test owns
 * one fixture and one driver, reaped in afterEach (failure paths included).
 * No ports, no shared state, no sleeps — every await binds to a wire event
 * or the permission hook.
 */
import { afterEach, describe, expect, it, } from "bun:test";
import { HarnessAcpError, } from "./adapter-types";
import { createHarnessDriver, type HarnessDriver, type HarnessDriverOptions, } from "./driver";
import { type FakeAcpEnv, } from "./fake-acp-server";
import { createHarnessFixture, type HarnessFixture, } from "./harness-fixture";

/** Fixtures opened by the current test; released after each. */
const fixtures: HarnessFixture[] = [];
/** Drivers created by the current test; closed after each. */
const drivers: HarnessDriver[] = [];

afterEach(async () => {
  while (drivers.length > 0) { drivers.pop()?.close(); }
  while (fixtures.length > 0) { await fixtures.pop()?.cleanup(); }
},);

/** Open a fixture + driver bound to its fake server, both tracked for teardown. */
async function open(
  server: FakeAcpEnv,
  driverOptions?: Partial<HarnessDriverOptions>,
): Promise<{ driver: HarnessDriver; fixture: HarnessFixture }> {
  const fixture = await createHarnessFixture({ server, },);
  fixtures.push(fixture,);

  const driver = await createHarnessDriver({
    profile: "test",
    command: fixture.server.argv,
    requestTimeoutMs: 5000,
    ...driverOptions,
  },);

  drivers.push(driver,);
  return { driver, fixture, };
}

describe("HarnessDriver.discoverModels", () => {
  it("returns the advertised model ids", async () => {
    const { driver, } = await open({ FAKE_MODELS: "zai/glm,omp/claude", },);
    expect(await driver.discoverModels(),).toEqual(["zai/glm", "omp/claude",],);
  });
});

describe("HarnessDriver.runPrompt", () => {
  it("resolves the collected turn", async () => {
    const { driver, } = await open({ FAKE_REPLY: "hello", FAKE_STOP: "end_turn", },);
    const result = await driver.runPrompt({ prompt: "hi", },);

    expect(result.ok,).toBe(true,);
    if (!result.ok) { return; }
    expect(result.turn.text,).toBe("hello",);
    expect(result.turn.stopReason,).toBe("end_turn",);
    expect(result.turn.usage,).toEqual({ inputTokens: 10, outputTokens: 5, totalTokens: 15, },);
    expect(result.turn.acpSessionId,).toBe("fake-session-1",);
  });

  it("maps a harness failure to an ok:false value with its typed kind", async () => {
    const { driver, } = await open({ FAKE_HANG: "1", }, { requestTimeoutMs: 200, },);
    const result = await driver.runPrompt({ prompt: "hi", },);

    expect(result.ok,).toBe(false,);
    if (result.ok) { return; }
    expect(result.kind,).toBe("initialize",);
    expect(result.message,).toContain("timed out",);
  });
});

describe("HarnessDriver.cancel", () => {
  it("cancels an in-flight turn; the harness answers stopReason cancelled", async () => {
    const { driver, fixture, } = await open({ FAKE_AWAIT_CANCEL: "1", },);

    await driver.discoverModels();
    const pending = driver.runPrompt({ prompt: "long", },);
    await driver.cancel();
    const result = await pending;

    expect(result.ok,).toBe(true,);
    if (!result.ok) { return; }
    expect(result.turn.stopReason,).toBe("cancelled",);
    expect(fixture.server.readLog(),).toEqual([{ event: "cancel", sessionId: "fake-session-1", },],);
  });

  it("rejects with a typed session error when no session is live", async () => {
    const { driver, } = await open({},);
    await expect(driver.cancel(),).rejects.toMatchObject({ name: "HarnessAcpError", kind: "session", },);
  });
});

describe("HarnessDriver.approvePermission", () => {
  it("surfaces the harness ask and delivers the outcome", async () => {
    const asked = Promise.withResolvers<void>();
    const { driver, fixture, } = await open(
      { FAKE_PERMISSION: "1", },
      { onPermissionRequest: () => asked.resolve(), },
    );

    const pending = driver.runPrompt({ prompt: "edit it", },);
    await asked.promise;

    const open_ = driver.pendingPermission();
    expect(open_,).not.toBeNull();
    expect(open_?.kind,).toBe("edit",);

    driver.approvePermission({ outcome: "allow_once", optionId: "allow", },);
    const result = await pending;

    expect(result.ok,).toBe(true,);
    expect(driver.pendingPermission(),).toBeNull();
    expect(fixture.server.readLog(),).toEqual([
      { event: "permission_outcome", outcome: { outcome: { outcome: "allow_once", optionId: "allow", }, }, },
    ],);
  });

  it("throws a typed session error when nothing is pending", async () => {
    const { driver, } = await open({},);
    expect(() => driver.approvePermission({ outcome: "allow_once", },)).toThrow(HarnessAcpError,);
  });
});

describe("HarnessDriver fs/read_text_file", () => {
  it("serves the harness ask through the injected reader", async () => {
    const { driver, fixture, } = await open(
      { FAKE_READ_FILE: "/tmp/notes.md", },
      { readTextFile: (path,) => Promise.resolve(`contents of ${path}`,), },
    );

    const result = await driver.runPrompt({ prompt: "read it", },);

    expect(result.ok,).toBe(true,);
    expect(fixture.server.readLog(),).toEqual([
      { event: "read_text", path: "/tmp/notes.md", content: { content: "contents of /tmp/notes.md", }, },
    ],);
  });
});
