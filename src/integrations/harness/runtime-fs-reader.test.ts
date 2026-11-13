// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * The `fs/read_text_file` bridge the composed runtime hands a profile: a read
 * is confined to the profile's sandbox root, and a refusal reaches the agent
 * as a typed JSON-RPC error — never as a raw filesystem error.
 *
 * Resource contract (parallel-safe): every test owns a fresh fixture
 * subprocess (startFakeAcp: unique mkdtemp dir, no ports), its own temp dirs
 * and its own runtime; all reaped in afterEach including failure paths. The
 * fixture log is read before the server is stopped (stop removes its dir).
 */
import { afterEach, describe, expect, it, } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import { type FakeAcpLogEntry, type FakeAcpServer, startFakeAcp, } from "./fake-acp-server";
import { createHarnessRuntime, type HarnessRuntime, } from "./runtime";

/** Servers started by the current test; reaped after each. */
const live: FakeAcpServer[] = [];
/** Temp dirs created by the current test; removed after each. */
const dirs: string[] = [];
/** Runtimes composed by the current test; closed after each. */
const runtimes: HarnessRuntime[] = [];

/** Start a fixture and register it for teardown. */
function serve(env: Parameters<typeof startFakeAcp>[0],): FakeAcpServer {
  const server = startFakeAcp(env,);
  live.push(server,);
  return server;
}

/** A temp dir removed after the test. */
function tempDir(prefix: string,): string {
  const dir = mkdtempSync(join(tmpdir(), prefix,),);
  dirs.push(dir,);
  return dir;
}

/** The read the fixture observed. */
function readEntry(
  log: FakeAcpLogEntry[],
): Extract<FakeAcpLogEntry, { event: "read_text" }> | undefined {
  return log.find((item,): item is Extract<FakeAcpLogEntry, { event: "read_text" }> => item.event === "read_text");
}

/** Compose a runtime whose only profile runs in the given sandbox root. */
function runtimeFor(root: string, server: FakeAcpServer,): HarnessRuntime {
  const runtime = createHarnessRuntime({
    acp: {
      enabled: true,
      profiles: [{ name: "p", command: server.argv, tiers: {}, sandboxRoot: root, },],
    },
  },);

  runtimes.push(runtime,);
  return runtime;
}

afterEach(async () => {
  for (const runtime of runtimes.splice(0,)) {
    runtime.registry.connection("p",)?.close();
  }

  while (live.length > 0) { live.pop()?.stop(); }
  while (dirs.length > 0) { rmSync(dirs.pop()!, { recursive: true, force: true, },); }
},);

describe("harness runtime fs/read_text_file bridge (fake ACP fixture)", () => {
  it("serves a file inside the profile's sandbox root", async () => {
    const root = tempDir("harness-acp-sandbox-",);
    const file = join(root, "note.txt",);
    writeFileSync(file, "inside the sandbox", "utf8",);
    const server = serve({ FAKE_MODELS: "m", FAKE_READ_FILE: file, },);
    const runtime = runtimeFor(root, server,);

    await runtime.registry.ensureProbed("p",);
    await runtime.registry.connection("p",)?.prompt("read it",);

    expect(readEntry(server.readLog(),)?.content,).toEqual({ content: "inside the sandbox", },);
  });

  it("refuses a path outside the sandbox root with a typed error", async () => {
    const root = tempDir("harness-acp-sandbox-",);
    const outside = join(tempDir("harness-acp-outside-",), "secret.txt",);
    writeFileSync(outside, "not yours", "utf8",);
    const server = serve({ FAKE_MODELS: "m", FAKE_READ_FILE: outside, },);
    const runtime = runtimeFor(root, server,);

    await runtime.registry.ensureProbed("p",);
    await runtime.registry.connection("p",)?.prompt("read it",);

    expect(readEntry(server.readLog(),)?.content,).toEqual({
      error: { code: -32000, message: "path is outside the sandbox root", },
    },);
  });
});
