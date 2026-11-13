// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * OpenClawAcpAdapter integration tests against the fake ACP server fixture,
 * running an openclaw-flavored config: the bridge publishes NO model surface
 * (docs.openclaw.ai/cli/acp compatibility matrix), so the adapter's listing is
 * empty, the switch is a no-op that never reaches the wire, and there is no
 * quota surface.
 *
 * Resource contract: per test, BOTH child processes are hard-killed in the
 * afterEach teardown (including failure paths): the fake-ACP fixture
 * subprocess AND the adapter's client subprocess. No real openclaw binary,
 * no env-gated e2e, no shared ports/paths — parallel-safe.
 */
import { afterEach, describe, expect, it, } from "bun:test";
import { type FakeAcpEnv, type FakeAcpServer, startFakeAcp, } from "./fake-acp-server";
import { GenericAcpAdapter, } from "./generic-acp";
import { createOpenClawAdapter, OpenClawAcpAdapter, } from "./openclaw";

/** Servers started by the current test; reaped after each. */
const live: FakeAcpServer[] = [];
/** Adapters created by the current test; reaped after each. */
const adapters: OpenClawAcpAdapter[] = [];

/** Start a fixture and register it for teardown. */
function serve(env: FakeAcpEnv,): FakeAcpServer {
  const server = startFakeAcp(env,);
  live.push(server,);
  return server;
}

/** Create an adapter and register it for teardown. */
function makeAdapter(options: ConstructorParameters<typeof OpenClawAcpAdapter>[0],): OpenClawAcpAdapter {
  const adapter = new OpenClawAcpAdapter(options,);
  adapters.push(adapter,);
  return adapter;
}

/** The openclaw wire shape the fixture stands in for: a session without models or config options. */
function bridgeEnv(extra: FakeAcpEnv = {},): FakeAcpEnv {
  return { FAKE_MODELS_FIELD: "1", FAKE_MODELS: "", ...extra, };
}

afterEach(async () => {
  while (adapters.length > 0) {
    adapters.pop()?.close();
  }

  while (live.length > 0) {
    live.pop()?.stop();
  }
},);

describe("OpenClawAcpAdapter (fake ACP fixture, openclaw flavor)", () => {
  it("enumerates an empty model list (no ACP model surface)", async () => {
    const server = serve(bridgeEnv(),);
    const adapter = makeAdapter({ command: server.argv, },);
    expect(await adapter.enumerateModels(),).toEqual([],);
    adapter.close();
  });

  it("setModel is a no-op that resolves without a wire call", async () => {
    // The fixture answers -32601 for unknown methods; a resolution proves the
    // no-op never sent session/set_config_option or any model request.
    const server = serve(bridgeEnv(),);
    const adapter = makeAdapter({ command: server.argv, },);
    await expect(adapter.setModel("gateway/whatever",),).resolves.toBeUndefined();
    adapter.close();
  });

  it("runs a prompt: chunk text, stopReason, usage, session id", async () => {
    const server = serve(bridgeEnv({ FAKE_REPLY: "gateway answer", },),);
    const adapter = makeAdapter({ command: server.argv, },);
    const turn = await adapter.prompt("status check",);
    expect(turn.text,).toBe("gateway answer",);
    expect(turn.stopReason,).toBe("end_turn",);
    expect(turn.usage,).toEqual({ inputTokens: 10, outputTokens: 5, totalTokens: 15, costUsd: null, },);
    expect(turn.acpSessionId,).toBe("fake-session-1",);
    adapter.close();
  });

  it("reports no quota surface (null)", async () => {
    const server = serve(bridgeEnv(),);
    const adapter = makeAdapter({ command: server.argv, },);
    expect(await adapter.fetchUsageReports(),).toBeNull();
    adapter.close();
  });

  it("marks spawn failure typed and memoizes the closed state", async () => {
    const adapter = createOpenClawAdapter("prof", ["definitely-not-a-real-binary-xyz",],) as OpenClawAcpAdapter;
    adapters.push(adapter,);
    await expect(adapter.enumerateModels(),).rejects.toMatchObject({
      name: "HarnessAcpError",
      kind: "spawn",
    },);

    adapter.close();
  });

  it("close is idempotent", () => {
    const server = serve(bridgeEnv(),);
    const adapter = makeAdapter({ command: server.argv, },);
    expect(adapter,).toBeInstanceOf(GenericAcpAdapter,);
    adapter.close();
    adapter.close();
  });
});
