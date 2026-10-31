// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * OpenCodeAcpAdapter integration tests against the fake ACP server fixture,
 * running an opencode-flavored config (`model` select id, `provider/id`
 * option values) — the same suite the omp adapter runs.
 *
 * Resource contract: per test, BOTH child processes are hard-killed in the
 * afterEach teardown (including failure paths): the fake-ACP fixture
 * subprocess AND the adapter's client subprocess. No real opencode, no
 * env-gated e2e, no shared ports/paths — parallel-safe.
 */
import { afterEach, describe, expect, it, } from "bun:test";
import { type FakeAcpServer, startFakeAcp, } from "./fake-acp-server";
import { GenericAcpAdapter, } from "./generic-acp";
import { createOpenCodeAdapter, OpenCodeAcpAdapter, } from "./opencode";

/** Servers started by the current test; reaped after each. */
const live: FakeAcpServer[] = [];
/** Adapters created by the current test; reaped after each. */
const adapters: OpenCodeAcpAdapter[] = [];

/** Start a fixture and register it for teardown. */
function serve(env: Parameters<typeof startFakeAcp>[0],): FakeAcpServer {
  const server = startFakeAcp(env,);
  live.push(server,);
  return server;
}

/** Create an adapter and register it for teardown. */
function makeAdapter(options: ConstructorParameters<typeof OpenCodeAcpAdapter>[0],): OpenCodeAcpAdapter {
  const adapter = new OpenCodeAcpAdapter(options,);
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

describe("OpenCodeAcpAdapter (fake ACP fixture, opencode flavor)", () => {
  it("enumerates the advertised provider/id model list", async () => {
    const server = serve({
      FAKE_CONFIG_ID: "model",
      FAKE_MODELS: "anthropic/claude-sonnet-4-5,anthropic/claude-opus-4-6",
    },);

    const adapter = makeAdapter({ command: server.argv, },);
    expect(await adapter.enumerateModels(),).toEqual(
      ["anthropic/claude-sonnet-4-5", "anthropic/claude-opus-4-6",],
    );

    adapter.close();
  });

  it("switches model via session/set_config_option", async () => {
    const server = serve({ FAKE_CONFIG_ID: "model", FAKE_MODELS: "anthropic/claude-sonnet-4-5", },);
    const adapter = makeAdapter({ command: server.argv, },);
    await expect(adapter.setModel("anthropic/claude-sonnet-4-5",),).resolves.toBeUndefined();
    adapter.close();
  });

  it("surfaces Unknown ACP model as a typed `model` error", async () => {
    const server = serve({
      FAKE_CONFIG_ID: "model",
      FAKE_MODELS: "anthropic/claude-sonnet-4-5",
      FAKE_REJECT_MODEL: "anthropic/gone",
    },);

    const adapter = makeAdapter({ command: server.argv, },);
    await expect(adapter.setModel("anthropic/gone",),).rejects.toMatchObject({
      name: "HarnessAcpError",
      kind: "model",
    },);

    adapter.close();
  });

  it("runs a prompt: chunk text, stopReason, usage, session id", async () => {
    const server = serve({
      FAKE_CONFIG_ID: "model",
      FAKE_MODELS: "anthropic/claude-sonnet-4-5",
      FAKE_REPLY: "hello world",
    },);

    const adapter = makeAdapter({ command: server.argv, },);
    await adapter.enumerateModels();
    const turn = await adapter.prompt("do the thing",);
    expect(turn.text,).toBe("hello world",);
    expect(turn.stopReason,).toBe("end_turn",);
    expect(turn.usage,).toEqual({ inputTokens: 10, outputTokens: 5, totalTokens: 15, },);
    expect(turn.acpSessionId,).toBe("fake-session-1",);
    adapter.close();
  });

  it("reports no quota surface (null)", async () => {
    const server = serve({ FAKE_CONFIG_ID: "model", FAKE_MODELS: "anthropic/claude-sonnet-4-5", },);
    const adapter = makeAdapter({ command: server.argv, },);
    expect(await adapter.fetchUsageReports(),).toBeNull();
    adapter.close();
  });

  it("answers a sessionless session/new as a typed `session` error", async () => {
    const server = serve({
      FAKE_CONFIG_ID: "model",
      FAKE_MODELS: "anthropic/claude-sonnet-4-5",
      FAKE_NO_SESSION: "1",
    },);

    const adapter = makeAdapter({ command: server.argv, },);
    await expect(adapter.enumerateModels(),).rejects.toMatchObject({
      name: "HarnessAcpError",
      kind: "session",
    },);

    adapter.close();
  });

  it("marks spawn failure typed and memoizes the closed state", async () => {
    const adapter = createOpenCodeAdapter("prof", ["definitely-not-a-real-binary-xyz",],) as OpenCodeAcpAdapter;
    adapters.push(adapter,);
    await expect(adapter.enumerateModels(),).rejects.toMatchObject({ name: "HarnessAcpError", },);
    adapter.close();
  });

  it("close is idempotent", () => {
    const server = serve({ FAKE_CONFIG_ID: "model", FAKE_MODELS: "anthropic/claude-sonnet-4-5", },);
    const adapter = makeAdapter({ command: server.argv, },);
    expect(adapter,).toBeInstanceOf(GenericAcpAdapter,);
    adapter.close();
    adapter.close();
  });
});
