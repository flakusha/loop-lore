// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * ACP v2 protocol negotiation: the requested version is a per-connection
 * option, the negotiated version comes from initialize's RESULT, and a
 * v2-only method is attempted only when the agent advertised it.
 *
 * Resource contract (parallel-safe): every test owns a fresh fixture
 * subprocess (unique mkdtemp dir, no ports) and a fresh adapter; both reaped
 * in afterEach including failure paths. The fixture log is read before stop.
 */
import { afterEach, describe, expect, it, } from "bun:test";
import { type FakeAcpLogEntry, type FakeAcpServer, startFakeAcp, } from "./fake-acp-server";
import { OmpAcpAdapter, } from "./omp";

/** Servers started by the current test; reaped after each. */
const live: FakeAcpServer[] = [];
/** Adapters created by the current test; reaped after each. */
const adapters: OmpAcpAdapter[] = [];

/** Per-request timeout for success paths (survives loaded parallel runners). */
const LIVE_TIMEOUT_MS = 4000;

/** Start a fixture and register it for teardown. */
function serve(env: Parameters<typeof startFakeAcp>[0],): FakeAcpServer {
  const server = startFakeAcp(env,);
  live.push(server,);
  return server;
}

/** Create an adapter requesting `protocolVersion`, registered for teardown. */
function makeAdapter(server: FakeAcpServer, protocolVersion?: number,): OmpAcpAdapter {
  const adapter = new OmpAcpAdapter({
    command: server.argv,
    requestTimeoutMs: LIVE_TIMEOUT_MS,
    ...(protocolVersion === undefined ? {} : { protocolVersion, }),
  },);

  adapters.push(adapter,);
  return adapter;
}

/** The initialize params the fixture observed. */
function initializeParams(log: FakeAcpLogEntry[],): Record<string, unknown> | undefined {
  const entry = log.find((item,): item is Extract<FakeAcpLogEntry, { event: "initialize" }> =>
    item.event === "initialize"
  );

  return entry?.params;
}

/** Whether the fixture observed a `session/delete` request. */
function deleteAttempted(log: FakeAcpLogEntry[],): boolean {
  return log.some((item,) => item.event === "delete_session");
}

afterEach(async () => {
  while (adapters.length > 0) { adapters.pop()?.close(); }
  while (live.length > 0) { live.pop()?.stop(); }
},);

describe("GenericAcpAdapter ACP v2 negotiation (fake ACP fixture)", () => {
  it("requests v2, records the negotiated version, and calls an advertised v2-only method", async () => {
    const server = serve({
      FAKE_MODELS: "m",
      FAKE_LOG_PARAMS: "1",
      FAKE_PROTOCOL_VERSION: "2",
      FAKE_CAPABILITIES: '{"session":{"delete":{}}}',
    },);

    const adapter = makeAdapter(server, 2,);

    await adapter.enumerateModels();

    expect(initializeParams(server.readLog(),)?.protocolVersion,).toBe(2,);
    expect(adapter.negotiatedProtocolVersion(),).toBe(2,);

    await adapter.deleteSession("fake-session-1",);
    expect(deleteAttempted(server.readLog(),),).toBe(true,);
  });

  it("never calls session/delete when the agent did not advertise it", async () => {
    const server = serve({
      FAKE_MODELS: "m",
      FAKE_LOG_PARAMS: "1",
      FAKE_PROTOCOL_VERSION: "2",
      FAKE_CAPABILITIES: '{"session":{}}',
    },);

    const adapter = makeAdapter(server, 2,);

    await adapter.enumerateModels();
    expect(adapter.negotiatedProtocolVersion(),).toBe(2,);

    await expect(adapter.deleteSession("fake-session-1",),).rejects.toThrow(/not advertised/,);
    expect(deleteAttempted(server.readLog(),),).toBe(false,);
  });

  it("records a downgraded v1 selection and gates v2-only methods off", async () => {
    const server = serve({
      FAKE_MODELS: "m",
      FAKE_LOG_PARAMS: "1",
      FAKE_PROTOCOL_VERSION: "1",
    },);

    const adapter = makeAdapter(server, 2,);

    await adapter.enumerateModels();
    expect(initializeParams(server.readLog(),)?.protocolVersion,).toBe(2,);
    expect(adapter.negotiatedProtocolVersion(),).toBe(1,);

    await expect(adapter.deleteSession("fake-session-1",),).rejects.toThrow(/not advertised/,);
    expect(deleteAttempted(server.readLog(),),).toBe(false,);
  });
});
