// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * GenericAcpAdapter permission-surface tests over the fake ACP fixture: the
 * `session/request_permission` round trip in the protocol's answer shape
 * (`selected` with the advertised option id, or `cancelled`), the spec-legal
 * refusal when no option can carry the decision, the session-scope refusal,
 * and the withdrawal callback when a closed connection abandons a parked ask
 * (TASK-permission-approval-flow).
 *
 * Resource contract (parallel-safe): every test owns a fresh fixture
 * subprocess (startFakeAcp: unique mkdtemp dir, no ports) and a fresh
 * adapter; both reaped in afterEach including failure paths. Synchronization
 * is promise-based (the onPermissionRequest callback resolves a promise),
 * never a sleep — tests pass in any order.
 */
import { afterEach, describe, expect, it, } from "bun:test";
import { type PendingPermission, PermissionDecisionRefusedError, } from "./adapter-types";
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

/**
 * The answer shapes the fixture observed, sorted so the wire order does not
 * matter: `cancelled` or `selected:<optionId>`.
 */
function outcomeShapes(server: FakeAcpServer,): string[] {
  return server.readLog()
    .filter((item,): item is Extract<FakeAcpLogEntry, { event: "permission_outcome" }> =>
      item.event === "permission_outcome"
    )
    .map((item,) => {
      const answer = item.outcome as { outcome?: { outcome?: string; optionId?: string } };
      return answer.outcome?.outcome === "cancelled" ? "cancelled" : `selected:${answer.outcome?.optionId ?? ""}`;
    },)
    .sort();
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

  it("answers the cancelled variant when no option can carry the decision", async () => {
    const server = serve({
      FAKE_PERMISSION: "1",
      FAKE_MODELS: "m",
      FAKE_PERMISSION_KINDS: "ask_user,ask_user",
    },);

    const { adapter, nextAsk, } = makePermissionAdapter(server,);

    const turn = adapter.prompt("hi",);
    await nextAsk;
    // The harness could not express the allow, so the caller learns the
    // decision did not take effect.
    expect(() => adapter.respondPermission({ outcome: "allow_once", },)).toThrow(PermissionDecisionRefusedError,);
    await turn;

    const outcome = server.readLog().find((item,): item is Extract<FakeAcpLogEntry, {
      event: "permission_outcome";
    }> => item.event === "permission_outcome");

    // No advertised option can carry the decision and the harness advertised
    // no rejection option: the protocol's `cancelled` outcome is the only
    // shape left, and it carries the refusal.
    expect(outcome?.outcome,).toEqual({ outcome: { outcome: "cancelled", }, },);

    expect(adapter.pendingPermission(),).toBeNull();
  });

  it("answers the cancelled variant when the harness advertised no options at all", async () => {
    const server = serve({
      FAKE_PERMISSION: "1",
      FAKE_MODELS: "m",
      FAKE_PERMISSION_NO_OPTIONS: "1",
    },);

    const { adapter, nextAsk, } = makePermissionAdapter(server,);

    const turn = adapter.prompt("hi",);
    await nextAsk;
    // The harness could not express the allow, so the caller learns the
    // decision did not take effect.
    expect(() => adapter.respondPermission({ outcome: "allow_once", },)).toThrow(PermissionDecisionRefusedError,);
    await turn;

    const outcome = server.readLog().find((item,): item is Extract<FakeAcpLogEntry, {
      event: "permission_outcome";
    }> => item.event === "permission_outcome");

    expect(outcome?.outcome,).toEqual({ outcome: { outcome: "cancelled", }, },);

    expect(adapter.pendingPermission(),).toBeNull();
  });

  it("answers a denial that cannot be carried with the cancelled variant", async () => {
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

    // A denial that cannot be expressed is refused - it never turns into an
    // allow.
    expect(outcome?.outcome,).toEqual({ outcome: { outcome: "cancelled", }, },);
  });

  it("delivers a denial as the cancelled variant when the harness advertised only allow options", async () => {
    const server = serve({
      FAKE_PERMISSION: "1",
      FAKE_MODELS: "m",
      FAKE_PERMISSION_KINDS: "allow_once,allow_once",
    },);

    const { adapter, nextAsk, } = makePermissionAdapter(server,);

    const turn = adapter.prompt("hi",);
    await nextAsk;
    // No advertised option can carry the denial, so it goes out as the
    // protocol's cancellation: the tool call is refused and the decision IS
    // delivered (the caller is not told the decision failed).
    expect(() => adapter.respondPermission({ outcome: "reject_once", },)).not.toThrow();
    await turn;

    const outcome = server.readLog().find((item,): item is Extract<FakeAcpLogEntry, {
      event: "permission_outcome";
    }> => item.event === "permission_outcome");

    expect(outcome?.outcome,).toEqual({ outcome: { outcome: "cancelled", }, },);
  });

  it("delivers a denial as the cancelled variant when the harness advertised no options", async () => {
    const server = serve({
      FAKE_PERMISSION: "1",
      FAKE_MODELS: "m",
      FAKE_PERMISSION_NO_OPTIONS: "1",
    },);

    const { adapter, nextAsk, } = makePermissionAdapter(server,);

    const turn = adapter.prompt("hi",);
    await nextAsk;
    // Nothing to select: the cancellation is the only shape a refusal can take,
    // and the decision still lands.
    expect(() => adapter.respondPermission({ outcome: "reject_once", },)).not.toThrow();
    await turn;

    const outcome = server.readLog().find((item,): item is Extract<FakeAcpLogEntry, {
      event: "permission_outcome";
    }> => item.event === "permission_outcome");

    expect(outcome?.outcome,).toEqual({ outcome: { outcome: "cancelled", }, },);
  });

  it("delivers an approval the advertised allow option carries", async () => {
    const server = serve({
      FAKE_PERMISSION: "1",
      FAKE_MODELS: "m",
      FAKE_PERMISSION_KINDS: "allow_once,allow_once",
    },);

    const { adapter, nextAsk, } = makePermissionAdapter(server,);

    const turn = adapter.prompt("hi",);
    await nextAsk;
    // Only allow-polarity options advertised, but an approval rides the
    // advertised allow option: the decision is delivered.
    expect(() => adapter.respondPermission({ outcome: "allow_once", },)).not.toThrow();
    await turn;

    const outcome = server.readLog().find((item,): item is Extract<FakeAcpLogEntry, {
      event: "permission_outcome";
    }> => item.event === "permission_outcome");

    expect(outcome?.outcome,).toEqual({ outcome: { outcome: "selected", optionId: "allow", }, },);
  });

  it("refuses an approval the harness cannot express when it advertised only allow options", async () => {
    const server = serve({
      FAKE_PERMISSION: "1",
      FAKE_MODELS: "m",
      FAKE_PERMISSION_KINDS: "allow_always,allow_always",
    },);

    const { adapter, nextAsk, } = makePermissionAdapter(server,);

    const turn = adapter.prompt("hi",);
    await nextAsk;
    // A one-shot approval never rides an "always" option, and no rejection
    // option is advertised: the harness refused the decision.
    expect(() => adapter.respondPermission({ outcome: "allow_once", },)).toThrow(PermissionDecisionRefusedError,);
    await turn;

    const outcome = server.readLog().find((item,): item is Extract<FakeAcpLogEntry, {
      event: "permission_outcome";
    }> => item.event === "permission_outcome");

    expect(outcome?.outcome,).toEqual({ outcome: { outcome: "cancelled", }, },);
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

  it("refuses with the harness's own rejection option when no allow option can carry the decision", async () => {
    const server = serve({
      FAKE_PERMISSION: "1",
      FAKE_MODELS: "m",
      FAKE_PERMISSION_KINDS: "ask_user,reject_once",
    },);

    const { adapter, nextAsk, } = makePermissionAdapter(server,);

    const turn = adapter.prompt("hi",);
    await nextAsk;
    // The harness advertised a rejection option, so the refusal rides it -
    // but the ALLOW it carried is not what the harness agreed to.
    expect(() => adapter.respondPermission({ outcome: "allow_once", },)).toThrow(PermissionDecisionRefusedError,);
    await turn;

    const outcome = server.readLog().find((item,): item is Extract<FakeAcpLogEntry, {
      event: "permission_outcome";
    }> => item.event === "permission_outcome");

    // The harness advertised a rejection option: the refusal rides it, so the
    // request is ANSWERED - never failed with a JSON-RPC error.
    expect(outcome?.outcome,).toEqual({ outcome: { outcome: "selected", optionId: "reject", }, },);
  });

  it("refuses a permission ask that names another session", async () => {
    const server = serve({
      FAKE_PERMISSION: "1",
      FAKE_MODELS: "m",
      FAKE_ASK_SESSION_ID: "other-session",
    },);

    const { adapter, } = makePermissionAdapter(server,);

    const turn = adapter.prompt("hi",);
    await turn;

    const outcome = server.readLog().find((item,): item is Extract<FakeAcpLogEntry, {
      event: "permission_outcome";
    }> => item.event === "permission_outcome");

    // The spec requires the ask to name the session it belongs to: a request
    // for another session is refused as invalid params, never answered.
    expect(outcome?.outcome,).toEqual({
      error: { code: -32602, message: 'session/request_permission names session "other-session"', },
    },);

    expect(adapter.pendingPermission(),).toBeNull();
  });

  it("answers a concurrent ask with the cancelled variant so no ask is left hanging", async () => {
    const server = serve({
      FAKE_PERMISSION: "1",
      FAKE_MODELS: "m",
      FAKE_PERMISSION_TWICE: "1",
    },);

    const { adapter, nextAsk, } = makePermissionAdapter(server,);

    const turn = adapter.prompt("hi",);
    await nextAsk;
    adapter.respondPermission({ outcome: "allow_once", },);
    await turn;

    // The second ask is refused spec-legally instead of orphaning the first.
    expect(outcomeShapes(server,),).toEqual(["cancelled", "selected:allow",],);
  });

  it("answers every pending ask of a cancelled turn with the cancelled variant", async () => {
    const server = serve({
      FAKE_PERMISSION: "1",
      FAKE_MODELS: "m",
      FAKE_PERMISSION_TWICE: "1",
      FAKE_AWAIT_CANCEL: "1",
    },);

    const { adapter, nextAsk, withdrawn, } = makePermissionAdapter(server,);

    const turn = adapter.prompt("hi",);
    await nextAsk;
    await adapter.cancel();
    await turn;

    // Every pending ask of the cancelled turn is answered - none is left
    // hanging on the wire.
    expect(outcomeShapes(server,),).toEqual(["cancelled", "cancelled",],);
    expect(withdrawn(),).toBe(1,);
  });
});
