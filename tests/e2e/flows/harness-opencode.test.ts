// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * E2E: OpenCode ACP flavor through the driver. Tier 1 uses the fake ACP
 * server (no binary, no creds, no network). Tier 2 is opt-in via
 * OPENCODE_E2E_LIVE=1 and runs ONE prompt turn against the real `opencode
 * acp` on PATH, pinned to a free model through OPENCODE_CONFIG so the live
 * tier cannot spend a paid call. Override with OPENCODE_E2E_MODEL if the
 * free id rotates; the model must still be advertised by `opencode acp`.
 * Every test owns its fixture/driver/temp dir, reaped in afterEach.
 */

import { afterEach, describe, expect, it, } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
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

/** Fixtures opened by the current test; released after each. */
const fixtures: HarnessFixture[] = [];
/** Drivers created by the current test; closed after each. */
const drivers: HarnessDriver[] = [];
/** Temp dirs holding a live tier's free-model config; removed after each. */
const liveDirs: string[] = [];

afterEach(async () => {
  while (drivers.length > 0) { drivers.pop()?.close(); }
  while (fixtures.length > 0) { await fixtures.pop()?.cleanup(); }
  while (liveDirs.length > 0) {
    const dir = liveDirs.pop();
    if (dir !== undefined) { rmSync(dir, { recursive: true, force: true, },); }
  }
},);

/** Open a fixture + opencode-flavored driver, tracked for teardown. */
async function open(
  server: FakeAcpEnv,
  driverOptions?: Partial<HarnessDriverOptions>,
): Promise<{ driver: HarnessDriver; fixture: HarnessFixture }> {
  const fixture = await createHarnessFixture({ server, },);
  fixtures.push(fixture,);

  const driver = await createHarnessDriver({
    profile: "opencode-e2e",
    command: fixture.server.argv,
    flavor: "opencode",
    requestTimeoutMs: 5000,
    ...driverOptions,
  },);

  drivers.push(driver,);

  return { driver, fixture, };
}

describe("Harness OpenCode e2e flavor", () => {
  it("discovers provider/id models through the model config option", async () => {
    const { driver, } = await open({
      FAKE_CONFIG_ID: "model",
      FAKE_MODELS: "opencode/hy4-flash-free,zai/glm",
    },);

    expect(await driver.discoverModels(),).toEqual([
      "opencode/hy4-flash-free",
      "zai/glm",
    ],);
  });

  it("runs a prompt turn through the opencode flavor", async () => {
    const { driver, } = await open({
      FAKE_CONFIG_ID: "model",
      FAKE_MODELS: "opencode/hy4-flash-free",
      FAKE_REPLY: "opencode e2e hello",
      FAKE_STOP: "end_turn",
    },);

    const result = await driver.runPrompt({ prompt: "say hi", },);
    expect(result.ok,).toBe(true,);
    if (!result.ok) { return; }
    expect(result.turn.text,).toBe("opencode e2e hello",);
    expect(result.turn.stopReason,).toBe("end_turn",);
    expect(result.turn.acpSessionId,).toBe("fake-session-1",);
  });
});

/** Live tier: one free-model prompt turn. Opt-in via OPENCODE_E2E_LIVE=1. */
const describeLive = process.env.OPENCODE_E2E_LIVE === "1" ? describe : describe.skip;

describeLive("Harness OpenCode live (opencode acp on PATH)", () => {
  it("runs a free-model prompt turn against the real binary", async () => {
    const dir = mkdtempSync(join(tmpdir(), "loop-lore-opencode-acp-",),);
    liveDirs.push(dir,);
    const model = process.env.OPENCODE_E2E_MODEL ?? "opencode/hy4-flash-free";
    const configPath = join(dir, "opencode.json",);
    writeFileSync(configPath, `${JSON.stringify({ model, },)}\n`,);

    const previousConfig = process.env.OPENCODE_CONFIG;
    process.env.OPENCODE_CONFIG = configPath;
    let driver: HarnessDriver | undefined;
    try {
      driver = await createHarnessDriver({
        profile: "opencode-live",
        command: ["opencode", "acp",],
        flavor: "opencode",
        cwd: dir,
        requestTimeoutMs: 120_000,
      },);

      drivers.push(driver,);

      const models = await driver.discoverModels();
      expect(models,).toContain(model,);

      const result = await driver.runPrompt({ prompt: "Reply with exactly OK.", },);
      expect(result.ok,).toBe(true,);
      if (!result.ok) { return; }
      expect(result.turn.stopReason,).toBe("end_turn",);
      expect(result.turn.text.toUpperCase(),).toContain("OK",);
    } finally {
      if (previousConfig === undefined) { delete process.env.OPENCODE_CONFIG; }
      else { process.env.OPENCODE_CONFIG = previousConfig; }

      driver?.close();
    }
  }, 180_000,);
},);
