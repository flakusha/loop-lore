// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * The cost a harness reports in `usage_update` reaches the turn — the figure
 * the spend views and the persisted `token_cost` read.
 *
 * Resource contract (parallel-safe): every test owns a fresh fixture
 * subprocess (startFakeAcp: unique mkdtemp dir, no ports) and a fresh
 * adapter; both reaped in afterEach including failure paths.
 */
import { afterEach, describe, expect, it, } from "bun:test";
import { type FakeAcpServer, startFakeAcp, } from "./fake-acp-server";
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

/** An adapter bound to the fixture, registered for teardown. */
function adapterFor(server: FakeAcpServer,): OmpAcpAdapter {
  const adapter = new OmpAcpAdapter({ command: server.argv, requestTimeoutMs: LIVE_TIMEOUT_MS, },);
  adapters.push(adapter,);
  return adapter;
}

afterEach(async () => {
  while (adapters.length > 0) { adapters.pop()?.close(); }
  while (live.length > 0) { live.pop()?.stop(); }
},);

describe("GenericAcpAdapter usage cost (fake ACP fixture)", () => {
  it("carries the cost the harness reported in usage_update", async () => {
    const server = serve({
      FAKE_MODELS: "m",
      FAKE_EVENTS: JSON.stringify([
        { sessionUpdate: "usage_update", used: 120, size: 1000, cost: { amount: 0.012, currency: "USD", }, },
      ],),
    },);

    const adapter = adapterFor(server,);

    const turn = await adapter.prompt("hi",);

    expect(turn.costUsd,).toBe(0.012,);
  });

  it("carries a cost the harness reported as zero", async () => {
    // A reported zero is a cost, not a missing one: null means the harness
    // reported NO cost, 0 means it reported zero.
    const server = serve({
      FAKE_MODELS: "m",
      FAKE_EVENTS: JSON.stringify([
        { sessionUpdate: "usage_update", used: 120, size: 1000, cost: { amount: 0, currency: "USD", }, },
      ],),
    },);

    const adapter = adapterFor(server,);

    const turn = await adapter.prompt("hi",);

    expect(turn.costUsd,).toBe(0,);
  });

  it("reports no cost when the harness reported none", async () => {
    const server = serve({
      FAKE_MODELS: "m",
      FAKE_EVENTS: JSON.stringify([{ sessionUpdate: "usage_update", used: 120, size: 1000, },],),
    },);

    const adapter = adapterFor(server,);

    const turn = await adapter.prompt("hi",);

    expect(turn.costUsd,).toBeNull();
  });

  it("carries the cost when the prompt response carries no usage", async () => {
    // The stable ACP v1 PromptResponse has no `usage` property at all, so a
    // conformant harness reports its cost ONLY through the usage_update.
    const server = serve({
      FAKE_MODELS: "m",
      FAKE_NO_USAGE: "1",
      FAKE_EVENTS: JSON.stringify([
        { sessionUpdate: "usage_update", used: 120, size: 1000, cost: { amount: 0.5, currency: "USD", }, },
      ],),
    },);

    const adapter = adapterFor(server,);

    const turn = await adapter.prompt("hi",);

    expect(turn.usage,).toBeNull();
    expect(turn.costUsd,).toBe(0.5,);
  });

  it("reports no cost for a currency that is not USD", async () => {
    const server = serve({
      FAKE_MODELS: "m",
      FAKE_EVENTS: JSON.stringify([
        { sessionUpdate: "usage_update", used: 120, size: 1000, cost: { amount: 12, currency: "EUR", }, },
      ],),
    },);

    const adapter = adapterFor(server,);

    const turn = await adapter.prompt("hi",);

    expect(turn.costUsd,).toBeNull();
  });

  it("carries the cost a usage_update reported after the prompt response", async () => {
    // The ACP cost rides a session notification, so it may land AFTER the
    // response; the turn waits for it instead of dropping it.
    const server = serve({
      FAKE_MODELS: "m",
      FAKE_LATE_USAGE: JSON.stringify({
        sessionUpdate: "usage_update",
        used: 120,
        size: 1000,
        cost: { amount: 0.25, currency: "USD", },
      },),
    },);

    const adapter = adapterFor(server,);

    const turn = await adapter.prompt("hi",);

    expect(turn.costUsd,).toBe(0.25,);
  });

  it("keeps a reported cost when a later usage_update carries none", async () => {
    const server = serve({
      FAKE_MODELS: "m",
      FAKE_EVENTS: JSON.stringify([
        { sessionUpdate: "usage_update", used: 120, size: 1000, cost: { amount: 0.25, currency: "USD", }, },
        { sessionUpdate: "usage_update", used: 130, size: 1000, },
      ],),
    },);

    const adapter = adapterFor(server,);

    const turn = await adapter.prompt("hi",);

    expect(turn.costUsd,).toBe(0.25,);
  });
});
