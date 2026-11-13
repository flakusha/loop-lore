// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * The capabilities loop-lore advertises in `initialize`: only the ones whose
 * handler exists. An omitted capability means UNSUPPORTED, so advertising a
 * bridge loop-lore does not implement would only invite calls it must refuse.
 *
 * Resource contract (parallel-safe): every test owns a fresh fixture
 * subprocess (startFakeAcp: unique mkdtemp dir, no ports) and a fresh
 * adapter; both reaped in afterEach including failure paths. The fixture log
 * is read before the server is stopped (stop removes its directory).
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

/** The initialize params the fixture observed. */
function initializeParams(log: FakeAcpLogEntry[],): Record<string, unknown> | undefined {
  const entry = log.find((item,): item is Extract<FakeAcpLogEntry, { event: "initialize" }> =>
    item.event === "initialize"
  );

  return entry?.params;
}

afterEach(async () => {
  while (adapters.length > 0) { adapters.pop()?.close(); }
  while (live.length > 0) { live.pop()?.stop(); }
},);

describe("GenericAcpAdapter initialize capabilities (fake ACP fixture)", () => {
  it("advertises fs.readTextFile when a reader is injected", async () => {
    const server = serve({ FAKE_MODELS: "m", FAKE_LOG_PARAMS: "1", },);
    const adapter = new OmpAcpAdapter({
      command: server.argv,
      requestTimeoutMs: LIVE_TIMEOUT_MS,
      readTextFile: async () => "file body",
    },);

    adapters.push(adapter,);

    await adapter.enumerateModels();

    const params = initializeParams(server.readLog(),);
    expect(params?.clientCapabilities,).toEqual({ fs: { readTextFile: true, }, },);
  });

  it("advertises no fs bridge without a reader and no terminal bridge at all", async () => {
    const server = serve({ FAKE_MODELS: "m", FAKE_LOG_PARAMS: "1", },);
    const adapter = new OmpAcpAdapter({ command: server.argv, requestTimeoutMs: LIVE_TIMEOUT_MS, },);
    adapters.push(adapter,);

    await adapter.enumerateModels();

    const params = initializeParams(server.readLog(),);
    expect(params?.clientCapabilities,).toEqual({ fs: { readTextFile: false, }, },);
    expect(params?.clientCapabilities,).not.toHaveProperty("terminal",);
  });
});
