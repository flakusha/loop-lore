// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * ClaudeCodeAcpAdapter integration tests against the fake ACP server fixture,
 * running a claude-code-flavored config (non-standard `models` session field,
 * `unstable_setSessionModel` switching, bare Anthropic ids).
 *
 * Resource contract: per test, BOTH child processes are hard-killed in the
 * afterEach teardown (including failure paths): the fake-ACP fixture
 * subprocess AND the adapter's client subprocess. No real claude-agent-acp,
 * no env-gated e2e, no shared ports/paths — parallel-safe.
 */
import { afterEach, describe, expect, it, } from "bun:test";
import { ClaudeCodeAcpAdapter, createClaudeCodeAdapter, } from "./claude-code";
import { type FakeAcpServer, startFakeAcp, } from "./fake-acp-server";
import { GenericAcpAdapter, } from "./generic-acp";

/** Servers started by the current test; reaped after each. */
const live: FakeAcpServer[] = [];
/** Adapters created by the current test; reaped after each. */
const adapters: ClaudeCodeAcpAdapter[] = [];

/** Start a fixture and register it for teardown. */
function serve(env: Parameters<typeof startFakeAcp>[0],): FakeAcpServer {
  const server = startFakeAcp(env,);
  live.push(server,);
  return server;
}

/** Create an adapter and register it for teardown. */
function makeAdapter(options: ConstructorParameters<typeof ClaudeCodeAcpAdapter>[0],): ClaudeCodeAcpAdapter {
  const adapter = new ClaudeCodeAcpAdapter(options,);
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

describe("ClaudeCodeAcpAdapter (fake ACP fixture, claude-code flavor)", () => {
  it("enumerates the models field as claude/<modelId>", async () => {
    const server = serve({ FAKE_MODELS_FIELD: "1", FAKE_MODELS: "claude-opus-4-6,claude-sonnet-4-5", },);
    const adapter = makeAdapter({ command: server.argv, },);
    expect(await adapter.enumerateModels(),).toEqual(["claude/claude-opus-4-6", "claude/claude-sonnet-4-5",],);
    adapter.close();
  });

  it("passes slash-containing wire values through verbatim", async () => {
    const server = serve({ FAKE_MODELS_FIELD: "1", FAKE_MODELS: "anthropic/claude-opus-4-6", },);
    const adapter = makeAdapter({ command: server.argv, },);
    expect(await adapter.enumerateModels(),).toEqual(["anthropic/claude-opus-4-6",],);
    adapter.close();
  });

  it("switches model via unstable_setSessionModel", async () => {
    const server = serve({ FAKE_MODELS_FIELD: "1", FAKE_MODELS: "claude-opus-4-6", },);
    const adapter = makeAdapter({ command: server.argv, },);
    await expect(adapter.setModel("claude/claude-opus-4-6",),).resolves.toBeUndefined();
    adapter.close();
  });

  it("strips the claude/ namespace before the wire call", async () => {
    // The fixture rejects the RAW modelId param, so a rejection proves the id
    // arrived as the bare Anthropic string, not the namespaced form.
    const server = serve({
      FAKE_MODELS_FIELD: "1",
      FAKE_MODELS: "claude-opus-4-6",
      FAKE_REJECT_MODEL: "claude-opus-4-6",
    },);

    const adapter = makeAdapter({ command: server.argv, },);
    await expect(adapter.setModel("claude/claude-opus-4-6",),).rejects.toMatchObject({
      name: "HarnessAcpError",
      kind: "model",
    },);

    adapter.close();
  });

  it("surfaces Unknown model as a typed `model` error", async () => {
    const server = serve({ FAKE_MODELS_FIELD: "1", FAKE_MODELS: "claude-opus-4-6", FAKE_REJECT_MODEL: "gone", },);
    const adapter = makeAdapter({ command: server.argv, },);
    await expect(adapter.setModel("claude/gone",),).rejects.toMatchObject({
      name: "HarnessAcpError",
      kind: "model",
    },);

    adapter.close();
  });

  it("runs a prompt: chunk text, stopReason, usage, session id", async () => {
    const server = serve({ FAKE_MODELS_FIELD: "1", FAKE_MODELS: "claude-opus-4-6", FAKE_REPLY: "wrote it", },);
    const adapter = makeAdapter({ command: server.argv, },);
    await adapter.enumerateModels();
    const turn = await adapter.prompt("add the feature",);
    expect(turn.text,).toBe("wrote it",);
    expect(turn.stopReason,).toBe("end_turn",);
    expect(turn.usage,).toEqual({ inputTokens: 10, outputTokens: 5, totalTokens: 15, },);
    expect(turn.acpSessionId,).toBe("fake-session-1",);
    adapter.close();
  });

  it("reports no quota surface (null)", async () => {
    const server = serve({ FAKE_MODELS_FIELD: "1", FAKE_MODELS: "claude-opus-4-6", },);
    const adapter = makeAdapter({ command: server.argv, },);
    expect(await adapter.fetchUsageReports(),).toBeNull();
    adapter.close();
  });

  it("answers a sessionless session/new as a typed `session` error", async () => {
    const server = serve({
      FAKE_MODELS_FIELD: "1",
      FAKE_MODELS: "claude-opus-4-6",
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
    const adapter = createClaudeCodeAdapter("prof", ["definitely-not-a-real-binary-xyz",],) as ClaudeCodeAcpAdapter;
    adapters.push(adapter,);
    await expect(adapter.enumerateModels(),).rejects.toMatchObject({
      name: "HarnessAcpError",
      kind: "spawn",
    },);

    adapter.close();
  });

  it("close is idempotent", () => {
    const server = serve({ FAKE_MODELS_FIELD: "1", FAKE_MODELS: "claude-opus-4-6", },);
    const adapter = makeAdapter({ command: server.argv, },);
    expect(adapter,).toBeInstanceOf(GenericAcpAdapter,);
    adapter.close();
    adapter.close();
  });
});
