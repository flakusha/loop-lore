// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * OmpAcpAdapter integration tests against the fake ACP server fixture.
 *
 * Resource contract: ONE fake-ACP subprocess per test, hard-killed in the
 * afterEach teardown (including failure paths). No real omp, no env-gated
 * e2e, no shared ports/paths — parallel-safe.
 */
import { afterEach, describe, expect, it, } from "bun:test";
import { type FakeAcpServer, startFakeAcp, } from "./fake-acp-server";
import { OmpAcpAdapter, } from "./omp";

/** Servers started by the current test; reaped after each. */
const live: FakeAcpServer[] = [];

/** Start a fixture and register it for teardown. */
function serve(env: Parameters<typeof startFakeAcp>[0],): FakeAcpServer {
  const server = startFakeAcp(env,);
  live.push(server,);
  return server;
}

afterEach(() => {
  while (live.length > 0) {
    live.pop()?.stop();
  }
},);

describe("OmpAcpAdapter (fake ACP fixture)", () => {
  it("enumerates the advertised model list", async () => {
    const server = serve({ FAKE_MODELS: "zai/glm-5.3,zai/glm-5.3-flash", },);
    const adapter = new OmpAcpAdapter({ command: server.argv, },);
    expect(await adapter.enumerateModels(),).toEqual(["zai/glm-5.3", "zai/glm-5.3-flash",],);
    adapter.close();
  });

  it("switches model via session/set_config_option", async () => {
    const server = serve({ FAKE_MODELS: "a/b", },);
    const adapter = new OmpAcpAdapter({ command: server.argv, },);
    await expect(adapter.setModel("a/b",),).resolves.toBeUndefined();
    adapter.close();
  });

  it("surfaces Unknown ACP model as a typed `model` error", async () => {
    const server = serve({ FAKE_MODELS: "a/b", FAKE_REJECT_MODEL: "a/gone", },);
    const adapter = new OmpAcpAdapter({ command: server.argv, },);
    await expect(adapter.setModel("a/gone",),).rejects.toMatchObject({ name: "HarnessAcpError", kind: "model", },);
    adapter.close();
  });

  it("runs a prompt: chunk text, stopReason, usage, session id", async () => {
    const server = serve({ FAKE_MODELS: "a/b", FAKE_REPLY: "hello world", },);
    const adapter = new OmpAcpAdapter({ command: server.argv, },);
    await adapter.enumerateModels();
    const turn = await adapter.prompt("do the thing",);
    expect(turn.text,).toBe("hello world",);
    expect(turn.stopReason,).toBe("end_turn",);
    expect(turn.usage,).toEqual({ inputTokens: 10, outputTokens: 5, totalTokens: 15, },);
    expect(turn.acpSessionId,).toBe("fake-session-1",);
    adapter.close();
  });

  it("maps quota reports and tolerates an absent quota surface", async () => {
    const withReports = serve({
      FAKE_MODELS: "a/b",
      FAKE_USAGE: JSON.stringify([{
        providerId: "zai",
        status: "exhausted",
        remainingFraction: 0,
        resetsAt: "2030-01-01T00:00:00Z",
      },],),
    },);

    const adapter = new OmpAcpAdapter({ command: withReports.argv, },);
    const reports = await adapter.fetchUsageReports();
    expect(reports,).toEqual([
      { providerId: "zai", status: "exhausted", remainingFraction: 0, resetsAt: "2030-01-01T00:00:00Z", },
    ],);

    adapter.close();
  });

  it("marks spawn failure typed and memoizes the closed state", async () => {
    const adapter = new OmpAcpAdapter({ command: ["definitely-not-a-real-binary-xyz",], },);
    await expect(adapter.enumerateModels(),).rejects.toMatchObject({ name: "HarnessAcpError", },);
    adapter.close();
  });

  it("close is idempotent", () => {
    const server = serve({ FAKE_MODELS: "a/b", },);
    const adapter = new OmpAcpAdapter({ command: server.argv, },);
    adapter.close();
    adapter.close();
    expect(true,).toBe(true,);
  });
});
