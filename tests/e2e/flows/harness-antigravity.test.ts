// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * E2E: Antigravity ACP flavor through the driver (TASK-antigravity-acp-flavor-plus-byok-hardening-and-provider-docs).
 *
 * The adapter unit suite pins `model`-select discovery and the verbatim
 * provider/id passthrough; `harness-acp.test.ts` pins the driver paths for
 * the default flavor. This file pins the seam between them: the driver
 * resolving `flavor: "antigravity"` and running a full prompt turn against
 * the fake ACP server speaking the Antigravity wire shape (`model` config
 * id, `provider/id` model ids). Tier 1 — no `agy` binary, no creds, no
 * network. Tier 2 (live `agy`, opt-in): with AGY_E2E_LIVE=1, discovery
 * runs once against the real `agy acp` on PATH — ids are asserted as a
 * non-empty string array, never pinned (account-dependent). No prompt turn
 * on the live tier: discovery proves the wire path without spending a call.
 * Every test owns its fixture and driver, reaped in afterEach —
 * no shared ports, paths, or module state.
 */

import { afterEach, describe, expect, it, } from "bun:test";
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

afterEach(async () => {
  while (drivers.length > 0) { drivers.pop()?.close(); }
  while (fixtures.length > 0) { await fixtures.pop()?.cleanup(); }
},);

/** Open a fixture + antigravity-flavored driver, tracked for teardown. */
async function open(
  server: FakeAcpEnv,
  driverOptions?: Partial<HarnessDriverOptions>,
): Promise<{ driver: HarnessDriver; fixture: HarnessFixture }> {
  const fixture = await createHarnessFixture({ server, },);
  fixtures.push(fixture,);

  const driver = await createHarnessDriver({
    profile: "antigravity-e2e",
    command: fixture.server.argv,
    flavor: "antigravity",
    requestTimeoutMs: 5000,
    ...driverOptions,
  },);

  drivers.push(driver,);

  return { driver, fixture, };
}

describe("Harness Antigravity e2e flavor", () => {
  it("discovers provider/id models verbatim through the driver", async () => {
    const { driver, } = await open({
      FAKE_CONFIG_ID: "model",
      FAKE_MODELS: "google/gemini-2.5-pro,google/gemini-2.5-flash",
    },);

    expect(await driver.discoverModels(),).toEqual([
      "google/gemini-2.5-pro",
      "google/gemini-2.5-flash",
    ],);
  });

  it("runs a prompt turn through the antigravity flavor", async () => {
    const { driver, } = await open({
      FAKE_CONFIG_ID: "model",
      FAKE_MODELS: "google/gemini-2.5-flash",
      FAKE_REPLY: "antigravity e2e hello",
      FAKE_STOP: "end_turn",
    },);

    const result = await driver.runPrompt({ prompt: "say hi", },);
    expect(result.ok,).toBe(true,);
    if (!result.ok) { return; }
    expect(result.turn.text,).toBe("antigravity e2e hello",);
    expect(result.turn.stopReason,).toBe("end_turn",);
    expect(result.turn.acpSessionId,).toBe("fake-session-1",);
  });
});

/** Live tier: real `agy acp` discovery. Opt-in via AGY_E2E_LIVE=1, skipped otherwise. */
const describeLive = process.env.AGY_E2E_LIVE === "1" ? describe : describe.skip;

describeLive("Harness Antigravity live (agy acp on PATH)", () => {
  it("discovers models against the real binary", async () => {
    const driver = await createHarnessDriver({
      profile: "antigravity-live",
      command: ["agy", "acp",],
      flavor: "antigravity",
      requestTimeoutMs: 60_000,
    },);

    drivers.push(driver,);

    const models = await driver.discoverModels();
    expect(Array.isArray(models,),).toBe(true,);
    expect(models.length,).toBeGreaterThan(0,);
    for (const model of models) { expect(typeof model,).toBe("string",); }
  });
},);
