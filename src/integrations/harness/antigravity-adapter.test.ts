// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * AntigravityAcpAdapter integration tests against the fake ACP server fixture
 * (`model` select id, `provider/id` wire values passed through verbatim).
 *
 * Resource contract: per test, BOTH child processes are hard-killed in the
 * afterEach teardown (including failure paths): the fake-ACP fixture
 * subprocess AND the adapter's client subprocess. No real agy, no
 * env-gated e2e, no shared ports/paths — parallel-safe.
 */
import { afterEach, describe, expect, it, } from "bun:test";
import { AntigravityAcpAdapter, createAntigravityAdapter, } from "./antigravity";
import { type FakeAcpServer, startFakeAcp, } from "./fake-acp-server";
import { GenericAcpAdapter, } from "./generic-acp";

/** Servers started by the current test; reaped after each. */
const live: FakeAcpServer[] = [];
/** Adapters created by the current test; reaped after each. */
const adapters: AntigravityAcpAdapter[] = [];

/** Start a fixture and register it for teardown. */
function serve(env: Parameters<typeof startFakeAcp>[0],): FakeAcpServer {
  const server = startFakeAcp(env,);
  live.push(server,);
  return server;
}

/** Create an adapter and register it for teardown. */
function makeAdapter(options: ConstructorParameters<typeof AntigravityAcpAdapter>[0],): AntigravityAcpAdapter {
  const adapter = new AntigravityAcpAdapter(options,);
  adapters.push(adapter,);
  return adapter;
}

afterEach(async () => {
  while (adapters.length > 0) {
    const adapter = adapters.pop()!;
    try {
      await adapter.close();
    } catch {
      // Already-closed or failing teardown must not skip remaining reaps.
    }
  }

  while (live.length > 0) {
    live.pop()?.stop();
  }
},);

describe("AntigravityAcpAdapter (fake ACP fixture, antigravity flavor)", () => {
  it("passes provider/id wire values through verbatim", async () => {
    const server = serve({ FAKE_CONFIG_ID: "model", FAKE_MODELS: "google/gemini-2.5-pro,google/gemini-2.5-flash", },);
    const adapter = makeAdapter({ command: server.argv, },);
    const got = await adapter.enumerateModels();
    expect(got,).toEqual(["google/gemini-2.5-pro", "google/gemini-2.5-flash",],);
    adapter.close();
  });

  it("switches model via session/set_config_option", async () => {
    const server = serve({ FAKE_CONFIG_ID: "model", FAKE_MODELS: "google/gemini-2.5-flash", },);
    const adapter = makeAdapter({ command: server.argv, },);
    await expect(adapter.setModel("google/gemini-2.5-flash",),).resolves.toBeUndefined();
    adapter.close();
  });

  it("is a GenericAcpAdapter created by the flavor factory", async () => {
    const server = serve({ FAKE_CONFIG_ID: "model", FAKE_MODELS: "google/gemini-2.5-flash", },);
    const adapter = createAntigravityAdapter("ag", server.argv,);
    expect(adapter,).toBeInstanceOf(GenericAcpAdapter,);
    expect(adapter,).toBeInstanceOf(AntigravityAcpAdapter,);
    await adapter.close();
  });
});
