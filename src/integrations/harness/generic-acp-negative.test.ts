// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * GenericAcpAdapter negative-path tests: malformed NDJSON, handshake hangs,
 * mid-prompt child exits, and respawn after a dead child.
 *
 * Resource contract (parallel-safe): EVERY test owns a fresh fixture
 * subprocess (startFakeAcp: unique mkdtemp dir, no ports) AND a fresh
 * adapter client subprocess; both are hard-killed in afterEach, including
 * failure paths. No shared globals, no fixed paths, no ordering
 * dependence — any test passes alone or in any order. requestTimeoutMs is
 * per-test: hang-assertion tests pin a SHORT budget so the dead handshake
 * rejects fast; success-path tests (respawn) use a GENEROUS budget so a
 * loaded runner never times out a legitimate round trip.
 */
import { afterEach, describe, expect, it, } from "bun:test";
import { type FakeAcpServer, startFakeAcp, } from "./fake-acp-server";
import { OpenCodeAcpAdapter, } from "./opencode";

/** Servers started by the current test; reaped after each. */
const live: FakeAcpServer[] = [];
/** Adapters created by the current test; reaped after each. */
const adapters: OpenCodeAcpAdapter[] = [];

/** Per-request timeout for hang-assertion tests (dead handshake rejects fast). */
const HANG_TIMEOUT_MS = 250;
/** Per-request timeout for success-path tests (survives loaded parallel runners). */
const LIVE_TIMEOUT_MS = 4000;

/** Start a fixture and register it for teardown. */
function serve(env: Parameters<typeof startFakeAcp>[0],): FakeAcpServer {
  const server = startFakeAcp(env,);
  live.push(server,);
  return server;
}

/** Create an adapter with the given per-test timeout; register for teardown. */
function makeAdapter(server: FakeAcpServer, requestTimeoutMs: number,): OpenCodeAcpAdapter {
  const adapter = new OpenCodeAcpAdapter({ command: server.argv, requestTimeoutMs, },);
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
    const adapter = makeAdapter(server, HANG_TIMEOUT_MS,);
    await expect(adapter.enumerateModels(),).rejects.toMatchObject({
      name: "HarnessAcpError",
      kind: "initialize",
    },);

    await expect(adapter.enumerateModels(),).rejects.toThrow(/timed out/,);
    adapter.close();
  });

  it("handshake hang rejects initialize as a typed timeout", async () => {
    const server = serve({ FAKE_HANG: "1", FAKE_MODELS: "m", },);
    const adapter = makeAdapter(server, HANG_TIMEOUT_MS,);
    await expect(adapter.enumerateModels(),).rejects.toMatchObject({
      name: "HarnessAcpError",
      kind: "initialize",
    },);

    await expect(adapter.enumerateModels(),).rejects.toThrow(/initialize timed out/,);
    adapter.close();
  });

  it("mid-prompt child exit fails the turn with the exit code, then respawns", async () => {
    const server = serve({ FAKE_EXIT_ON_PROMPT: "crash me", FAKE_MODELS: "m", FAKE_REPLY: "second try", },);
    const adapter = makeAdapter(server, LIVE_TIMEOUT_MS,);
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
