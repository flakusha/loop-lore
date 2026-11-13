// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * GenericAcpAdapter permission-surface tests over the fake ACP fixture: the
 * `session/request_permission` round trip in the protocol's answer shape
 * (`selected` with the advertised option id, or `cancelled`), the closed
 * request when no option can carry the decision, and the withdrawal callback
 * when a closed connection abandons a parked ask (TASK-permission-approval-flow).
 *
 * Resource contract (parallel-safe): every test owns a fresh fixture
 * subprocess (startFakeAcp: unique mkdtemp dir, no ports) and a fresh
 * adapter; both reaped in afterEach including failure paths. Synchronization
 * is promise-based (the onPermissionRequest callback resolves a promise),
 * never a sleep — tests pass in any order.
 */
import { afterEach, describe, expect, it, } from "bun:test";
import type { PendingPermission, } from "./adapter-types";
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
 * Create an adapter whose permission callbacks settle the returned handles:
 * `nextAsk` resolves on the first ask, `withdrawn` counts withdrawals.
 */
function makePermissionAdapter(
  server: FakeAcpServer,
): { adapter: OpenCodeAcpAdapter; nextAsk: Promise<PendingPermission>; withdrawn: () => number } {
  let askResolve!: (pending: PendingPermission,) => void;
  const nextAsk = new Promise<PendingPermission>((resolve,) => {
    askResolve = resolve;
  },);

  let withdrawals = 0;
  const adapter = new OpenCodeAcpAdapter({
    command: server.argv,
    requestTimeoutMs: LIVE_TIMEOUT_MS,
    onPermissionRequest: (pending,) => askResolve(pending,),
    onPermissionWithdrawn: () => {
      withdrawals += 1;
    },
  },);

  adapters.push(adapter,);

  return { adapter, nextAsk, withdrawn: () => withdrawals, };
}

afterEach(async () => {
  while (adapters.length > 0) { adapters.pop()?.close(); }
  while (live.length > 0) { live.pop()?.stop(); }
},);

describe("GenericAcpAdapter permission surface (fake ACP fixture)", () => {
  it("fires onPermissionRequest and answers the ask on respondPermission", async () => {
    const server = serve({ FAKE_PERMISSION: "1", FAKE_MODELS: "m", },);
    const { adapter, nextAsk, } = makePermissionAdapter(server,);

    const turn = adapter.prompt("hi",);
    const ask = await nextAsk;
    expect(ask.kind,).toBe("edit",);
    expect(adapter.pendingPermission(),).not.toBeNull();

    adapter.respondPermission({ outcome: "allow_once", optionId: "allow", },);
    const result = await turn;
    expect(result.stopReason,).toBe("end_turn",);
    expect(adapter.pendingPermission(),).toBeNull();

    const outcome = server.readLog().find((item,): item is Extract<FakeAcpLogEntry, {
      event: "permission_outcome";
    }> => item.event === "permission_outcome");

    expect(outcome?.outcome,).toEqual({ outcome: { outcome: "selected", optionId: "allow", }, },);
  });

  it("answers with the spec's selected variant, naming the advertised option id", async () => {
    const server = serve({ FAKE_PERMISSION: "1", FAKE_MODELS: "m", },);
    const { adapter, nextAsk, } = makePermissionAdapter(server,);

    const turn = adapter.prompt("hi",);
    await nextAsk;
    adapter.respondPermission({ outcome: "allow_once", },);
    await turn;

    const outcome = server.readLog().find((item,): item is Extract<FakeAcpLogEntry, {
      event: "permission_outcome";
    }> => item.event === "permission_outcome");

    expect(outcome?.outcome,).toEqual({ outcome: { outcome: "selected", optionId: "allow", }, },);
  });

  it("answers a hyphenated harness dialect with the advertised option id", async () => {
    const server = serve({
      FAKE_PERMISSION: "1",
      FAKE_MODELS: "m",
      FAKE_PERMISSION_KINDS: "allow-once,reject-once",
    },);

    const { adapter, nextAsk, } = makePermissionAdapter(server,);

    const turn = adapter.prompt("hi",);
    await nextAsk;
    adapter.respondPermission({ outcome: "allow_once", },);
    await turn;

    const outcome = server.readLog().find((item,): item is Extract<FakeAcpLogEntry, {
      event: "permission_outcome";
    }> => item.event === "permission_outcome");

    expect(outcome?.outcome,).toEqual({ outcome: { outcome: "selected", optionId: "allow", }, },);
  });

  it("fails the request closed with a JSON-RPC error when no option can carry the decision", async () => {
    const server = serve({
      FAKE_PERMISSION: "1",
      FAKE_MODELS: "m",
      FAKE_PERMISSION_KINDS: "ask_user,ask_user",
    },);

    const { adapter, nextAsk, } = makePermissionAdapter(server,);

    const turn = adapter.prompt("hi",);
    await nextAsk;
    adapter.respondPermission({ outcome: "allow_once", },);
    await turn;

    const outcome = server.readLog().find((item,): item is Extract<FakeAcpLogEntry, {
      event: "permission_outcome";
    }> => item.event === "permission_outcome");

    // No advertised option can carry the decision: the request fails with a
    // JSON-RPC error instead of a shape the protocol does not allow.
    expect(outcome?.outcome,).toEqual({
      error: {
        code: -32603,
        message: "no advertised permission option can carry the allow_once decision",
      },
    },);

    expect(adapter.pendingPermission(),).toBeNull();
  });

  it("fails the request closed when the harness advertised no options at all", async () => {
    const server = serve({
      FAKE_PERMISSION: "1",
      FAKE_MODELS: "m",
      FAKE_PERMISSION_NO_OPTIONS: "1",
    },);

    const { adapter, nextAsk, } = makePermissionAdapter(server,);

    const turn = adapter.prompt("hi",);
    await nextAsk;
    adapter.respondPermission({ outcome: "allow_once", },);
    await turn;

    const outcome = server.readLog().find((item,): item is Extract<FakeAcpLogEntry, {
      event: "permission_outcome";
    }> => item.event === "permission_outcome");

    expect(outcome?.outcome,).toEqual({
      error: {
        code: -32603,
        message: "no advertised permission option can carry the allow_once decision",
      },
    },);

    expect(adapter.pendingPermission(),).toBeNull();
  });

  it("fails a denial closed when the harness advertised no options", async () => {
    const server = serve({
      FAKE_PERMISSION: "1",
      FAKE_MODELS: "m",
      FAKE_PERMISSION_NO_OPTIONS: "1",
    },);

    const { adapter, nextAsk, } = makePermissionAdapter(server,);

    const turn = adapter.prompt("hi",);
    await nextAsk;
    adapter.respondPermission({ outcome: "reject_once", },);
    await turn;

    const outcome = server.readLog().find((item,): item is Extract<FakeAcpLogEntry, {
      event: "permission_outcome";
    }> => item.event === "permission_outcome");

    // A denial that cannot be expressed fails the request - it never turns
    // into an allow.
    expect(outcome?.outcome,).toEqual({
      error: {
        code: -32603,
        message: "no advertised permission option can carry the reject_once decision",
      },
    },);
  });

  it("does not let a denial ride the harness's allow option", async () => {
    const server = serve({ FAKE_PERMISSION: "1", FAKE_MODELS: "m", },);
    const { adapter, nextAsk, } = makePermissionAdapter(server,);

    const turn = adapter.prompt("hi",);
    await nextAsk;
    adapter.respondPermission({ outcome: "reject_once", optionId: "allow", },);
    await turn;

    const outcome = server.readLog().find((item,): item is Extract<FakeAcpLogEntry, {
      event: "permission_outcome";
    }> => item.event === "permission_outcome");

    expect(outcome?.outcome,).toEqual({ outcome: { outcome: "selected", optionId: "reject", }, },);
  });

  it("answers a cancelled turn with the protocol's cancelled variant", async () => {
    const server = serve({
      FAKE_PERMISSION: "1",
      FAKE_MODELS: "m",
      FAKE_AWAIT_CANCEL: "1",
    },);

    const { adapter, nextAsk, withdrawn, } = makePermissionAdapter(server,);

    const turn = adapter.prompt("hi",);
    await nextAsk;
    await adapter.cancel();
    await turn;

    const outcome = server.readLog().find((item,): item is Extract<FakeAcpLogEntry, {
      event: "permission_outcome";
    }> => item.event === "permission_outcome");

    expect(outcome?.outcome,).toEqual({ outcome: { outcome: "cancelled", }, },);
    expect(withdrawn(),).toBe(1,);
    expect(adapter.pendingPermission(),).toBeNull();
  });

  it("closing the connection with a parked ask fires onPermissionWithdrawn once", async () => {
    const server = serve({ FAKE_PERMISSION: "1", FAKE_MODELS: "m", },);
    const { adapter, nextAsk, withdrawn, } = makePermissionAdapter(server,);

    const turn = adapter.prompt("hi",);
    await nextAsk;
    expect(adapter.pendingPermission(),).not.toBeNull();

    adapter.close();
    expect(withdrawn(),).toBe(1,);
    expect(adapter.pendingPermission(),).toBeNull();

    // The abandoned turn dies with the transport — surface it as the typed
    // rejection it already is instead of leaving it unhandled.
    await expect(turn,).rejects.toMatchObject({ name: "HarnessAcpError", },);
  });

  it("close without a parked ask does not fire onPermissionWithdrawn", async () => {
    const server = serve({ FAKE_MODELS: "m", },);
    const { adapter, withdrawn, } = makePermissionAdapter(server,);

    await adapter.enumerateModels();
    adapter.close();
    expect(withdrawn(),).toBe(0,);
  });
});
