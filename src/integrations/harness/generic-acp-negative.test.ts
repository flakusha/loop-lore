// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * GenericAcpAdapter negative-path tests: malformed NDJSON, handshake hangs,
 * mid-prompt child exits, and respawn after a dead child. All against the
 * fake ACP fixture (one subprocess pair per test, afterEach hard-kill);
 * short requestTimeoutMs keeps hangs out of the suite.
 */
import { afterEach, describe, expect, it, } from "bun:test";
import { type FakeAcpServer, startFakeAcp, } from "./fake-acp-server";
import { OpenCodeAcpAdapter, } from "./opencode";

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

/** Create an adapter with a short timeout and register it for teardown. */
function makeAdapter(server: FakeAcpServer,): OpenCodeAcpAdapter {
  const adapter = new OpenCodeAcpAdapter({ command: server.argv, requestTimeoutMs: 250, },);
  adapters.push(adapter,);
  return adapter;
}

afterEach(async () => {
  while (adapters.length > 0) {
    const adapter = adapters.pop()!;
    try {
      await adapter.close();
    } catch {
      // Teardown must not skip remaining reaps.
    }
  }

  while (live.length > 0) {
    live.pop()?.stop();
  }
},);

describe("GenericAcpAdapter negative paths (fake ACP fixture)", () => {
  it("malformed NDJSON noise does not crash the handshake — typed timeout", async () => {
    const server = serve({ FAKE_MALFORMED: "1", FAKE_MODELS: "m", },);
    const adapter = makeAdapter(server,);
    await expect(adapter.enumerateModels(),).rejects.toMatchObject({
      name: "HarnessAcpError",
      kind: "initialize",
    },);

    await expect(adapter.enumerateModels(),).rejects.toThrow(/timed out/,);
    adapter.close();
  });

  it("handshake hang rejects initialize as a typed timeout", async () => {
    const server = serve({ FAKE_HANG: "1", FAKE_MODELS: "m", },);
    const adapter = makeAdapter(server,);
    await expect(adapter.enumerateModels(),).rejects.toMatchObject({
      name: "HarnessAcpError",
      kind: "initialize",
    },);

    await expect(adapter.enumerateModels(),).rejects.toThrow(/initialize timed out/,);
    adapter.close();
  });

  it("mid-prompt child exit fails the turn with the exit code, then respawns", async () => {
    const server = serve({ FAKE_EXIT_ON_PROMPT: "crash me", FAKE_MODELS: "m", FAKE_REPLY: "second try", },);
    const adapter = makeAdapter(server,);
    await adapter.enumerateModels();
    await expect(adapter.prompt("crash me",),).rejects.toMatchObject({
      name: "HarnessAcpError",
      kind: "prompt",
    },);

    await expect(adapter.prompt("crash me",),).rejects.toThrow(/code=1/,);

    // Zombie-session fix: the dead child must not poison the memoized
    // session — the next call respawns a fresh child and succeeds.
    const turn = await adapter.prompt("again",);
    expect(turn.text,).toBe("second try",);
    adapter.close();
  });
});
