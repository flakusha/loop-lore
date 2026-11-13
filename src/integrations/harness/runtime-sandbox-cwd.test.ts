// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * The session runs in the directory the permission gate judges: a profile's
 * configured `sandboxRoot` is the adapter's cwd, so the agent works inside
 * the sandbox instead of somewhere else. Without a configured root the
 * session keeps the process cwd.
 *
 * Resource contract (parallel-safe): every test owns a fresh fixture
 * subprocess (startFakeAcp: unique mkdtemp dir, no ports) and its own
 * sandbox temp dir; both reaped in afterEach including failure paths. The
 * fixture log is read before the server is stopped (stop removes its dir).
 */
import { afterEach, describe, expect, it, } from "bun:test";
import { mkdtempSync, rmSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import { type FakeAcpLogEntry, type FakeAcpServer, startFakeAcp, } from "./fake-acp-server";
import { createHarnessRuntime, } from "./runtime";

/** Servers started by the current test; reaped after each. */
const live: FakeAcpServer[] = [];
/** Sandbox dirs created by the current test; removed after each. */
const dirs: string[] = [];

/** Start a fixture and register it for teardown. */
function serve(env: Parameters<typeof startFakeAcp>[0],): FakeAcpServer {
  const server = startFakeAcp(env,);
  live.push(server,);
  return server;
}

/** A sandbox temp dir, removed after the test. */
function sandboxDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "harness-acp-sandbox-",),);
  dirs.push(dir,);
  return dir;
}

/** The session/new params the fixture observed. */
function sessionParams(log: FakeAcpLogEntry[],): Record<string, unknown> | undefined {
  const entry = log.find((item,): item is Extract<FakeAcpLogEntry, { event: "session_new" }> =>
    item.event === "session_new"
  );

  return entry?.params;
}

afterEach(async () => {
  while (live.length > 0) { live.pop()?.stop(); }
  while (dirs.length > 0) { rmSync(dirs.pop()!, { recursive: true, force: true, },); }
},);

describe("harness runtime session cwd (fake ACP fixture)", () => {
  it("runs the session in the profile's sandbox root", async () => {
    const root = sandboxDir();
    const server = serve({ FAKE_MODELS: "m", FAKE_LOG_PARAMS: "1", },);
    const runtime = createHarnessRuntime({
      acp: {
        enabled: true,
        profiles: [{ name: "p", command: server.argv, tiers: {}, sandboxRoot: root, },],
      },
    },);

    await runtime.registry.ensureProbed("p",);

    expect(sessionParams(server.readLog(),)?.cwd,).toBe(root,);
  });

  it("keeps the process cwd when the profile configures no sandbox root", async () => {
    const server = serve({ FAKE_MODELS: "m", FAKE_LOG_PARAMS: "1", },);
    const runtime = createHarnessRuntime({
      acp: {
        enabled: true,
        profiles: [{ name: "p", command: server.argv, tiers: {}, },],
      },
    },);

    await runtime.registry.ensureProbed("p",);

    expect(sessionParams(server.readLog(),)?.cwd,).toBe(process.cwd(),);
  });
});
