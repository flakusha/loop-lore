// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * HermesAcpAdapter integration tests against the fake ACP server fixture,
 * running a hermes-flavored config (non-standard `models` session field,
 * `session/set_session_model` switching, colon-shaped `provider:model` ids).
 *
 * Resource contract: per test, BOTH child processes are hard-killed in the
 * afterEach teardown (including failure paths): the fake-ACP fixture
 * subprocess AND the adapter's client subprocess. No real hermes binary,
 * no env-gated e2e, no shared ports/paths — parallel-safe.
 */
import { afterEach, describe, expect, it, } from "bun:test";
import { type FakeAcpServer, startFakeAcp, } from "./fake-acp-server";
import { GenericAcpAdapter, } from "./generic-acp";
import { createHermesAdapter, HermesAcpAdapter, } from "./hermes";

/** Servers started by the current test; reaped after each. */
const live: FakeAcpServer[] = [];
/** Adapters created by the current test; reaped after each. */
const adapters: HermesAcpAdapter[] = [];

/** Start a fixture and register it for teardown. */
function serve(env: Parameters<typeof startFakeAcp>[0],): FakeAcpServer {
  const server = startFakeAcp(env,);
  live.push(server,);
  return server;
}

/** Create an adapter and register it for teardown. */
function makeAdapter(options: ConstructorParameters<typeof HermesAcpAdapter>[0],): HermesAcpAdapter {
  const adapter = new HermesAcpAdapter(options,);
  adapters.push(adapter,);
  return adapter;
}

afterEach(async () => {
  while (adapters.length > 0) {
    adapters.pop()?.close();
  }

  while (live.length > 0) {
    live.pop()?.stop();
  }
},);

describe("HermesAcpAdapter (fake ACP fixture, hermes flavor)", () => {
  it("enumerates the models field as provider/model (colon swapped for slash)", async () => {
    const server = serve({ FAKE_MODELS_FIELD: "1", FAKE_MODELS: "openrouter:z-ai/glm-5.1,z-ai:glm-4.6", },);
    const adapter = makeAdapter({ command: server.argv, },);
    expect(await adapter.enumerateModels(),).toEqual(["openrouter/z-ai/glm-5.1", "z-ai/glm-4.6",],);
    adapter.close();
  });

  it("keeps custom:<name>:<model> round-tripable as custom/<name>:<model>", async () => {
    const server = serve({ FAKE_MODELS_FIELD: "1", FAKE_MODELS: "custom:vllm:qwen3-32b", },);
    const adapter = makeAdapter({ command: server.argv, },);
    expect(await adapter.enumerateModels(),).toEqual(["custom/vllm:qwen3-32b",],);
    // The reverse translation must reproduce the wire's custom:<name>:<model> shape.
    await expect(adapter.setModel("custom/vllm:qwen3-32b",),).resolves.toBeUndefined();
    adapter.close();
  });

  it("passes colon-free wire values through verbatim", async () => {
    const server = serve({ FAKE_MODELS_FIELD: "1", FAKE_MODELS: "openrouter/z-ai/glm-5.1", },);
    const adapter = makeAdapter({ command: server.argv, },);
    expect(await adapter.enumerateModels(),).toEqual(["openrouter/z-ai/glm-5.1",],);
    adapter.close();
  });

  it("switches model via session/set_session_model", async () => {
    const server = serve({ FAKE_MODELS_FIELD: "1", FAKE_MODELS: "openrouter:z-ai/glm-5.1", },);
    const adapter = makeAdapter({ command: server.argv, },);
    await expect(adapter.setModel("openrouter/z-ai/glm-5.1",),).resolves.toBeUndefined();
    adapter.close();
  });

  it("rebuilds the colon wire id before the switch call", async () => {
    // The fixture rejects the RAW modelId param, so a rejection proves the id
    // arrived as the colon-shaped wire value, not the core-facing slash form.
    const server = serve({
      FAKE_MODELS_FIELD: "1",
      FAKE_MODELS: "openrouter:z-ai/glm-5.1",
      FAKE_REJECT_MODEL: "openrouter:z-ai/glm-5.1",
    },);

    const adapter = makeAdapter({ command: server.argv, },);
    await expect(adapter.setModel("openrouter/z-ai/glm-5.1",),).rejects.toMatchObject({
      name: "HarnessAcpError",
      kind: "model",
    },);

    adapter.close();
  });

  it("surfaces Unknown model as a typed `model` error", async () => {
    // The fixture rejects on the FULL wire param, so the reject id is the
    // colon-shaped wire value the adapter rebuilt from openrouter/gone.
    const server = serve({
      FAKE_MODELS_FIELD: "1",
      FAKE_MODELS: "openrouter:z-ai/glm-5.1",
      FAKE_REJECT_MODEL: "openrouter:gone",
    },);

    const adapter = makeAdapter({ command: server.argv, },);
    await expect(adapter.setModel("openrouter/gone",),).rejects.toMatchObject({
      name: "HarnessAcpError",
      kind: "model",
    },);

    adapter.close();
  });

  it("runs a prompt: chunk text, stopReason, usage, session id", async () => {
    const server = serve({ FAKE_MODELS_FIELD: "1", FAKE_MODELS: "openrouter:z-ai/glm-5.1", FAKE_REPLY: "wrote it", },);
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
    const server = serve({ FAKE_MODELS_FIELD: "1", FAKE_MODELS: "openrouter:z-ai/glm-5.1", },);
    const adapter = makeAdapter({ command: server.argv, },);
    expect(await adapter.fetchUsageReports(),).toBeNull();
    adapter.close();
  });

  it("answers a sessionless session/new as a typed `session` error", async () => {
    const server = serve({
      FAKE_MODELS_FIELD: "1",
      FAKE_MODELS: "openrouter:z-ai/glm-5.1",
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
    const adapter = createHermesAdapter("prof", ["definitely-not-a-real-binary-xyz",],) as HermesAcpAdapter;
    adapters.push(adapter,);
    await expect(adapter.enumerateModels(),).rejects.toMatchObject({
      name: "HarnessAcpError",
      kind: "spawn",
    },);

    adapter.close();
  });

  it("close is idempotent", () => {
    const server = serve({ FAKE_MODELS_FIELD: "1", FAKE_MODELS: "openrouter:z-ai/glm-5.1", },);
    const adapter = makeAdapter({ command: server.argv, },);
    expect(adapter,).toBeInstanceOf(GenericAcpAdapter,);
    adapter.close();
    adapter.close();
  });
});
