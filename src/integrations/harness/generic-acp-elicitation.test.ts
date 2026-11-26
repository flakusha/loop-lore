// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * GenericAcpAdapter elicitation tests: an `elicitation/create` form ask parks
 * on the human-decision slot and answers accept/decline through
 * `respondPermission` (the permission-queue seam), while any other mode is
 * refused with an explicit JSON-RPC error instead of silence.
 *
 * Resource contract (parallel-safe): every test owns a fresh fixture
 * subprocess (startFakeAcp: unique mkdtemp dir, no ports) and a fresh
 * adapter; both reaped in afterEach including failure paths. Synchronization
 * is promise-based (the onPermissionRequest callback resolves a promise),
 * never a sleep — tests pass in any order.
 */
import { afterEach, describe, expect, it, } from "bun:test";
import { type PendingPermission, } from "./adapter-types";
import { type FakeAcpLogEntry, type FakeAcpServer, startFakeAcp, } from "./fake-acp-server";
import { OpenCodeAcpAdapter, } from "./opencode";

/** Servers started by the current test; reaped after each. */
const live: FakeAcpServer[] = [];
/** Adapters created by the current test; reaped after each. */
const adapters: OpenCodeAcpAdapter[] = [];

/** Per-request timeout for success paths (survives loaded parallel runners). */
const LIVE_TIMEOUT_MS = 4000;

/** Start a fixture and register it for teardown. */
function serve(env: Parameters<typeof startFakeAcp>[0],): FakeAcpServer {
  const server = startFakeAcp(env,);
  live.push(server,);
  return server;
}

/**
 * Create an adapter whose permission callback settles the returned handle:
 * `nextAsk` resolves on the first parked ask.
 */
function makeElicitationAdapter(
  server: FakeAcpServer,
): { adapter: OpenCodeAcpAdapter; nextAsk: Promise<PendingPermission> } {
  let askResolve!: (pending: PendingPermission,) => void;
  const nextAsk = new Promise<PendingPermission>((resolve,) => {
    askResolve = resolve;
  },);

  const adapter = new OpenCodeAcpAdapter({
    command: server.argv,
    requestTimeoutMs: LIVE_TIMEOUT_MS,
    onPermissionRequest: (pending,) => askResolve(pending,),
  },);

  adapters.push(adapter,);

  return { adapter, nextAsk, };
}

/** The raw outcomes the fixture observed for `elicitation/create` asks. */
function elicitationOutcomes(server: FakeAcpServer,): unknown[] {
  return server.readLog()
    .filter((item,): item is Extract<FakeAcpLogEntry, { event: "permission_outcome" }> =>
      item.event === "permission_outcome"
    )
    .map((item,) => item.outcome);
}

afterEach(async () => {
  while (adapters.length > 0) { adapters.pop()?.close(); }
  while (live.length > 0) { live.pop()?.stop(); }
},);

describe("GenericAcpAdapter elicitation/create (fake ACP fixture)", () => {
  it("answers a form elicitation with accept on approve", async () => {
    const server = serve({ FAKE_ELICITATION: "form", FAKE_MODELS: "m", },);
    const { adapter, nextAsk, } = makeElicitationAdapter(server,);

    const turn = adapter.prompt("hi",);
    const ask = await nextAsk;
    expect((ask.params as { mode?: unknown }).mode,).toBe("form",);
    expect(adapter.pendingPermission(),).not.toBeNull();

    adapter.respondPermission({ outcome: "allow_once", },);
    expect(adapter.pendingPermission(),).toBeNull();

    const result = await turn;
    expect(result.stopReason,).toBe("end_turn",);
    expect(elicitationOutcomes(server,),).toEqual([{ action: "accept", },],);
  });

  it("answers a form elicitation with decline on deny", async () => {
    const server = serve({ FAKE_ELICITATION: "form", FAKE_MODELS: "m", },);
    const { adapter, nextAsk, } = makeElicitationAdapter(server,);

    const turn = adapter.prompt("hi",);
    await nextAsk;

    adapter.respondPermission({ outcome: "reject_once", },);

    const result = await turn;
    expect(result.stopReason,).toBe("end_turn",);
    expect(elicitationOutcomes(server,),).toEqual([{ action: "decline", },],);
  });

  it("refuses an unsupported elicitation mode with an explicit JSON-RPC error", async () => {
    const server = serve({ FAKE_ELICITATION: "url", FAKE_MODELS: "m", },);
    const { adapter, } = makeElicitationAdapter(server,);

    // No ask is parked for an unsupported mode — the turn still completes.
    const result = await adapter.prompt("hi",);
    expect(result.stopReason,).toBe("end_turn",);
    expect(adapter.pendingPermission(),).toBeNull();

    const outcomes = elicitationOutcomes(server,);
    expect(outcomes,).toHaveLength(1,);
    expect((outcomes[0] as { error?: { code?: unknown } }).error?.code,).toBe(-32602,);
  });
});
