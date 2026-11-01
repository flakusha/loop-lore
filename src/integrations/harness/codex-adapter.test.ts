// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * CodexAcpAdapter integration tests against the fake ACP server fixture,
 * running a codex-flavored config (`model` select id, bare model-preset
 * option values).
 *
 * Resource contract: per test, BOTH child processes are hard-killed in the
 * afterEach teardown (including failure paths): the fake-ACP fixture
 * subprocess AND the adapter's client subprocess. No real codex, no
 * env-gated e2e, no shared ports/paths — parallel-safe.
 */
import { afterEach, describe, expect, it, } from "bun:test";
import { CodexAcpAdapter, createCodexAdapter, } from "./codex";
import { type FakeAcpServer, startFakeAcp, } from "./fake-acp-server";
import { GenericAcpAdapter, } from "./generic-acp";

/** Servers started by the current test; reaped after each. */
const live: FakeAcpServer[] = [];
/** Adapters created by the current test; reaped after each. */
const adapters: CodexAcpAdapter[] = [];

/** Start a fixture and register it for teardown. */
function serve(env: Parameters<typeof startFakeAcp>[0],): FakeAcpServer {
  const server = startFakeAcp(env,);
  live.push(server,);
  return server;
}

/** Create an adapter and register it for teardown. */
function makeAdapter(options: ConstructorParameters<typeof CodexAcpAdapter>[0],): CodexAcpAdapter {
  const adapter = new CodexAcpAdapter(options,);
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

describe("CodexAcpAdapter (fake ACP fixture, codex flavor)", () => {
  it("namespaces bare preset ids as codex/<preset>", async () => {
    const server = serve({ FAKE_CONFIG_ID: "model", FAKE_MODELS: "gpt-5.1-codex,gpt-5.1-codex-mini", },);
    const adapter = makeAdapter({ command: server.argv, },);
    expect(await adapter.enumerateModels(),).toEqual(["codex/gpt-5.1-codex", "codex/gpt-5.1-codex-mini",],);
    adapter.close();
  });

  it("passes slash-containing wire values through verbatim", async () => {
    const server = serve({ FAKE_CONFIG_ID: "model", FAKE_MODELS: "openai/gpt-5.2", },);
    const adapter = makeAdapter({ command: server.argv, },);
    expect(await adapter.enumerateModels(),).toEqual(["openai/gpt-5.2",],);
    adapter.close();
  });

  it("switches model via session/set_config_option", async () => {
    const server = serve({ FAKE_CONFIG_ID: "model", FAKE_MODELS: "gpt-5.1-codex", },);
    const adapter = makeAdapter({ command: server.argv, },);
    await expect(adapter.setModel("codex/gpt-5.1-codex",),).resolves.toBeUndefined();
    adapter.close();
  });

  it("strips the codex/ namespace before the wire call", async () => {
    // The fixture rejects the RAW wire value, so a rejection proves the id
    // arrived as the bare preset, not the namespaced form.
    const server = serve({
      FAKE_CONFIG_ID: "model",
      FAKE_MODELS: "gpt-5.1-codex",
      FAKE_REJECT_MODEL: "gpt-5.1-codex",
    },);

    const adapter = makeAdapter({ command: server.argv, },);
    await expect(adapter.setModel("codex/gpt-5.1-codex",),).rejects.toMatchObject({
      name: "HarnessAcpError",
      kind: "model",
    },);

    adapter.close();
  });

  it("surfaces Unknown ACP model as a typed `model` error", async () => {
    const server = serve({ FAKE_CONFIG_ID: "model", FAKE_MODELS: "gpt-5.1-codex", FAKE_REJECT_MODEL: "gone", },);
    const adapter = makeAdapter({ command: server.argv, },);
    await expect(adapter.setModel("codex/gone",),).rejects.toMatchObject({ name: "HarnessAcpError", kind: "model", },);
    adapter.close();
  });

  it("runs a prompt: chunk text, stopReason, usage, session id", async () => {
    const server = serve({ FAKE_CONFIG_ID: "model", FAKE_MODELS: "gpt-5.1-codex", FAKE_REPLY: "patched", },);
    const adapter = makeAdapter({ command: server.argv, },);
    await adapter.enumerateModels();
    const turn = await adapter.prompt("fix the flake",);
    expect(turn.text,).toBe("patched",);
    expect(turn.stopReason,).toBe("end_turn",);
    expect(turn.usage,).toEqual({ inputTokens: 10, outputTokens: 5, totalTokens: 15, },);
    expect(turn.acpSessionId,).toBe("fake-session-1",);
    adapter.close();
  });

  it("reports no quota surface (null)", async () => {
    const server = serve({ FAKE_CONFIG_ID: "model", FAKE_MODELS: "gpt-5.1-codex", },);
    const adapter = makeAdapter({ command: server.argv, },);
    expect(await adapter.fetchUsageReports(),).toBeNull();
    adapter.close();
  });

  it("answers a sessionless session/new as a typed `session` error", async () => {
    const server = serve({
      FAKE_CONFIG_ID: "model",
      FAKE_MODELS: "gpt-5.1-codex",
      FAKE_NO_SESSION: "1",
    },);

    const adapter = makeAdapter({ command: server.argv, },);
    await expect(adapter.enumerateModels(),).rejects.toMatchObject({ name: "HarnessAcpError", kind: "session", },);
    adapter.close();
  });

  it("marks spawn failure typed and memoizes the closed state", async () => {
    const adapter = createCodexAdapter("prof", ["definitely-not-a-real-binary-xyz",],) as CodexAcpAdapter;
    adapters.push(adapter,);
    await expect(adapter.enumerateModels(),).rejects.toMatchObject({ name: "HarnessAcpError", kind: "spawn", },);
    adapter.close();
  });

  it("close is idempotent", () => {
    const server = serve({ FAKE_CONFIG_ID: "model", FAKE_MODELS: "gpt-5.1-codex", },);
    const adapter = makeAdapter({ command: server.argv, },);
    expect(adapter,).toBeInstanceOf(GenericAcpAdapter,);
    adapter.close();
    adapter.close();
  });
});
